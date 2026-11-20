import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";

/**
 * アカウント管理(SPEC_v4 §3.4, §7.1, §9)
 *
 * - リカバリーコード: CSPRNG の 60bit(base32 12 文字)を 10 個発行し、
 *   DB には**ソルト付きの低速ハッシュ**(scrypt)だけを保存する。使用は 1 回限り
 * - パスワード再設定・変更では、その利用者以外のセッションをすべて失効させる
 * - 退会時は認証情報・個人データを削除し、受験結果は匿名化して残す
 */

export const RECOVERY_CODE_COUNT = 10;

/** Crockford Base32(紛らわしい I, L, O, U を除く) */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const randomCode = (length: number): string => {
  // 32 文字ちょうどなので剰余バイアスなし
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % 32];
  return out;
};

/** 入力のゆれ(小文字・空白・ハイフン・O/I/L の誤入力)を吸収する */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** 表示用に 4 文字ずつ区切る(例: AB12-CD34-EF56) */
export function formatRecoveryCode(code: string): string {
  return normalizeRecoveryCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

export type IssuedRecoveryCodes = { codes: string[]; created: number };

/**
 * リカバリーコードを再発行する(既存のコードはすべて失効)。
 * 戻り値の平文はこの応答でのみ扱い、DB には保存しない。
 */
export async function regenerateRecoveryCodes(
  userId: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<IssuedRecoveryCodes> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode(randomCode(12)));
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.recoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hashPassword(normalizeRecoveryCode(code)) })),
  });
  return { codes, created: codes.length };
}

/** 未使用のリカバリーコード数(設定画面の表示用) */
export async function unusedRecoveryCodeCount(userId: string): Promise<number> {
  return db.recoveryCode.count({ where: { userId, usedAt: null } });
}

/** 指定ユーザーのセッションを失効させる(keepHash を渡すとそのセッションは残す) */
export async function revokeSessions(
  userId: string,
  keepTokenHash?: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<number> {
  const result = await tx.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export type PasswordResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "no_codes" };

/**
 * リカバリーコードによるパスワード再設定。
 *
 * 使用済み更新とパスワード変更を同一トランザクションで行う(§9)。
 * どのコードも一致しない場合は同じ結果を返し、有効性の手がかりを与えない。
 */
export async function resetPasswordWithRecoveryCode(input: {
  loginId: string;
  code: string;
  newPassword: string;
}): Promise<PasswordResetResult> {
  const user = await db.user.findFirst({
    where: { loginId: { equals: input.loginId, mode: "insensitive" }, deletedAt: null },
    select: { id: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return { ok: false, reason: "invalid" };

  const candidates = await db.recoveryCode.findMany({
    where: { userId: user.id, usedAt: null },
    select: { id: true, codeHash: true },
  });
  if (candidates.length === 0) return { ok: false, reason: "no_codes" };

  const normalized = normalizeRecoveryCode(input.code);
  const matched = candidates.find((candidate) => verifyPassword(candidate.codeHash, normalized));
  if (!matched) return { ok: false, reason: "invalid" };

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      // 同時に 2 回使われないよう、未使用のものだけを更新する
      const used = await tx.recoveryCode.updateMany({
        where: { id: matched.id, usedAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) throw new Error("recovery code already used");

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(input.newPassword),
          passwordChangedAt: now,
          mustChangePassword: false,
        },
      });
      await revokeSessions(user.id, undefined, tx);
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, userId: user.id };
}

export type ChangePasswordResult = { ok: true } | { ok: false; reason: "invalid_current" | "same" };

/** ログイン中のパスワード変更。他のセッションは失効させる(§3.4) */
export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  keepTokenHash?: string;
}): Promise<ChangePasswordResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return { ok: false, reason: "invalid_current" };
  if (!verifyPassword(user.passwordHash, input.currentPassword)) {
    return { ok: false, reason: "invalid_current" };
  }
  if (input.currentPassword === input.newPassword) return { ok: false, reason: "same" };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: hashPassword(input.newPassword),
        passwordChangedAt: now,
        mustChangePassword: false,
      },
    });
    await revokeSessions(input.userId, input.keepTokenHash, tx);
  });
  return { ok: true };
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "invalid_password" };

/**
 * 退会(§9 削除・保持)。
 *
 * - 認証情報(パスワード・セッション・リカバリーコード・メンバー関係・ブックマーク)を削除
 * - 本人が owner のブックは論理削除(他者の受験履歴は FK 連鎖で消えないよう残す)
 * - 受験結果は `userId` を NULL にして `anonymizedAt` を設定し、統計用にのみ残す
 * - ログイン ID は解放し、行は削除済みとして残す(他者からの参照を壊さない)
 */
export async function deleteAccount(input: {
  userId: string;
  password: string;
}): Promise<DeleteAccountResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return { ok: false, reason: "invalid_password" };
  if (!verifyPassword(user.passwordHash, input.password)) {
    return { ok: false, reason: "invalid_password" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.attempt.updateMany({
      where: { userId: input.userId, anonymizedAt: null },
      data: { userId: null, anonymizedAt: now },
    });
    await tx.book.updateMany({
      where: { ownerId: input.userId, deletedAt: null },
      data: { deletedAt: now },
    });
    await tx.bookMember.deleteMany({ where: { userId: input.userId } });
    await tx.bookmark.deleteMany({ where: { userId: input.userId } });
    await tx.recoveryCode.deleteMany({ where: { userId: input.userId } });
    await tx.session.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: {
        loginId: null,
        passwordHash: null,
        name: "",
        mustChangePassword: false,
        deletedAt: now,
      },
    });
  });
  return { ok: true };
}

/** 一時パスワードの有効期限(既定 24 時間)。期限切れはログインさせない */
export const TEMP_PASSWORD_TTL_HOURS = 24;

export function isTempPasswordExpired(user: {
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
}): boolean {
  if (!user.mustChangePassword) return false;
  if (!user.passwordChangedAt) return false;
  const ttlMs = TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000;
  return Date.now() - user.passwordChangedAt.getTime() > ttlMs;
}

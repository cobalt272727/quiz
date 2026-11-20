import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { serverEnv } from "./env";
import { hashPassword, verifyPassword } from "./password";

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export { hashPassword, verifyPassword, SCRYPT } from "./password";

/**
 * 認証(SPEC_v4 §7.1)
 *
 * - パスワードは scrypt(N=16384, r=8, p=1)でハッシュ化して保存する
 * - セッションは不透明トークンを Cookie に置き、DB には SHA-256 ハッシュだけを保存する
 * - 失効・期限切れは DB の Session で判定する(クッキーだけを信用しない)
 */

export const SESSION_COOKIE = "qb_session";

export type SessionUser = Pick<User, "id" | "loginId" | "name" | "role"> & {
  mustChangePassword: boolean;
};

const toSessionUser = (user: User): SessionUser => ({
  id: user.id,
  loginId: user.loginId,
  name: user.name,
  role: user.role,
  mustChangePassword: user.mustChangePassword,
});

/** 現在のリクエストに載っているセッショントークンのハッシュ(パスワード変更時に自分を残す) */
export async function currentSessionTokenHash(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : undefined;
}

/** セッションを作り、Cookie を設定する。トークンは戻り値でのみ扱う */
export async function createSession(userId: string, userAgent = ""): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + serverEnv.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, userAgent: userAgent.slice(0, 300) },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.nodeEnv === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** ログイン中のユーザー。未ログイン・失効・停止・削除済みは null(§3.4) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.deletedAt || session.user.suspendedAt) return null;

  // 最終利用時刻は 5 分間隔で更新する(毎リクエストの書き込みを避ける)
  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  }
  return toSessionUser(session.user);
}

/** ログイン ID の正規化(前後空白の除去のみ。大文字小文字は DB の式インデックスで一意) */
export const normalizeLoginId = (value: string): string => value.trim();

export type UserWithSecret = Prisma.UserGetPayload<Record<string, never>>;

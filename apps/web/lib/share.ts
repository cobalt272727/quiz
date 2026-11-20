import { randomBytes } from "node:crypto";
import type { Book } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./auth";

/**
 * 共有リンク(SPEC_v4 §3.5, §7.8)
 *
 * - ブック共有: `Book.shareTokenHash`(visibility = link のとき)
 * - 結果共有: `ShareResult.tokenHash`(点数のみ。既定 30 日)
 * どちらも平文トークンは発行時にしか返さず、DB には SHA-256 のみ保存する。
 */

export const RESULT_SHARE_TTL_DAYS = 30;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type IssueResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "not_found" | "forbidden" | "not_link" };

/** ブックの共有リンクを発行する(再発行すると以前のリンクは無効になる) */
export async function issueBookShareToken(
  bookId: string,
  ownerId: string,
): Promise<IssueResult> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, ownerId: true, deletedAt: true, visibility: true },
  });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };
  if (book.ownerId !== ownerId) return { ok: false, reason: "forbidden" };
  if (book.visibility !== "link") return { ok: false, reason: "not_link" };

  const token = newToken();
  await db.book.update({
    where: { id: bookId },
    data: { shareTokenHash: sha256(token) },
  });
  return { ok: true, token, expiresAt: new Date(Number.MAX_SAFE_INTEGER) };
}

export async function revokeBookShareToken(bookId: string, ownerId: string): Promise<boolean> {
  const result = await db.book.updateMany({
    where: { id: bookId, ownerId, deletedAt: null },
    data: { shareTokenHash: null },
  });
  return result.count > 0;
}

/** 共有トークンからブックを解決する(非公開化・削除・失効は不可) */
export async function resolveBookByToken(token: string): Promise<Book | null> {
  if (!token || token.length > 200) return null;
  const book = await db.book.findUnique({ where: { shareTokenHash: sha256(token) } });
  if (!book) return null;
  if (book.deletedAt || book.hiddenByAdmin) return null;
  if (book.visibility !== "link") return null;
  return book;
}

/** 結果共有リンクを発行する(既にあれば期限を更新して作り直す) */
export async function issueResultShare(input: {
  attemptId: string;
  userId: string | null;
  guestTokenHash: string | null;
}): Promise<IssueResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    select: { id: true, userId: true, guestTokenHash: true, status: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  const owned =
    (attempt.userId && input.userId && attempt.userId === input.userId) ||
    (!attempt.userId && attempt.guestTokenHash && attempt.guestTokenHash === input.guestTokenHash);
  if (!owned) return { ok: false, reason: "forbidden" };

  const token = newToken();
  const expiresAt = new Date(Date.now() + RESULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.shareResult.upsert({
    where: { attemptId: attempt.id },
    create: { attemptId: attempt.id, tokenHash: sha256(token), expiresAt },
    update: { tokenHash: sha256(token), expiresAt, revokedAt: null },
  });
  return { ok: true, token, expiresAt };
}

export async function revokeResultShare(input: {
  attemptId: string;
  userId: string | null;
  guestTokenHash: string | null;
}): Promise<boolean> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    select: { userId: true, guestTokenHash: true },
  });
  if (!attempt) return false;
  const owned =
    (attempt.userId && input.userId && attempt.userId === input.userId) ||
    (!attempt.userId && attempt.guestTokenHash && attempt.guestTokenHash === input.guestTokenHash);
  if (!owned) return false;
  const { attemptId } = input;
  const result = await db.shareResult.updateMany({
    where: { attemptId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export type SharedResult = {
  share: { expiresAt: Date };
  attempt: {
    id: string;
    mode: string;
    status: string;
    score: string;
    maxScore: string;
    finishedAt: Date | null;
  };
  book: { id: string; title: string };
};

/** 結果共有トークンを解決する(期限切れ・失効は不可) */
export async function resolveResultShare(token: string): Promise<SharedResult | null> {
  if (!token || token.length > 200) return null;
  const row = await db.shareResult.findUnique({
    where: { tokenHash: sha256(token) },
    include: { attempt: { include: { book: true } } },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  const { attempt } = row;
  if (attempt.status !== "submitted" && attempt.status !== "expired") return null;
  if (attempt.book.deletedAt || attempt.book.hiddenByAdmin) return null;
  return {
    share: { expiresAt: row.expiresAt },
    attempt: {
      id: attempt.id,
      mode: attempt.mode,
      status: attempt.status,
      score: attempt.score.toString(),
      maxScore: attempt.maxScore.toString(),
      finishedAt: attempt.finishedAt,
    },
    book: { id: attempt.book.id, title: attempt.book.title },
  };
}

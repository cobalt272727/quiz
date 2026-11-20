import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { sha256 } from "./auth";
import { serverEnv } from "./env";

/**
 * ゲスト受験の資格情報(SPEC_v4 §7.6)
 *
 * 未ログインでも受験できるようにし、Attempt は Cookie のトークンで識別する。
 * DB には SHA-256 ハッシュだけを保存する(セッションと同じ扱い)。
 */

export const GUEST_COOKIE = "qb_guest";

export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function readGuestTokenHash(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(GUEST_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && existing.length >= 20) return sha256(existing);
  const token = newGuestToken();
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.nodeEnv === "production",
    path: "/",
    maxAge: serverEnv.guestAttemptTtlDays * 24 * 60 * 60,
  });
  return sha256(token);
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}

/** API で使う実行者(ログインユーザー or ゲスト資格情報) */
export async function currentActor(): Promise<{
  userId: string | null;
  guestTokenHash: string | null;
}> {
  const { getCurrentUser } = await import("./auth");
  const user = await getCurrentUser();
  return {
    userId: user?.id ?? null,
    guestTokenHash: user ? null : await readGuestTokenHash(),
  };
}

import { db } from "./db";

/**
 * 試行制限(SPEC_v4 §6.1 RateLimit / §9)
 *
 * DB に置くのは、アプリを複数プロセス・複数インスタンスで動かしても
 * 制限が共有されるようにするため(§2)。
 */

export type RateLimitOptions = {
  /** 同じ窓の中で許す回数 */
  limit: number;
  /** 窓の長さ(ミリ秒) */
  windowMs: number;
  /** 上限を超えたときにロックする時間(ミリ秒) */
  lockMs: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function consumeRateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (!row) {
      await tx.rateLimit.create({ data: { key, windowStartedAt: now, count: 1 } });
      return { ok: true as const };
    }
    if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
      return {
        ok: false as const,
        retryAfterSeconds: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000),
      };
    }
    const windowExpired = now.getTime() - row.windowStartedAt.getTime() > options.windowMs;
    const count = windowExpired ? 1 : row.count + 1;
    const lockedUntil =
      count > options.limit ? new Date(now.getTime() + options.lockMs) : null;
    await tx.rateLimit.update({
      where: { key },
      data: {
        count,
        windowStartedAt: windowExpired ? now : row.windowStartedAt,
        lockedUntil,
      },
    });
    return lockedUntil
      ? { ok: false as const, retryAfterSeconds: Math.ceil(options.lockMs / 1000) }
      : { ok: true as const };
  });
  return result;
}

/** 成功したら制限を解除する(ログイン成功時に使う) */
export async function clearRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** ログイン系の既定値(§9): 15 分で 10 回、超えたら 15 分ロック */
export const LOGIN_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
};

/** 新規登録・回復などの書き込み系 */
export const WRITE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowMs: 10 * 60 * 1000,
  lockMs: 10 * 60 * 1000,
};

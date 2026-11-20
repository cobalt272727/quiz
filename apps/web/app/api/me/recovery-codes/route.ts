import { z } from "zod";
import { db } from "@/lib/db";
import { regenerateRecoveryCodes, unusedRecoveryCodeCount } from "@/lib/account";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ password: z.string().min(1).max(200) });

/** GET /api/me/recovery-codes … 残りのリカバリーコード数 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    return json({
      remaining: await unusedRecoveryCodeCount(user.id),
      total: 10,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/me/recovery-codes … 再発行(§3.4)
 *
 * 既存のコードはすべて失効する。平文はこの応答でのみ返し、DB にはハッシュだけを保存する。
 */
export async function POST(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const limit = await consumeRateLimit(`recovery-codes:${user.id}`, WRITE_LIMIT);
    if (!limit.ok) {
      return fail(
        "rate_limited",
        "試行回数が多すぎます。しばらく待ってからお試しください",
        { retryAfterSeconds: limit.retryAfterSeconds },
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "パスワードを入力してください");

    const account = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!verifyPassword(account?.passwordHash ?? null, parsed.data.password)) {
      return fail("unauthorized", "パスワードが違います");
    }

    const { codes } = await regenerateRecoveryCodes(user.id);
    return json({ recoveryCodes: codes });
  } catch (error) {
    return handleRouteError(error);
  }
}

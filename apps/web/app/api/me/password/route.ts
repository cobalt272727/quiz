import { z } from "zod";
import { changePassword } from "@/lib/account";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { currentSessionTokenHash, getCurrentUser } from "@/lib/auth";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "パスワードは 8 文字以上にしてください").max(200),
});

/** POST /api/me/password … パスワード変更(現パスワード必須。他セッションは失効) */
export async function POST(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const limit = await consumeRateLimit(`password:${user.id}`, WRITE_LIMIT);
    if (!limit.ok) {
      return fail(
        "rate_limited",
        "試行回数が多すぎます。しばらく待ってからお試しください",
        { retryAfterSeconds: limit.retryAfterSeconds },
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "入力内容を確認してください", parsed.error.issues);
    }

    const result = await changePassword({
      userId: user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepTokenHash: await currentSessionTokenHash(),
    });
    if (!result.ok) {
      if (result.reason === "same") {
        return fail("invalid_request", "現在のパスワードと異なるものを設定してください");
      }
      return fail("unauthorized", "現在のパスワードが違います");
    }

    return json({ ok: true, revokedOtherSessions: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

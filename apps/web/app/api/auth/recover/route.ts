import { z } from "zod";
import {
  clientIp,
  clientUserAgent,
  checkSameOrigin,
  fail,
  handleRouteError,
  json,
  readJsonBody,
} from "@/lib/api";
import { clearRateLimit, consumeRateLimit, LOGIN_LIMIT, WRITE_LIMIT } from "@/lib/rate-limit";
import { resetPasswordWithRecoveryCode } from "@/lib/account";
import { createSession, normalizeLoginId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  loginId: z.string().trim().min(1).max(40),
  code: z.string().trim().min(8).max(40),
  newPassword: z.string().min(8, "パスワードは 8 文字以上にしてください").max(200),
  signIn: z.boolean().optional(),
});

/**
 * POST /api/auth/recover … リカバリーコードによるパスワード再設定(§7.1)
 *
 * - 総当たりを避けるため、IP とログイン ID の両方で試行を制限する
 * - どれも一致しない場合は同じ応答を返し、ID やコードの有効性を漏らさない
 * - 成功時はすべてのセッションを失効させ、必要なら新しいセッションを作る
 */
export async function POST(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "入力内容を確認してください", parsed.error.issues);
    }
    const loginId = normalizeLoginId(parsed.data.loginId);
    const ip = clientIp(request);

    const [byIp, byId] = await Promise.all([
      consumeRateLimit(`recover:${ip}`, LOGIN_LIMIT),
      consumeRateLimit(`recover-id:${loginId.toLowerCase()}`, WRITE_LIMIT),
    ]);
    const blocked = !byIp.ok ? byIp : !byId.ok ? byId : null;
    if (blocked) {
      return fail(
        "rate_limited",
        "試行回数が多すぎます。しばらく待ってからお試しください",
        { retryAfterSeconds: blocked.retryAfterSeconds },
        { "retry-after": String(blocked.retryAfterSeconds) },
      );
    }

    const result = await resetPasswordWithRecoveryCode({
      loginId,
      code: parsed.data.code,
      newPassword: parsed.data.newPassword,
    });
    if (!result.ok) {
      return fail(
        "unauthorized",
        "ログイン ID またはリカバリーコードが正しくありません",
      );
    }

    await clearRateLimit(`login:${ip}:${loginId.toLowerCase()}`);

    if (parsed.data.signIn) {
      await createSession(result.userId, clientUserAgent(request));
    }
    return json({ ok: true, signedIn: Boolean(parsed.data.signIn) });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, normalizeLoginId, verifyPassword } from "@/lib/auth";
import { clientIp, clientUserAgent, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { clearRateLimit, consumeRateLimit, LOGIN_LIMIT } from "@/lib/rate-limit";
import { isTempPasswordExpired } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  loginId: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "ID とパスワードを入力してください");

    const loginId = normalizeLoginId(parsed.data.loginId);
    const ip = clientIp(request);
    const key = `login:${ip}:${loginId.toLowerCase()}`;

    const limit = await consumeRateLimit(key, LOGIN_LIMIT);
    if (!limit.ok) {
      return fail(
        "rate_limited",
        "ログイン試行が多すぎます。しばらく待ってからお試しください",
        undefined,
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const user = await db.user.findFirst({
      where: { loginId: { equals: loginId, mode: "insensitive" } },
    });
    // 存在有無を漏らさないよう、どちらも同じ応答にする(§7.1)
    if (!user || user.deletedAt || user.suspendedAt || !verifyPassword(user.passwordHash, parsed.data.password)) {
      return fail("unauthorized", "ID またはパスワードが違います");
    }

    // 管理者発行の一時パスワードは期限付き(§3.4)
    if (isTempPasswordExpired(user)) {
      return fail("forbidden", "一時パスワードの有効期限が切れました。管理者に再発行を依頼してください");
    }

    await clearRateLimit(key);
    await createSession(user.id, clientUserAgent(request));
    return json({
      user: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

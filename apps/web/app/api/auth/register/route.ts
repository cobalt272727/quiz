import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, hashPassword, normalizeLoginId } from "@/lib/auth";
import { clientIp, clientUserAgent, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";
import { regenerateRecoveryCodes } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  loginId: z
    .string()
    .trim()
    .min(3, "ID は 3 文字以上で入力してください")
    .max(40, "ID は 40 文字以内で入力してください")
    .regex(/^[A-Za-z0-9_.-]+$/, "ID は半角英数字と _ . - のみ使えます"),
  password: z.string().min(8, "パスワードは 8 文字以上にしてください").max(200),
  name: z.string().trim().max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "入力内容を確認してください", parsed.error.issues);
    }
    const loginId = normalizeLoginId(parsed.data.loginId);

    // 同一 IP・同一 ID への試行を制限する(IP 単位の総量はブック作成側で抑える)
    const ip = clientIp(request);
    const limit = await consumeRateLimit(`register:${ip}:${loginId.toLowerCase()}`, WRITE_LIMIT);
    if (!limit.ok) {
      return fail("rate_limited", "試行回数が多すぎます。しばらく待ってからお試しください", undefined, {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    const existing = await db.user.findFirst({
      where: { loginId: { equals: loginId, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return fail("conflict", "この ID は既に使われています");

    let user;
    try {
      user = await db.user.create({
        data: {
          loginId,
          passwordHash: hashPassword(parsed.data.password),
          name: parsed.data.name?.trim() || loginId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail("conflict", "この ID は既に使われています");
      }
      throw error;
    }

    // パスワード再設定用のリカバリーコードを発行する。平文はこの応答でのみ返す(§3.4)
    const { codes } = await regenerateRecoveryCodes(user.id);
    await createSession(user.id, clientUserAgent(request));
    return json({
      user: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      recoveryCodes: codes,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { z } from "zod";
import { db } from "@/lib/db";
import { deleteAccount } from "@/lib/account";
import {
  checkSameOrigin,
  clientIp,
  fail,
  handleRouteError,
  json,
  readJsonBody,
} from "@/lib/api";
import { destroyCurrentSession, getCurrentUser } from "@/lib/auth";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().trim().min(1, "表示名を入力してください").max(50),
});

/** PATCH /api/me … 表示名の変更(§3.4 プロフィール) */
export async function PATCH(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const parsed = PatchBody.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "入力内容を確認してください", parsed.error.issues);
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name },
      select: { id: true, loginId: true, name: true, role: true },
    });
    return json({ user: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

const DeleteBody = z.object({ password: z.string().min(1).max(200) });

/**
 * DELETE /api/me … 退会(§3.4, §9)
 *
 * 認証情報を削除し、所有ブックは論理削除、受験結果は匿名化して残す。
 * ログイン ID は解放され、同じ ID を別のユーザーが取得できる。
 */
export async function DELETE(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const limit = await consumeRateLimit(`delete-account:${user.id}:${clientIp(request)}`, WRITE_LIMIT);
    if (!limit.ok) {
      return fail(
        "rate_limited",
        "試行回数が多すぎます。しばらく待ってからお試しください",
        { retryAfterSeconds: limit.retryAfterSeconds },
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const parsed = DeleteBody.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "パスワードを入力してください");

    const result = await deleteAccount({ userId: user.id, password: parsed.data.password });
    if (!result.ok) return fail("unauthorized", "パスワードが違います");

    await destroyCurrentSession();
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

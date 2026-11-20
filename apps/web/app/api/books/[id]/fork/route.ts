import { getCurrentUser } from "@/lib/auth";
import { forkBook } from "@/lib/fork";
import { checkSameOrigin, fail, handleRouteError, json } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const FORK_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 };

/** POST /api/books/:id/fork … 複製(画像も複製。§3.5) */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "フォークにはログインが必要です");

    const limited = await consumeRateLimit(`fork:${user.id}`, FORK_LIMIT);
    if (!limited.ok) return fail("rate_limited", "フォークの回数が多すぎます");

    const { id } = await params;
    const result = await forkBook({ sourceBookId: id, actorId: user.id });
    if (!result.ok) {
      if (result.reason === "forbidden") {
        return fail("forbidden", "このブックはフォークできません");
      }
      if (result.reason === "parse") return fail("parse_failed", "内容を解析できません");
      if (result.reason === "asset") return fail("internal", "画像の複製に失敗しました");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ book: { id: result.bookId } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

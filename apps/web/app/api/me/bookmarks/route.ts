import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listBookmarks, setBookmark } from "@/lib/learning";
import { checkSameOrigin, fail, handleRouteError, json, noStore, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  bookId: z.string().min(1).max(64),
  questionId: z.string().min(1).max(64).nullable().optional(),
});

/** GET /api/me/bookmarks?bookId= … ブックマーク一覧(§7.1) */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const bookId = new URL(request.url).searchParams.get("bookId");
    return json({ bookmarks: await listBookmarks(user.id, bookId ?? undefined) }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/me/bookmarks … 追加(冪等) */
export async function PUT(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await setBookmark({
      userId: user.id,
      bookId: parsed.data.bookId,
      questionId: parsed.data.questionId ?? null,
      bookmarked: true,
    });
    if (!result.ok) return fail("not_found", "ブックが見つかりません");
    return json({ bookmarked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/me/bookmarks … 解除(冪等) */
export async function DELETE(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await setBookmark({
      userId: user.id,
      bookId: parsed.data.bookId,
      questionId: parsed.data.questionId ?? null,
      bookmarked: false,
    });
    if (!result.ok) return fail("not_found", "ブックが見つかりません");
    return json({ bookmarked: false });
  } catch (error) {
    return handleRouteError(error);
  }
}

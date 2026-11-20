import { getCurrentUser } from "@/lib/auth";
import { bookStats } from "@/lib/learning";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/books/:id/stats … 作者向け統計(匿名集計) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const stats = await bookStats(id, user.id);
    if (!stats) return fail("forbidden", "統計を閲覧できません");
    return json({ stats }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

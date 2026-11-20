import { getCurrentUser } from "@/lib/auth";
import { listBookVersions } from "@/lib/versions";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/books/:id/versions … 保存履歴(owner / editor。§7.1) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const result = await listBookVersions(id, user.id);
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "閲覧権限がありません");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ versions: result.versions }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

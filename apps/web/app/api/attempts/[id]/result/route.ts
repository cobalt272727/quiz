import { loadResult } from "@/lib/attempts";
import { currentActor } from "@/lib/guest";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/attempts/:id/result … 結果・解説(終端状態のみ。§7.9) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const result = await loadResult({ attemptId: id, actor: await currentActor() });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("not_found", "受験が見つかりません");
      if (result.reason === "forbidden") return fail("forbidden", "この受験を閲覧できません");
      return fail("conflict", "受験が終了していません");
    }
    return json({ result: result.result }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

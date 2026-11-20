import { abandonAttempt } from "@/lib/attempts";
import { currentActor } from "@/lib/guest";
import { checkSameOrigin, fail, handleRouteError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/attempts/:id/abandon … 受験の中断(§7.4) */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const { id } = await params;
    const result = await abandonAttempt({ attemptId: id, actor: await currentActor() });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("not_found", "受験が見つかりません");
      if (result.reason === "forbidden") return fail("forbidden", "この受験を操作できません");
      return fail("conflict", "この受験は終了しています");
    }
    return json({ status: "abandoned" });
  } catch (error) {
    return handleRouteError(error);
  }
}

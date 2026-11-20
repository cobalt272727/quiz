import { z } from "zod";
import { selfGradeQuestion } from "@/lib/attempts";
import { currentActor } from "@/lib/guest";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({
  questionId: z.string().min(1).max(64),
  selfGrade: z.enum(["full", "half", "none"]),
});

/** POST /api/attempts/:id/self-grade … essay の自己採点(§7.5) */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const { id } = await params;
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await selfGradeQuestion({
      attemptId: id,
      actor: await currentActor(),
      questionId: parsed.data.questionId,
      selfGrade: parsed.data.selfGrade,
    });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("not_found", "受験が見つかりません");
      if (result.reason === "forbidden") return fail("forbidden", "この受験を操作できません");
      if (result.reason === "invalid") return fail("invalid_request", "記述式の設問ではありません");
      return fail("conflict", "模範解答の開示後にのみ登録できます");
    }
    return json({ grade: result.grade });
  } catch (error) {
    return handleRouteError(error);
  }
}

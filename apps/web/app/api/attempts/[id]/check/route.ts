import { z } from "zod";
import { checkQuestion } from "@/lib/attempts";
import { currentActor } from "@/lib/guest";
import { checkSameOrigin, clientIp, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({ questionId: z.string().min(1).max(64) });
const CHECK_LIMIT = { limit: 120, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 };

/** POST /api/attempts/:id/check … 設問単位の即時採点(§7.7)。正解は返さない */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const { id } = await params;

    // 総当たり対策(Attempt × IP 単位)
    const limited = await consumeRateLimit(`check:${id}:${clientIp(request)}`, CHECK_LIMIT);
    if (!limited.ok) {
      return fail(
        "rate_limited",
        "確認の回数が多すぎます",
        { retryAfterSeconds: limited.retryAfterSeconds },
        { "retry-after": String(limited.retryAfterSeconds) },
      );
    }

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const actor = await currentActor();
    if (!actor.userId && !actor.guestTokenHash) {
      return fail("unauthorized", "受験の資格情報がありません");
    }

    const result = await checkQuestion({ attemptId: id, actor, questionId: parsed.data.questionId });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("not_found", "受験が見つかりません");
      if (result.reason === "forbidden") return fail("forbidden", "この受験を操作できません");
      if (result.reason === "not_allowed") {
        return fail("forbidden", "このモードでは即時採点を利用できません");
      }
      if (result.reason === "invalid") return fail("invalid_request", "設問が見つかりません");
      return fail("conflict", "この受験は終了しています");
    }
    return json({
      question: result.question,
      ...(result.explain ? { explain: result.explain } : {}),
      ...(result.model ? { model: result.model } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

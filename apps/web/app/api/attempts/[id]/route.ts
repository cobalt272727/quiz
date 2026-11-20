import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { readGuestTokenHash } from "@/lib/guest";
import { loadPlayState, submitAttempt } from "@/lib/attempts";
import { fail, handleRouteError, json, noStore, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Submit = z.object({
  selfGrades: z.record(z.string(), z.enum(["full", "half", "none"])).optional(),
});

async function actor() {
  const user = await getCurrentUser();
  return {
    userId: user?.id ?? null,
    guestTokenHash: user ? null : await readGuestTokenHash(),
  };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const state = await loadPlayState(id, await actor());
    if (!state.ok) {
      if (state.reason === "forbidden") return fail("forbidden", "この受験の閲覧権限がありません");
      return fail("not_found", "受験が見つかりません");
    }
    return json({ state: state.state }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = Submit.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "リクエストが不正です", parsed.error.issues);

    const result = await submitAttempt({
      attemptId: id,
      actor: await actor(),
      ...(parsed.data.selfGrades ? { selfGrades: parsed.data.selfGrades } : {}),
    });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "この受験の送信権限がありません");
      return fail("not_found", "受験が見つかりません");
    }
    return json({ grade: result.grade, reveals: result.reveals }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

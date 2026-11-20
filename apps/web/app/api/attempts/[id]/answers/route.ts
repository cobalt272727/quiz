import { z } from "zod";
import type { SelfGrade } from "@qb/parser";
import { getCurrentUser } from "@/lib/auth";
import { readGuestTokenHash } from "@/lib/guest";
import { saveAnswer } from "@/lib/attempts";
import { latestRevisions } from "@/lib/books";
import { db } from "@/lib/db";
import { fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({
  questionId: z.string().min(1).max(64),
  blankId: z.string().min(1).max(64).nullable().optional(),
  value: z.union([
    z.object({ text: z.string().max(10000) }),
    z.object({ choiceIds: z.array(z.string().max(64)).max(50) }),
    z.object({ boolean: z.boolean() }),
    z.object({ text: z.string().max(10000), selfGrade: z.enum(["full", "half", "none"]).optional() }),
  ]),
});

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "回答の形式が不正です", parsed.error.issues);

    const user = await getCurrentUser();
    const actor = {
      userId: user?.id ?? null,
      guestTokenHash: user ? null : await readGuestTokenHash(),
    };

    const attempt = await db.attempt.findUnique({
      where: { id },
      select: { bookId: true, bookVersion: true },
    });
    if (!attempt) return fail("not_found", "受験が見つかりません");

    const revisions = await latestRevisions(attempt.bookId);

    const result = await saveAnswer({
      attemptId: id,
      actor,
      questionId: parsed.data.questionId,
      blankId: parsed.data.blankId ?? null,
      value: parsed.data.value as { text: string } | { choiceIds: string[] } | { boolean: boolean } | { text: string; selfGrade?: SelfGrade },
      questionRevision: revisions.get(parsed.data.questionId) ?? 1,
    });

    if (!result.ok) {
      if (result.reason === "closed") return fail("conflict", "この受験は既に終了しています");
      if (result.reason === "forbidden") return fail("forbidden", "この受験の更新権限がありません");
      if (result.reason === "invalid") return fail("invalid_request", "回答を受け付けられません");
      return fail("not_found", "受験が見つかりません");
    }
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

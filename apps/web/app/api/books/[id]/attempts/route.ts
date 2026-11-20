import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ensureGuestToken, readGuestTokenHash } from "@/lib/guest";
import { startAttempt } from "@/lib/attempts";
import { clientIp, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  mode: z.enum(["practice", "exam", "review"]).optional(),
  reviewOnly: z.array(z.string()).max(1000).optional(),
  /** 共有リンク経由の受験(visibility = link のとき必須) */
  shareToken: z.string().max(200).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "リクエストが不正です", parsed.error.issues);

    const limit = await consumeRateLimit(`attempt:${clientIp(request)}`, WRITE_LIMIT);
    if (!limit.ok) return fail("rate_limited", "開始の回数が多すぎます。しばらく待ってください");

    const user = await getCurrentUser();
    const guestTokenHash = user ? null : await ensureGuestToken();

    const result = await startAttempt({
      bookId: id,
      actor: { userId: user?.id ?? null, guestTokenHash },
      mode: parsed.data.mode ?? "practice",
      ...(parsed.data.reviewOnly ? { reviewOnly: parsed.data.reviewOnly } : {}),
      ...(parsed.data.shareToken ? { shareToken: parsed.data.shareToken } : {}),
    });

    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "このブックは受験できません");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ attemptId: result.attemptId }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createReport } from "@/lib/admin";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 };

const ReportInput = z.object({
  bookId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(1000),
});

/** POST /api/reports … 通報(§7.1)。連投を避けるため 1 時間 10 件まで */
export async function POST(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "通報にはログインが必要です");

    const limit = await consumeRateLimit(`report:${user.id}`, REPORT_LIMIT);
    if (!limit.ok) {
      return fail(
        "rate_limited",
        "通報の回数が多すぎます。しばらく待ってからお試しください",
        { retryAfterSeconds: limit.retryAfterSeconds },
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const parsed = ReportInput.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "通報の内容が不正です", parsed.error.issues);

    const result = await createReport({
      bookId: parsed.data.bookId,
      reporterId: user.id,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      if (result.reason === "duplicate") {
        return fail("conflict", "このブックには既に未処理の通報があります");
      }
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ report: { id: result.reportId, status: "open" } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

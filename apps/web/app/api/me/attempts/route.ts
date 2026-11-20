import { getCurrentUser } from "@/lib/auth";
import { listMyAttempts } from "@/lib/learning";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/attempts?bookId=&limit= … 自分の受験履歴(§7.1) */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "30");
    const bookId = url.searchParams.get("bookId");
    const attempts = await listMyAttempts(user.id, {
      limit: Number.isFinite(limit) ? limit : 30,
      ...(bookId ? { bookId } : {}),
    });
    return json({ attempts }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

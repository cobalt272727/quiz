import { getCurrentUser } from "@/lib/auth";
import { myStats } from "@/lib/learning";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/stats … 学習統計(§7.1) */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    return json({ stats: await myStats(user.id) }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

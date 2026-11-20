import { gateAdmin, listAuditLog } from "@/lib/admin";
import { handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/audit?limit=50 … 管理者操作ログ(admin) */
export async function GET(request: Request) {
  try {
    const gate = await gateAdmin();
    if (!gate.ok) return gate.response;

    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    const entries = await listAuditLog(Number.isFinite(limit) ? limit : 50);
    return json({ entries }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

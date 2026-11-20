import { gateAdmin, listReports } from "@/lib/admin";
import { handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reports?status=open&limit=50 … 通報一覧(admin) */
export async function GET(request: Request) {
  try {
    const gate = await gateAdmin();
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const raw = url.searchParams.get("status");
    const status =
      raw === "open" || raw === "reviewing" || raw === "resolved" || raw === "rejected" || raw === "all"
        ? raw
        : "open";
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const reports = await listReports({
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return json({ reports }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

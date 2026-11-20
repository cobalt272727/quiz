import { z } from "zod";
import { gateAdmin, setReportStatus } from "@/lib/admin";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(["reviewing", "resolved", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

/** PATCH /api/admin/reports/:id … 通報の処理(admin) */
export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const gate = await gateAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const parsed = Patch.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "処理内容が不正です", parsed.error.issues);

    const result = await setReportStatus({
      reportId: id,
      adminUserId: gate.user.id,
      status: parsed.data.status,
      reason: parsed.data.reason ?? null,
    });
    if (!result.ok) return fail("not_found", "通報が見つかりません");
    return json({ report: { id, status: parsed.data.status } });
  } catch (error) {
    return handleRouteError(error);
  }
}

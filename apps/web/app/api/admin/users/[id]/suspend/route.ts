import { z } from "zod";
import { gateAdmin, setUserSuspended } from "@/lib/admin";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Patch = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/** PATCH /api/admin/users/:id/suspend … ユーザー停止・解除(§7.1) */
export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const gate = await gateAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const parsed = Patch.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await setUserSuspended({
      userId: id,
      adminUserId: gate.user.id,
      suspended: parsed.data.suspended,
      reason: parsed.data.reason ?? null,
    });
    if (!result.ok) {
      if (result.reason === "forbidden") {
        return fail("forbidden", "管理者自身・他の管理者は停止できません");
      }
      return fail("not_found", "ユーザーが見つかりません");
    }
    return json({ user: { id, suspended: parsed.data.suspended } });
  } catch (error) {
    return handleRouteError(error);
  }
}

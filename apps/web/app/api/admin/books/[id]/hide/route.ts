import { z } from "zod";
import { gateAdmin, setBookHiddenByAdmin } from "@/lib/admin";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Patch = z.object({
  hiddenByAdmin: z.boolean(),
  stopExistingAttempts: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
});

/** PATCH /api/admin/books/:id/hide … 管理者による非公開化・解除(§7.1) */
export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const gate = await gateAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const parsed = Patch.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await setBookHiddenByAdmin({
      bookId: id,
      adminUserId: gate.user.id,
      hidden: parsed.data.hiddenByAdmin,
      ...(parsed.data.stopExistingAttempts === undefined
        ? {}
        : { stopExistingAttempts: parsed.data.stopExistingAttempts }),
      reason: parsed.data.reason ?? null,
    });
    if (!result.ok) return fail("not_found", "ブックが見つかりません");
    return json({
      book: { id, hiddenByAdmin: parsed.data.hiddenByAdmin },
      abandonedAttempts: result.abandonedAttempts ?? 0,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

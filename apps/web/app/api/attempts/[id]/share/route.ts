import { getCurrentUser } from "@/lib/auth";
import { readGuestTokenHash } from "@/lib/guest";
import { issueResultShare, revokeResultShare } from "@/lib/share";
import { fail, handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 結果共有(点数のみ・既定 30 日。§3.5, §7.9) */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const result = await issueResultShare({
      attemptId: id,
      userId: user?.id ?? null,
      guestTokenHash: user ? null : await readGuestTokenHash(),
    });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "この受験の共有はできません");
      return fail("not_found", "受験が見つかりません");
    }
    return json(
      { token: result.token, path: `/r/${result.token}`, expiresAt: result.expiresAt },
      { headers: noStore },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const ok = await revokeResultShare({
      attemptId: id,
      userId: user?.id ?? null,
      guestTokenHash: user ? null : await readGuestTokenHash(),
    });
    if (!ok) return fail("not_found", "共有リンクが見つかりません");
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

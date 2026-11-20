import { assetResponse } from "@/lib/assets";
import { getCurrentUser } from "@/lib/auth";
import { readGuestTokenHash } from "@/lib/guest";
import { db } from "@/lib/db";
import { fail, handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; assetId: string }> };

/** 受験中の画像配信。Attempt の資格情報で認可する(§7.8) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, assetId } = await params;
    const user = await getCurrentUser();
    const attempt = await db.attempt.findUnique({
      where: { id },
      select: {
        userId: true,
        guestTokenHash: true,
        bookId: true,
        book: { select: { hiddenByAdmin: true, deletedAt: true } },
      },
    });
    if (!attempt) return fail("not_found", "画像が見つかりません");

    const owned =
      (attempt.userId && user && attempt.userId === user.id) ||
      (!attempt.userId &&
        attempt.guestTokenHash &&
        attempt.guestTokenHash === (await readGuestTokenHash()));
    if (!owned) return fail("not_found", "画像が見つかりません");
    if (attempt.book.hiddenByAdmin || attempt.book.deletedAt) {
      return fail("not_found", "画像が見つかりません");
    }

    const asset = await db.asset.findFirst({
      where: { id: assetId, bookId: attempt.bookId },
      select: { storageKey: true, mime: true, size: true },
    });
    if (!asset) return fail("not_found", "画像が見つかりません");
    return await assetResponse(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}

import { assetResponse } from "@/lib/assets";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; assetId: string }> };

/** 作者向けの画像配信(エディタのプレビュー用)。所有者のみ */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("not_found", "画像が見つかりません");
    const { id: bookId, assetId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, ownerId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!book) return fail("not_found", "画像が見つかりません");

    const asset = await db.asset.findFirst({
      where: { id: assetId, bookId },
      select: { storageKey: true, mime: true, size: true },
    });
    if (!asset) return fail("not_found", "画像が見つかりません");
    return await assetResponse(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}

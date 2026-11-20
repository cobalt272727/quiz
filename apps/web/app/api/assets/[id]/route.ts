import { assetResponse } from "@/lib/assets";
import { db } from "@/lib/db";
import { fail, handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 画像配信(§7.8)。`public` かつ非表示・非削除のブックのみ、認証なしで配信する。
 * それ以外は 404(存在を漏らさない)。
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const asset = await db.asset.findUnique({
      where: { id },
      select: {
        storageKey: true,
        mime: true,
        size: true,
        book: { select: { visibility: true, hiddenByAdmin: true, deletedAt: true } },
      },
    });
    if (!asset) return fail("not_found", "画像が見つかりません");
    const book = asset.book;
    if (book.deletedAt || book.hiddenByAdmin || book.visibility !== "public") {
      return fail("not_found", "画像が見つかりません");
    }
    return await assetResponse(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}

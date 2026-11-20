import { assetResponse } from "@/lib/assets";
import { db } from "@/lib/db";
import { resolveBookByToken } from "@/lib/share";
import { fail, handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; assetId: string }> };

/** 共有リンク経由の画像配信。毎回トークンと所属を検証する(§7.8) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token, assetId } = await params;
    const book = await resolveBookByToken(token);
    if (!book) return fail("not_found", "画像が見つかりません");

    const asset = await db.asset.findFirst({
      where: { id: assetId, bookId: book.id },
      select: { storageKey: true, mime: true, size: true },
    });
    if (!asset) return fail("not_found", "画像が見つかりません");
    return await assetResponse(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}

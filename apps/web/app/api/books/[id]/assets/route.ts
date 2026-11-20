import { AssetError, MAX_BYTES_PER_IMAGE, assertBookCapacity, storeImage, uniqueAssetName, safeAssetPath } from "@/lib/assets";
import { getCurrentUser } from "@/lib/auth";
import { canEdit, bookRole } from "@/lib/access";
import { db } from "@/lib/db";
import { clientIp, fail, handleRouteError, json } from "@/lib/api";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";
import { unlink } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 画像アップロード(§7.8)。multipart/form-data の `file` を受け取る */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id: bookId } = await params;

    // owner / editor だけがアップロードできる(§7.2)。権限が無い場合は存在も伏せる
    const role = await bookRole(bookId, user.id);
    if (!canEdit(role)) return fail("not_found", "ブックが見つかりません");
    const book = { id: bookId };

    const limit = await consumeRateLimit(`assets:${clientIp(request)}`, WRITE_LIMIT);
    if (!limit.ok) return fail("rate_limited", "アップロードの回数が多すぎます。しばらく待ってください");

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES_PER_IMAGE + 1024 * 1024) {
      return fail("payload_too_large", "画像は 1 枚 5MB までです");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("invalid_request", "`file` がありません");
    if (file.size > MAX_BYTES_PER_IMAGE) return fail("payload_too_large", "画像は 1 枚 5MB までです");

    const buffer = Buffer.from(await file.arrayBuffer());
    await assertBookCapacity(bookId, buffer.length);

    const stored = await storeImage(bookId, buffer);
    const name = await uniqueAssetName(bookId, (form.get("name") as string | null) ?? file.name);

    try {
      const asset = await db.asset.create({
        data: {
          bookId,
          name,
          mime: stored.mime,
          size: stored.size,
          storageKey: stored.storageKey,
          width: stored.width,
          height: stored.height,
        },
      });
      return json(
        {
          asset: {
            id: asset.id,
            name: asset.name,
            mime: asset.mime,
            size: asset.size,
            width: asset.width,
            height: asset.height,
            path: `/api/assets/${asset.id}`,
            markdown: `![${asset.name}](img:${asset.name})`,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      // DB 登録に失敗したら実ファイルを残さない
      await unlink(safeAssetPath(stored.storageKey)).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof AssetError) {
      return fail(error.code === "book_limit" ? "payload_too_large" : "invalid_request", error.message);
    }
    return handleRouteError(error);
  }
}

/** ブックのアセット一覧(作者向け) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id: bookId } = await params;
    // owner / editor だけがアップロードできる(§7.2)。権限が無い場合は存在も伏せる
    const role = await bookRole(bookId, user.id);
    if (!canEdit(role)) return fail("not_found", "ブックが見つかりません");
    const book = { id: bookId };

    const assets = await db.asset.findMany({
      where: { bookId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, mime: true, size: true, width: true, height: true },
    });
    return json({ assets });
  } catch (error) {
    return handleRouteError(error);
  }
}

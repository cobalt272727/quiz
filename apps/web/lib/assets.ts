import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import sharp from "sharp";
import { db } from "./db";
import { serverEnv } from "./env";

/**
 * 画像アセット(SPEC_v4 §9「画像(ローカルディレクトリ保存)」)
 *
 * - 保存先は `UPLOAD_DIR`(Web 公開ディレクトリの外)。配信は必ず認可付き API 経由
 * - マジックナンバーで MIME を判定し、SVG は受け付けない
 * - `sharp` で再エンコードして EXIF を落とし、寸法を取り直す
 * - 1 枚 5MB / ブック合計 50MB の上限
 */

export const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;
export const MAX_BYTES_PER_BOOK = 50 * 1024 * 1024;
/** 画素数の上限(解凍爆弾対策) */
const MAX_PIXELS = 40_000_000;
/** 長辺の上限。超える画像は縮小する */
const MAX_EDGE = 4000;

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const EXT: Record<ImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** マジックナンバーで形式を判定する(SVG は対象外) */
export function detectImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const head6 = buffer.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** リポジトリ直下を探す(実行ディレクトリが apps/web でも安定させる) */
function repoRoot(): string {
  const here = process.cwd();
  return here.endsWith(`${sep}apps${sep}web`) ? dirname(dirname(here)) : here;
}

export const uploadRoot = (): string =>
  resolve(repoRoot(), process.env.UPLOAD_DIR ?? "./data/uploads");

const tmpDir = (): string => join(uploadRoot(), "tmp");
const bookDir = (bookId: string): string => join(uploadRoot(), "books", bookId);

/** パストラバーサル対策。解決後のパスが UPLOAD_DIR 配下であることを確認する */
export function safeAssetPath(storageKey: string): string {
  const root = uploadRoot();
  const full = resolve(root, storageKey);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`不正な保存パス: ${storageKey}`);
  }
  return full;
}

export function storageKeyFor(bookId: string, mime: ImageMime): string {
  return ["books", bookId, `${randomUUID()}.${EXT[mime]}`].join("/");
}

export type StoredImage = {
  storageKey: string;
  mime: ImageMime;
  size: number;
  width: number;
  height: number;
};

export class AssetError extends Error {
  readonly code: "invalid_type" | "too_large" | "book_limit" | "broken";

  constructor(code: "invalid_type" | "too_large" | "book_limit" | "broken", message: string) {
    super(message);
    this.code = code;
  }
}

/** 受け取った画像を検証し、再エンコードして保存する(戻り値はメタ情報のみ) */
export async function storeImage(bookId: string, input: Buffer): Promise<StoredImage> {
  if (input.length > MAX_BYTES_PER_IMAGE) {
    throw new AssetError("too_large", "画像は 1 枚 5MB までです");
  }
  const mime = detectImageMime(input);
  if (!mime) {
    throw new AssetError("invalid_type", "PNG / JPEG / WebP / GIF のみアップロードできます");
  }

  await mkdir(tmpDir(), { recursive: true });
  const tempPath = join(tmpDir(), `${randomUUID()}.upload`);
  await writeFile(tempPath, input, { mode: 0o600 });

  try {
    const image = sharp(tempPath, {
      limitInputPixels: MAX_PIXELS,
      animated: mime === "image/gif",
      failOn: "error",
    });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      throw new AssetError("broken", "画像を読み取れませんでした");
    }

    let pipeline = image.rotate();
    if (Math.max(meta.width, meta.height) > MAX_EDGE) {
      pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
    }
    // 再エンコードで EXIF などメタデータを落とす(sharp は既定で出力に引き継がない)
    switch (mime) {
      case "image/png":
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case "image/jpeg":
        pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
        break;
      case "image/webp":
        pipeline = pipeline.webp({ quality: 85 });
        break;
      case "image/gif":
        pipeline = pipeline.gif();
        break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (data.length > MAX_BYTES_PER_IMAGE) {
      throw new AssetError("too_large", "再エンコード後の画像が 5MB を超えています");
    }

    const storageKey = storageKeyFor(bookId, mime);
    const full = safeAssetPath(storageKey);
    await mkdir(dirname(full), { recursive: true });
    const tempOut = `${full}.part`;
    await writeFile(tempOut, data, { mode: 0o600 });
    await rename(tempOut, full);

    return {
      storageKey,
      mime,
      size: data.length,
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof AssetError) throw error;
    throw new AssetError("broken", "画像を処理できませんでした");
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

/** ブックの合計サイズ(上限判定用) */
export async function bookAssetBytes(bookId: string): Promise<number> {
  const sum = await db.asset.aggregate({ where: { bookId }, _sum: { size: true } });
  return sum._sum.size ?? 0;
}

export async function assertBookCapacity(bookId: string, incoming: number): Promise<void> {
  const used = await bookAssetBytes(bookId);
  if (used + incoming > MAX_BYTES_PER_BOOK) {
    throw new AssetError("book_limit", "このブックの画像は合計 50MB までです");
  }
}

/** アップロードされたファイル名から表示名を作る(重複は連番) */
export async function uniqueAssetName(bookId: string, raw: string | undefined): Promise<string> {
  // 名前は `img:` 参照にそのまま入るため、画像記法と衝突する文字(空白・括弧・記号)を避ける
  const base = (raw ?? "image")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.[A-Za-z0-9]{1,6}$/, "")
    .replace(/[\u0000-\u001f\s()[\]{}<>"'`|\\/?:*]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  const stem = base || "image";
  const existing = new Set(
    (await db.asset.findMany({ where: { bookId }, select: { name: true } })).map((a) => a.name),
  );
  if (!existing.has(stem)) return stem;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${stem}-${randomUUID().slice(0, 8)}`;
}

/** 保存済み画像を読む(認可は呼び出し側で行う) */
export async function readAsset(storageKey: string): Promise<Buffer> {
  return readFile(safeAssetPath(storageKey));
}

export async function assetExists(storageKey: string): Promise<boolean> {
  try {
    const info = await stat(safeAssetPath(storageKey));
    return info.isFile();
  } catch {
    return false;
  }
}

/** ブックの画像ファイルを削除する(ブック削除・フォーク失敗時など) */
export async function removeBookFiles(bookId: string): Promise<void> {
  await rm(bookDir(bookId), { recursive: true, force: true });
}

/** DB と実ファイルの孤児を掃除する(§9)。temp も回収する */
export async function sweepOrphanFiles(): Promise<{ removed: number }> {
  const { readdir } = await import("node:fs/promises");
  let removed = 0;

  // 一時領域
  try {
    for (const name of await readdir(tmpDir())) {
      const info = await stat(join(tmpDir(), name));
      if (Date.now() - info.mtimeMs > 60 * 60 * 1000) {
        await unlink(join(tmpDir(), name)).catch(() => {});
        removed += 1;
      }
    }
  } catch {
    /* ディレクトリが無い */
  }

  // ブック行が存在しないディレクトリ(DB 登録前の失敗など)
  try {
    const known = new Set(
      (await db.book.findMany({ select: { id: true } })).map((b) => b.id),
    );
    for (const name of await readdir(join(uploadRoot(), "books"))) {
      if (known.has(name)) continue;
      await rm(join(uploadRoot(), "books", name), { recursive: true, force: true });
      removed += 1;
    }
  } catch {
    /* ディレクトリが無い */
  }

  // 論理削除済みブックのファイル
  const purged = await db.book.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  });
  const retentionMs = serverEnv.bookRetentionDays * 24 * 60 * 60 * 1000;
  for (const book of purged) {
    if (!book.deletedAt) continue;
    if (Date.now() - book.deletedAt.getTime() < retentionMs) continue;
    await removeBookFiles(book.id);
    removed += 1;
  }
  return { removed };
}

/** 認可済みアセットのレスポンス(§9 の必須ヘッダーを付ける) */
export async function assetResponse(asset: {
  storageKey: string;
  mime: string;
  size: number;
}): Promise<Response> {
  let body: Buffer;
  try {
    body = await readAsset(asset.storageKey);
  } catch {
    return new Response("not found", { status: 404 });
  }
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": asset.mime,
      "content-length": String(body.length),
      // 失効後も長期キャッシュから読めないよう再検証必須にする(§7.8)
      "cache-control": "private, no-cache",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; sandbox",
    },
  });
}

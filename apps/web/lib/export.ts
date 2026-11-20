import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { db } from "./db";
import { bookRole, canEdit } from "./access";
import { saveBook } from "./books";
import {
  MAX_BYTES_PER_BOOK,
  MAX_BYTES_PER_IMAGE,
  assertBookCapacity,
  detectImageMime,
  safeAssetPath,
  storeImage,
  uniqueAssetName,
} from "./assets";
import { serverEnv } from "./env";

/**
 * 書き出し・ZIP 取り込み(SPEC_v4 §3.2, §9 ZIP 取り込み)
 *
 * ZIP は「本文(.qb)+ 画像」の組。取り込みはエントリ数・展開後サイズ・
 * 圧縮率・拡張子を検証し、画像は必ず再エンコード経由で保存する。
 */

export const EXPORT_FORMATS = ["qb", "json", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportedBook = { filename: string; contentType: string; body: Buffer };

const safeFilename = (title: string): string =>
  title.replace(/[\/:*?"<>|\r\n]/g, "_").slice(0, 60) || "book";

export async function exportBook(input: {
  bookId: string;
  userId: string;
  format: ExportFormat;
}): Promise<{ ok: true; file: ExportedBook } | { ok: false; reason: "not_found" | "forbidden" }> {
  const role = await bookRole(input.bookId, input.userId);
  if (!role) return { ok: false, reason: "not_found" };
  if (!canEdit(role)) return { ok: false, reason: "forbidden" };

  const book = await db.book.findUnique({
    where: { id: input.bookId },
    include: { assets: true },
  });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };

  const base = safeFilename(book.title);

  if (input.format === "qb") {
    return {
      ok: true,
      file: {
        filename: `${base}.qb`,
        contentType: "text/plain; charset=utf-8",
        body: Buffer.from(book.source, "utf8"),
      },
    };
  }

  if (input.format === "json") {
    return {
      ok: true,
      file: {
        filename: `${base}.json`,
        contentType: "application/json; charset=utf-8",
        body: Buffer.from(
          JSON.stringify(
            {
              format: "qb-book",
              formatVersion: 1,
              title: book.title,
              visibility: book.visibility,
              version: book.version,
              parserVersion: book.parserVersion,
              source: book.source,
              ast: book.ast,
            },
            null,
            2,
          ),
          "utf8",
        ),
      },
    };
  }

  const files: Record<string, Uint8Array> = { "book.qb": strToU8(book.source) };
  const manifest = {
    format: "qb-zip",
    formatVersion: 1,
    title: book.title,
    assets: [] as Array<{ name: string; file: string }>,
  };
  for (const asset of book.assets) {
    try {
      const buffer = await readFile(safeAssetPath(asset.storageKey));
      const file = `assets/${asset.storageKey.split("/").pop()}`;
      files[file] = new Uint8Array(buffer);
      manifest.assets.push({ name: asset.name, file });
    } catch {
      // 実体が無い画像は書き出しから外す(本文の img: は取り込み時に QB-E005 で検出される)
    }
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return {
    ok: true,
    file: {
      filename: `${base}.zip`,
      contentType: "application/zip",
      body: Buffer.from(zipSync(files, { level: 6 })),
    },
  };
}

export const ZIP_LIMITS = {
  maxEntries: 500,
  maxTotalBytes: 60 * 1024 * 1024,
  maxRatio: 100,
  maxCompressedBytes: 20 * 1024 * 1024,
};

export type ImportResult =
  | { ok: true; bookId: string }
  | { ok: false; reason: "invalid" | "too_large" | "parse" | "asset"; message?: string };

/** ZIP から新しいブックを作る(本文 + 画像) */
export async function importZipBook(input: {
  actorId: string;
  zip: Buffer;
}): Promise<ImportResult> {
  if (input.zip.length > ZIP_LIMITS.maxCompressedBytes) {
    return { ok: false, reason: "too_large", message: "ZIP が大きすぎます" };
  }

  let entries = 0;
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(input.zip), {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        entries += 1;
        total += file.originalSize;
        return (
          entries <= ZIP_LIMITS.maxEntries &&
          total <= ZIP_LIMITS.maxTotalBytes &&
          // 圧縮率の上限(zip bomb 対策)
          (file.size === 0 || file.originalSize / file.size <= ZIP_LIMITS.maxRatio)
        );
      },
    });
  } catch {
    return { ok: false, reason: "invalid", message: "ZIP を展開できません" };
  }
  if (entries > ZIP_LIMITS.maxEntries) {
    return { ok: false, reason: "too_large", message: `エントリが多すぎます(上限 ${ZIP_LIMITS.maxEntries})` };
  }
  if (total > ZIP_LIMITS.maxTotalBytes) {
    return { ok: false, reason: "too_large", message: "展開後のサイズが大きすぎます" };
  }

  const manifest = files["manifest.json"] ? parseManifest(files["manifest.json"]!) : null;
  const sourceName = manifest ? "book.qb" : Object.keys(files).find((name) => /\.(qb|md|txt)$/i.test(name));
  if (!sourceName || !files[sourceName]) {
    return { ok: false, reason: "invalid", message: "本文(.qb)が見つかりません" };
  }
  const source = strFromU8(files[sourceName]!);

  const saved = await saveBook({ ownerId: input.actorId, source, visibility: "private" });
  if (!saved.ok) {
    if (saved.reason === "parse") return { ok: false, reason: "parse" };
    return { ok: false, reason: "invalid" };
  }

  const images = manifest
    ? manifest.assets
        .map((a) => ({ name: a.name, data: files[a.file] }))
        .filter((a): a is { name: string; data: Uint8Array } => Boolean(a.data))
    : Object.entries(files)
        .filter(([name]) => /\.(png|jpe?g|webp|gif)$/i.test(name))
        .map(([name, data]) => ({ name: name.split("/").pop()!, data }));

  try {
    for (const image of images) {
      const buffer = Buffer.from(image.data);
      const mime = detectImageMime(buffer);
      if (!mime) continue;
      if (buffer.length > MAX_BYTES_PER_IMAGE) {
        return { ok: false, reason: "asset", message: `${image.name} が 5MB を超えています` };
      }
      await assertBookCapacity(saved.book.id, buffer.length);
      const stored = await storeImage(saved.book.id, buffer);
      const name = await uniqueAssetName(saved.book.id, image.name);
      await db.asset.create({
        data: {
          bookId: saved.book.id,
          name,
          mime: stored.mime,
          size: stored.size,
          storageKey: stored.storageKey,
          width: stored.width,
          height: stored.height,
        },
      });
      if ((await db.asset.aggregate({ where: { bookId: saved.book.id }, _sum: { size: true } }))._sum.size! >
          MAX_BYTES_PER_BOOK) {
        return { ok: false, reason: "asset", message: "ブックの画像が多すぎます" };
      }
    }
  } catch {
    await db.book.delete({ where: { id: saved.book.id } }).catch(() => undefined);
    return { ok: false, reason: "asset" };
  }

  return { ok: true, bookId: saved.book.id };
}

function parseManifest(data: Uint8Array): { assets: Array<{ name: string; file: string }> } | null {
  try {
    const parsed = JSON.parse(strFromU8(data)) as { format?: string; assets?: unknown };
    if (parsed?.format !== "qb-zip" || !Array.isArray(parsed.assets)) return null;
    const assets = (parsed.assets as Array<Record<string, unknown>>)
      .filter((a) => typeof a?.name === "string" && typeof a?.file === "string")
      .map((a) => ({ name: String(a.name), file: String(a.file) }));
    return { assets };
  } catch {
    return null;
  }
}

void serverEnv;

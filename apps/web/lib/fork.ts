import { readFile } from "node:fs/promises";
import { db } from "./db";
import { bookRole } from "./access";
import { saveBook } from "./books";
import { safeAssetPath, storageKeyFor, uploadRoot } from "./assets";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * フォーク(SPEC_v4 §3.5, §7.2)
 *
 * - 所有者・editor はいつでも、それ以外は `allowFork` かつ public/link(トークン不要)なら可
 * - 画像も複製する(本文は `img:name` を保つため名前を維持)
 * - フォーク元は `forkedFromId` に記録する
 */

export type ForkResult =
  | { ok: true; bookId: string }
  | { ok: false; reason: "not_found" | "forbidden" | "parse" | "asset" };

export async function forkBook(input: {
  sourceBookId: string;
  actorId: string;
}): Promise<ForkResult> {
  const book = await db.book.findUnique({
    where: { id: input.sourceBookId },
    include: { assets: true },
  });
  if (!book || book.deletedAt || book.hiddenByAdmin) return { ok: false, reason: "not_found" };

  const role = await bookRole(book.id, input.actorId);
  const mayFork =
    role === "owner" || role === "editor" || (book.allowFork && book.visibility === "public");
  if (!mayFork) return { ok: false, reason: "forbidden" };

  const title = `${book.title} のコピー`;
  const source = book.source.replace(/^title:.*$/m, `title: ${title}`);

  const saved = await saveBook({
    ownerId: input.actorId,
    source,
    visibility: "private",
  });
  if (!saved.ok) {
    if (saved.reason === "parse") return { ok: false, reason: "parse" };
    return { ok: false, reason: "not_found" };
  }

  try {
    for (const asset of book.assets) {
      const from = safeAssetPath(asset.storageKey);
      const buffer = await readFile(from);
      const key = storageKeyFor(saved.book.id, asset.mime as never);
      const to = join(uploadRoot(), key);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, buffer);
      await db.asset.create({
        data: {
          bookId: saved.book.id,
          name: asset.name,
          mime: asset.mime,
          size: asset.size,
          storageKey: key,
          width: asset.width,
          height: asset.height,
        },
      });
    }
  } catch {
    // 画像の複製に失敗したら、作ったブックを片付けて失敗を返す
    await db.book.delete({ where: { id: saved.book.id } }).catch(() => undefined);
    return { ok: false, reason: "asset" };
  }

  await db.book.update({
    where: { id: saved.book.id },
    data: { forkedFromId: book.id },
  });
  return { ok: true, bookId: saved.book.id };
}

import { db } from "./db";
import { saveBook } from "./books";
import { canEdit, bookRole } from "./access";

/**
 * 保存履歴と復元(SPEC_v4 §3.3, §7.1)
 *
 * 保存のたびに `BookVersion` が増える。復元は「過去の source を新しい版として保存」であり、
 * 既存の版を書き換えない(履歴は常に追記のみ)。
 */

export type VersionSummary = {
  version: number;
  createdAt: string;
  title: string;
  questionCount: number;
};

export async function listBookVersions(
  bookId: string,
  userId: string,
): Promise<{ ok: true; versions: VersionSummary[] } | { ok: false; reason: "not_found" | "forbidden" }> {
  const role = await bookRole(bookId, userId);
  if (!role) return { ok: false, reason: "not_found" };
  if (!canEdit(role)) return { ok: false, reason: "forbidden" };

  const rows = await db.bookVersion.findMany({
    where: { bookId },
    orderBy: { version: "desc" },
    take: 100,
    select: { version: true, createdAt: true, source: true, ast: true },
  });
  return {
    ok: true,
    versions: rows.map((row) => {
      const meta = (row.ast as { meta?: { title?: string } } | null)?.meta;
      const questionCount = Array.isArray((row.ast as { blocks?: unknown[] } | null)?.blocks)
        ? countQuestions(row.ast)
        : countSourceQuestions(row.source);
      return {
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        title: meta?.title ?? firstTitle(row.source),
        questionCount,
      };
    }),
  };
}

function countQuestions(ast: unknown): number {
  let count = 0;
  const walk = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks as Array<Record<string, unknown>>) {
      if (block.type === "question") count += 1;
      if (block.type === "list") walk(block.items);
      if (block.type === "table") {
        walk(block.header);
        for (const row of (block.rows as unknown[]) ?? []) walk(row);
      }
    }
  };
  walk((ast as { blocks?: unknown }).blocks);
  return count;
}

/** AST が無い古い版でも件数を出せるように、ソースから数える */
const countSourceQuestions = (source: string): number => (source.match(/^@q\b/gm) ?? []).length;

const firstTitle = (source: string): string => {
  const match = source.match(/^title:\s*(.+)$/m);
  return match ? match[1]!.trim() : "無題のブック";
};

export type RestoreResult =
  | { ok: true; version: number; source: string }
  | { ok: false; reason: "not_found" | "forbidden" | "conflict" | "parse" };

/** 過去の版を新しい版として復元する */
export async function restoreBookVersion(input: {
  bookId: string;
  userId: string;
  version: number;
  expectedVersion: number;
}): Promise<RestoreResult> {
  const snapshot = await db.bookVersion.findUnique({
    where: { bookId_version: { bookId: input.bookId, version: input.version } },
    select: { source: true },
  });
  if (!snapshot) return { ok: false, reason: "not_found" };

  const saved = await saveBook({
    ownerId: input.userId,
    bookId: input.bookId,
    source: snapshot.source,
    expectedVersion: input.expectedVersion,
  });
  if (!saved.ok) {
    if (saved.reason === "conflict") return { ok: false, reason: "conflict" };
    if (saved.reason === "forbidden") return { ok: false, reason: "forbidden" };
    if (saved.reason === "parse") return { ok: false, reason: "parse" };
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, version: saved.book.version, source: saved.book.source };
}

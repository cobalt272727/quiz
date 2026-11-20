import { collectQuestions, type BookAst } from "@qb/parser";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** 公開ライブラリ(SPEC_v4 §3.5, §7.2) */

export type PublicBookCard = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  ownerName: string;
  questionCount: number;
  updatedAt: Date;
};

const PUBLIC_WHERE: Prisma.BookWhereInput = {
  visibility: "public",
  hiddenByAdmin: false,
  deletedAt: null,
};

export type SearchInput = {
  q?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
};

export async function searchPublicBooks(input: SearchInput): Promise<{
  items: PublicBookCard[];
  nextCursor: string | null;
}> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const q = input.q?.trim();
  const where: Prisma.BookWhereInput = {
    ...PUBLIC_WHERE,
    ...(input.tag ? { tags: { has: input.tag } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { tags: { has: q } },
          ],
        }
      : {}),
  };

  const rows = await db.book.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      updatedAt: true,
      ast: true,
      owner: { select: { name: true, loginId: true } },
    },
  });

  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      tags: row.tags,
      ownerName: row.owner.name || row.owner.loginId || "匿名",
      questionCount: countQuestions(row.ast as unknown as BookAst),
      updatedAt: row.updatedAt,
    })),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** 公開ライブラリで使われているタグの上位(件数順) */
export async function popularTags(limit = 24): Promise<Array<{ tag: string; count: number }>> {
  const rows = await db.$queryRaw<Array<{ tag: string; count: bigint }>>`
    SELECT tag, count(*) AS count
    FROM (
      SELECT unnest("tags") AS tag
      FROM "Book"
      WHERE "visibility" = 'public' AND "hiddenByAdmin" = false AND "deletedAt" IS NULL
    ) AS t
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

function countQuestions(ast: BookAst): number {
  try {
    return collectQuestions(ast.blocks).length;
  } catch {
    return 0;
  }
}

export type PublicBookDetail = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  ownerName: string;
  questionCount: number;
  updatedAt: Date;
  visibility: string;
  /** 公開ブックのフォーク可否(§7.2) */
  allowFork: boolean;
  /** 練習モードで即時採点を許可しているか(§7.7) */
  practiceFeedback: boolean;
  source?: never;
};

/**
 * 公開ブックの詳細。/b/:id は public、リンク共有は /s/:token を使う。
 * 非公開・非表示・削除済みは null(存在を漏らさない)。
 */
export async function getPublicBook(id: string): Promise<PublicBookDetail | null> {
  const book = await db.book.findFirst({
    where: { id, ...PUBLIC_WHERE },
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      updatedAt: true,
      visibility: true,
      allowFork: true,
      ast: true,
      owner: { select: { name: true, loginId: true } },
    },
  });
  if (!book) return null;
  const ast = book.ast as unknown as BookAst;
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    tags: book.tags,
    ownerName: book.owner.name || book.owner.loginId || "匿名",
    questionCount: countQuestions(ast),
    updatedAt: book.updatedAt,
    visibility: book.visibility,
    allowFork: book.allowFork,
    practiceFeedback: Boolean(ast.meta?.practiceFeedback),
  };
}

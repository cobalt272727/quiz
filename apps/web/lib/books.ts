import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  collectBlanks,
  collectQuestions,
  gradingSnapshotsByQuestion,
  saveSource,
  toPublic,
  type BookAst,
  type Diagnostic,
} from "@qb/parser";
import { db } from "./db";
import { serverEnv } from "./env";

/**
 * ブックの保存(SPEC_v4 §4.6, §5.2, §7.3)
 *
 * 保存の正はサーバ。クライアントから受け取ったソースを `saveSource` で
 * 検証・ID 書き戻しし、確定した source / AST だけを保存する。
 */

export type SaveBookInput = {
  /** 作成時は所有者、更新時は実行者(editor メンバーも渡す) */
  ownerId: string;
  bookId?: string;
  source: string;
  /** 楽観ロック用(更新時は必須) */
  expectedVersion?: number;
  visibility?: "private" | "link" | "public" | "invite";
  allowFork?: boolean;
};

export type SaveBookSuccess = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  tags: string[];
  visibility: string;
  source: string;
  wroteBack: boolean;
  questionCount: number;
  diagnostics: Diagnostic[];
  createdAt: Date;
  updatedAt: Date;
};

export type SaveBookFailure = {
  ok: false;
  reason: "parse" | "conflict" | "not_found" | "forbidden";
  diagnostics?: Diagnostic[];
};

export type SaveBookResult = { ok: true; book: SaveBookSuccess } | SaveBookFailure;

const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

const jsonOf = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** 台帳(BookEntityId)から退役済み ID を取り出す(§4.6) */
async function retiredIds(bookId: string): Promise<{ question: string[]; blank: string[] }> {
  const rows = await db.bookEntityId.findMany({
    where: { bookId, retiredVersion: { not: null } },
  });
  const question: string[] = [];
  const blank: string[] = [];
  for (const row of rows) {
    if (row.kind === "question") question.push(row.id);
    else blank.push(row.id);
  }
  return { question, blank };
}

type TxLike = Prisma.TransactionClient;

/** 台帳を現在の AST に合わせて更新する(新規 ID の登録と消えた ID の退役) */
async function syncEntityIds(
  tx: TxLike,
  bookId: string,
  version: number,
  questions: Array<{ id: string; blankIds: string[] }>,
): Promise<void> {
  const existing = await tx.bookEntityId.findMany({ where: { bookId } });
  const known = new Map(existing.map((row) => [`${row.kind}:${row.id}`, row]));

  const nextQuestionIds = new Set<string>();
  const nextBlankIds = new Set<string>();
  for (const q of questions) {
    nextQuestionIds.add(q.id);
    for (const id of q.blankIds) nextBlankIds.add(id);
  }

  const toCreate: Prisma.BookEntityIdCreateManyInput[] = [];
  for (const id of nextQuestionIds) {
    if (!known.has(`question:${id}`)) {
      toCreate.push({ bookId, kind: "question", id, firstVersion: version });
    }
  }
  for (const id of nextBlankIds) {
    if (!known.has(`blank:${id}`)) {
      toCreate.push({ bookId, kind: "blank", id, firstVersion: version });
    }
  }
  if (toCreate.length > 0) await tx.bookEntityId.createMany({ data: toCreate });

  // 消えた ID を退役にする(次回以降の再利用を QB-E011 で検出する)
  const missing: string[] = [];
  for (const row of existing) {
    if (row.retiredVersion !== null) continue;
    const alive = row.kind === "question" ? nextQuestionIds.has(row.id) : nextBlankIds.has(row.id);
    if (!alive) missing.push(row.id);
  }
  if (missing.length > 0) {
    await tx.bookEntityId.updateMany({
      where: { bookId, id: { in: missing }, retiredVersion: null },
      data: { retiredVersion: version },
    });
  }
}

/**
 * 設問リビジョンを同期する(§4.6)。
 * 採点に影響する変更があった設問だけ revision を増やす。
 */
async function syncRevisions(
  tx: TxLike,
  bookId: string,
  ast: BookAst,
): Promise<void> {
  const snapshots = gradingSnapshotsByQuestion(ast.blocks, ast.meta.normalize.kana);
  const latest = await tx.questionRevision.findMany({
    where: { bookId, questionId: { in: [...snapshots.keys()] } },
    orderBy: { revision: "desc" },
  });
  const latestByQuestion = new Map<string, { revision: number; gradingHash: string }>();
  for (const row of latest) {
    if (!latestByQuestion.has(row.questionId)) {
      latestByQuestion.set(row.questionId, { revision: row.revision, gradingHash: row.gradingHash });
    }
  }

  for (const [questionId, snapshot] of snapshots) {
    const hash = hashKey(JSON.stringify(snapshot));
    const current = latestByQuestion.get(questionId);
    if (current && current.gradingHash === hash) continue;
    await tx.questionRevision.create({
      data: {
        bookId,
        questionId,
        revision: (current?.revision ?? 0) + 1,
        gradingHash: hash,
        gradingSnapshot: jsonOf(snapshot),
      },
    });
  }
}

/** 設問 ID → 現在のリビジョン番号(回答の記録用。§4.6) */
export async function latestRevisions(bookId: string): Promise<Map<string, number>> {
  const rows = await db.questionRevision.findMany({
    where: { bookId },
    orderBy: { revision: "desc" },
    select: { questionId: true, revision: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) if (!map.has(row.questionId)) map.set(row.questionId, row.revision);
  return map;
}

const blankIdsOf = (ast: BookAst): Array<{ id: string; blankIds: string[] }> =>
  collectQuestions(ast.blocks).map((q) => ({
    id: q.id,
    blankIds: collectBlanks(q.body).map((b) => b.id),
  }));

export async function saveBook(input: SaveBookInput): Promise<SaveBookResult> {
  let existingBookId = input.bookId;
  let retired = { question: [] as string[], blank: [] as string[] };
  let assetNames = new Set<string>();
  let assetIds = new Map<string, string>();

  if (existingBookId) {
    const book = await db.book.findUnique({
      where: { id: existingBookId },
      select: { id: true, ownerId: true, deletedAt: true, hiddenByAdmin: true, version: true },
    });
    if (!book || book.deletedAt) return { ok: false, reason: "not_found" };
    // owner または editor メンバーだけが更新できる(§7.2)
    if (book.ownerId !== input.ownerId) {
      const member = await db.bookMember.findUnique({
        where: { bookId_userId: { bookId: book.id, userId: input.ownerId } },
        select: { role: true },
      });
      if (member?.role !== "editor") return { ok: false, reason: "forbidden" };
    }
    if (book.hiddenByAdmin) {
      const admin = await db.user.findFirst({
        where: { id: input.ownerId, role: "admin" },
        select: { id: true },
      });
      if (!admin) return { ok: false, reason: "forbidden" };
    }
    if (input.expectedVersion !== undefined && book.version !== input.expectedVersion) {
      return { ok: false, reason: "conflict" };
    }
    retired = await retiredIds(book.id);
    // `img:name` 参照を解決する(§4.8, §7.8)
    const assets = await db.asset.findMany({
      where: { bookId: book.id },
      select: { id: true, name: true },
    });
    assetNames = new Set(assets.map((a) => a.name));
    assetIds = new Map(assets.map((a) => [a.name, a.id]));
  }

  const saved = saveSource(input.source, {
    retiredQuestionIds: retired.question,
    retiredBlankIds: retired.blank,
    assetNames,
    assetIds,
    allowExternalImages: serverEnv.allowExternalImages,
  });

  if (saved.result.hasErrors) {
    return { ok: false, reason: "parse", diagnostics: saved.result.diagnostics };
  }

  const ast = saved.result.ast;
  const publicBook = toPublic(ast);
  const questions = blankIdsOf(ast);

  if (!existingBookId) {
    const created = await db.$transaction(async (tx) => {
      const book = await tx.book.create({
        data: {
          ownerId: input.ownerId,
          title: publicBook.meta.title || "無題のブック",
          description: publicBook.meta.description ?? null,
          tags: publicBook.meta.tags,
          visibility: input.visibility ?? "private",
          allowFork: input.allowFork ?? false,
          source: saved.source,
          ast: jsonOf(ast),
          astVersion: ast.astVersion,
          parserVersion: "0.1.0",
          version: 1,
        },
      });
      await syncEntityIds(tx, book.id, book.version, questions);
      await syncRevisions(tx, book.id, ast);
      // 初版も履歴に残す(§3.3)。これが無いと v1 に戻せない
      await tx.bookVersion.create({
        data: {
          bookId: book.id,
          version: book.version,
          source: saved.source,
          ast: jsonOf(ast),
          parserVersion: "0.1.0",
          astVersion: ast.astVersion,
        },
      });
      return book;
    });
    return {
      ok: true,
      book: {
        id: created.id,
        version: created.version,
        title: created.title,
        description: created.description,
        tags: created.tags,
        visibility: created.visibility,
        source: saved.source,
        wroteBack: saved.wroteBack,
        questionCount: questions.length,
        diagnostics: saved.result.diagnostics,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    };
  }

  const bookId = existingBookId;
  const updated = await db.$transaction(async (tx) => {
    // 認可(owner / editor)は呼び出し前に判定済み。ここでは楽観ロックだけを見る
    const result = await tx.book.updateMany({
      where: {
        id: bookId,
        version: input.expectedVersion ?? undefined,
        deletedAt: null,
      },
      data: {
        title: publicBook.meta.title || "無題のブック",
        description: publicBook.meta.description ?? null,
        tags: publicBook.meta.tags,
        source: saved.source,
        ast: jsonOf(ast),
        astVersion: ast.astVersion,
        parserVersion: "0.1.0",
        version: { increment: 1 },
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.allowFork === undefined ? {} : { allowFork: input.allowFork }),
      },
    });
    if (result.count === 0) return null;
    const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
    await syncEntityIds(tx, book.id, book.version, questions);
    await syncRevisions(tx, book.id, ast);
    await tx.bookVersion.create({
      data: {
        bookId,
        version: book.version,
        source: saved.source,
        ast: jsonOf(ast),
        parserVersion: "0.1.0",
        astVersion: ast.astVersion,
      },
    });
    return book;
  });

  if (!updated) return { ok: false, reason: "conflict" };

  return {
    ok: true,
    book: {
      id: updated.id,
      version: updated.version,
      title: updated.title,
      description: updated.description,
      tags: updated.tags,
      visibility: updated.visibility,
      source: saved.source,
      wroteBack: saved.wroteBack,
      questionCount: questions.length,
      diagnostics: saved.result.diagnostics,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  };
}

/** 一覧・詳細で返す公開情報(ソースと AST は含めない) */
export type BookSummary = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: string;
  allowFork: boolean;
  version: number;
  questionCount: number;
  updatedAt: Date;
};

export type SharedBookSummary = BookSummary & { role: "editor" | "viewer"; ownerName: string };

/** メンバーとして参加しているブック(§7.2) */
export async function listSharedBooks(userId: string): Promise<SharedBookSummary[]> {
  const rows = await db.bookMember.findMany({
    where: { userId, book: { deletedAt: null, hiddenByAdmin: false } },
    orderBy: { createdAt: "desc" },
    select: {
      role: true,
      book: {
        select: {
          id: true,
          title: true,
          description: true,
          tags: true,
          visibility: true,
          allowFork: true,
          version: true,
          updatedAt: true,
          ast: true,
          owner: { select: { name: true, loginId: true } },
        },
      },
    },
  });
  return rows.map(({ role, book }) => ({
    id: book.id,
    title: book.title,
    description: book.description,
    tags: book.tags,
    visibility: book.visibility,
    allowFork: book.allowFork,
    version: book.version,
    questionCount: countQuestions(book.ast as unknown as BookAst),
    updatedAt: book.updatedAt,
    role,
    ownerName: book.owner.name || book.owner.loginId || "匿名",
  }));
}

export async function listOwnBooks(ownerId: string): Promise<BookSummary[]> {
  const rows = await db.book.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      visibility: true,
      allowFork: true,
      version: true,
      updatedAt: true,
      ast: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags,
    visibility: row.visibility,
    allowFork: row.allowFork,
    version: row.version,
    questionCount: countQuestions(row.ast as unknown as BookAst),
    updatedAt: row.updatedAt,
  }));
}

function countQuestions(ast: BookAst): number {
  try {
    return collectQuestions(ast.blocks).length;
  } catch {
    return 0;
  }
}

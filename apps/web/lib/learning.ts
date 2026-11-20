import { db } from "./db";
import { bookRole, canEdit } from "./access";

/**
 * 学習履歴・統計・ブックマーク(SPEC_v4 §7.1 `/me/*`, `/books/:id/stats`)
 *
 * - 個人の履歴は本人のものだけを返す
 * - `abandoned` は採点しないため統計・復習対象から除外する(§7.4)
 */

export type AttemptSummary = {
  id: string;
  bookId: string;
  bookTitle: string;
  mode: string;
  status: string;
  score: string;
  maxScore: string;
  scoreRate: number | null;
  startedAt: string;
  finishedAt: string | null;
};

const rate = (score: string, max: string): number | null => {
  const maxValue = Number(max);
  if (!Number.isFinite(maxValue) || maxValue <= 0) return null;
  return Math.round((Number(score) / maxValue) * 1000) / 10;
};

export async function listMyAttempts(
  userId: string,
  options: { limit?: number; bookId?: string } = {},
): Promise<AttemptSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const rows = await db.attempt.findMany({
    where: { userId, ...(options.bookId ? { bookId: options.bookId } : {}) },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      bookId: true,
      mode: true,
      status: true,
      score: true,
      maxScore: true,
      startedAt: true,
      finishedAt: true,
      book: { select: { title: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    bookId: row.bookId,
    bookTitle: row.book.title,
    mode: row.mode,
    status: row.status,
    score: row.score.toFixed(2),
    maxScore: row.maxScore.toFixed(2),
    scoreRate: rate(row.score.toFixed(2), row.maxScore.toFixed(2)),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}

export type MyStats = {
  attempts: number;
  finished: number;
  averageRate: number | null;
  bestRate: number | null;
  byBook: Array<{ bookId: string; title: string; attempts: number; averageRate: number | null }>;
  recentDays: Array<{ date: string; count: number }>;
};

export async function myStats(userId: string): Promise<MyStats> {
  const rows = await db.attempt.findMany({
    where: { userId, status: { in: ["submitted", "expired"] } },
    orderBy: { startedAt: "desc" },
    take: 500,
    select: {
      bookId: true,
      score: true,
      maxScore: true,
      startedAt: true,
      book: { select: { title: true } },
    },
  });

  const rates = rows
    .map((r) => ({ r, v: rate(r.score.toFixed(2), r.maxScore.toFixed(2)) }))
    .filter((x): x is { r: (typeof rows)[number]; v: number } => x.v !== null);

  const byBook = new Map<string, { title: string; rates: number[]; attempts: number }>();
  for (const { r, v } of rates) {
    const entry = byBook.get(r.bookId) ?? { title: r.book.title, rates: [], attempts: 0 };
    entry.rates.push(v);
    entry.attempts += 1;
    byBook.set(r.bookId, entry);
  }

  const days = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.set(d.toISOString().slice(0, 10), 0);
  }
  for (const { r } of rates) {
    const key = r.startedAt.toISOString().slice(0, 10);
    if (days.has(key)) days.set(key, (days.get(key) ?? 0) + 1);
  }

  const all = rates.map((x) => x.v);
  return {
    attempts: await db.attempt.count({ where: { userId } }),
    finished: rows.length,
    averageRate: all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null,
    bestRate: all.length ? Math.max(...all) : null,
    byBook: [...byBook.entries()]
      .map(([bookId, entry]) => ({
        bookId,
        title: entry.title,
        attempts: entry.attempts,
        averageRate: Math.round((entry.rates.reduce((a, b) => a + b, 0) / entry.rates.length) * 10) / 10,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 8),
    recentDays: [...days.entries()].map(([date, count]) => ({ date, count })),
  };
}

export type BookStats = {
  attempts: number;
  finished: number;
  abandoned: number;
  inProgress: number;
  averageRate: number | null;
  questions: Array<{ questionId: string; answered: number; correctRate: number }>;
  recent: Array<{ attemptId: string; score: string; maxScore: string; finishedAt: string | null }>;
};

/** 作者向け統計(匿名集計)。個人は特定しない */
export async function bookStats(bookId: string, userId: string): Promise<BookStats | null> {
  const role = await bookRole(bookId, userId);
  if (!canEdit(role)) return null;

  const [attempts, finished, abandoned, inProgress, answers] = await Promise.all([
    db.attempt.count({ where: { bookId } }),
    db.attempt.findMany({
      where: { bookId, status: { in: ["submitted", "expired"] } },
      select: { id: true, score: true, maxScore: true, finishedAt: true },
      orderBy: { finishedAt: "desc" },
      take: 10,
    }),
    db.attempt.count({ where: { bookId, status: "abandoned" } }),
    db.attempt.count({ where: { bookId, status: "in_progress" } }),
    db.answer.findMany({
      where: { attempt: { bookId, status: { in: ["submitted", "expired"] } } },
      select: { questionId: true, blankId: true, correct: true },
    }),
  ]);

  const perQuestion = new Map<string, { answered: number; correct: number }>();
  for (const row of answers) {
    const entry = perQuestion.get(row.questionId) ?? { answered: 0, correct: 0 };
    entry.answered += 1;
    if (row.correct) entry.correct += 1;
    perQuestion.set(row.questionId, entry);
  }

  const rates = finished
    .map((a) => rate(a.score.toFixed(2), a.maxScore.toFixed(2)))
    .filter((v): v is number => v !== null);

  return {
    attempts,
    finished: rates.length,
    abandoned,
    inProgress,
    averageRate: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null,
    questions: [...perQuestion.entries()]
      .map(([questionId, entry]) => ({
        questionId,
        answered: entry.answered,
        correctRate: Math.round((entry.correct / entry.answered) * 1000) / 10,
      }))
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 50),
    recent: finished.map((a) => ({
      attemptId: a.id,
      score: a.score.toFixed(2),
      maxScore: a.maxScore.toFixed(2),
      finishedAt: a.finishedAt?.toISOString() ?? null,
    })),
  };
}

export type BookmarkEntry = {
  id: string;
  bookId: string;
  bookTitle: string;
  questionId: string | null;
  createdAt: string;
};

export async function listBookmarks(userId: string, bookId?: string): Promise<BookmarkEntry[]> {
  const rows = await db.bookmark.findMany({
    where: { userId, ...(bookId ? { bookId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      bookId: true,
      questionId: true,
      createdAt: true,
      book: { select: { title: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    bookId: row.bookId,
    bookTitle: row.book.title,
    questionId: row.questionId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type BookmarkResult =
  | { ok: true; bookmarked: boolean }
  | { ok: false; reason: "not_found" };

/** ブックマークの追加・解除(トグルではない。`bookmarked` の値に合わせる) */
export async function setBookmark(input: {
  userId: string;
  bookId?: string;
  questionId?: string | null;
  bookmarked: boolean;
}): Promise<BookmarkResult> {
  const bookId = input.bookId;
  const questionId = input.questionId ?? null;
  if (!bookId) return { ok: false, reason: "not_found" };

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, deletedAt: true, hiddenByAdmin: true },
  });
  if (!book || book.deletedAt || book.hiddenByAdmin) return { ok: false, reason: "not_found" };

  const existing = await db.bookmark.findFirst({
    where: { userId: input.userId, bookId, questionId },
    select: { id: true },
  });

  if (input.bookmarked) {
    if (!existing) {
      await db.bookmark.create({ data: { userId: input.userId, bookId, questionId } });
    }
    return { ok: true, bookmarked: true };
  }
  if (existing) await db.bookmark.delete({ where: { id: existing.id } });
  return { ok: true, bookmarked: false };
}

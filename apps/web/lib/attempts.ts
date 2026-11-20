import { Prisma, type Attempt, type Book } from "@prisma/client";
import {
  collectQuestions,
  gradeAttempt,
  gradeQuestion,
  toPublic,
  toPublicBlock,
  toResult,
  type ResultAnswer,
  type AnswerInput,
  type AttemptGrade,
  type BookAst,
  type QuestionGrade,
  type QuestionBlock,
  type SelfGrade,
} from "@qb/parser";
import { db } from "./db";
import { sha256 } from "./auth";
import { serverEnv } from "./env";
import { latestRevisions } from "./books";
import { re2Test } from "./regex";
import { mulberry32, type QuestionAnswer } from "./book";

/**
 * 受験と採点(SPEC_v4 §7.6〜§7.9)
 *
 * - 出題セットと順序は Attempt 開始時に確定し、`Attempt.settings` に保存する
 * - 正解・解説は原則サーバから出さない(練習モードの `check` と提出後のみ)
 * - 採点の正はサーバ。クライアントの採点結果は信用しない
 */

export type Actor = {
  userId: string | null;
  guestTokenHash: string | null;
};

export type AttemptSettings = {
  seed: number;
  questionIds: string[];
  practiceFeedback: boolean;
};

export type PlayReveal = {
  questionId: string;
  answers: ResultAnswer[];
  explain?: ReturnType<typeof toPublicBlock>[];
  model?: ReturnType<typeof toPublicBlock>[];
};

/** `check` と提出後に返す内容(正解・解説・模範解答。§7.7, §7.9) */
function playReveals(ast: BookAst, questionIds: string[]): PlayReveal[] {
  const byId = new Map(collectQuestions(ast.blocks).map((q) => [q.id, q]));
  return toResult(ast)
    .filter((r) => questionIds.includes(r.questionId))
    .map((r) => {
      const q = byId.get(r.questionId);
      return {
        questionId: r.questionId,
        answers: r.answers,
        ...(q?.explain ? { explain: q.explain.map(toPublicBlock) } : {}),
        ...(q?.model ? { model: q.model.map(toPublicBlock) } : {}),
      };
    });
}

export type PlayState = {
  attempt: {
    id: string;
    bookId: string;
    seed: number;
    mode: string;
    status: string;
    startedAt: string;
    deadlineAt: string | null;
    bookVersion: number;
    /** ゲスト受験(ログインユーザーに紐づかない)か */
    guest: boolean;
    /** 送信可能な最終時刻(期限 + 猶予) */
    submitBy: string | null;
  };
  book: {
    title: string;
    description?: string;
    timeLimit?: number;
    practiceFeedback: boolean;
    shuffleChoices: boolean;
    blocks: ReturnType<typeof toPublic>["blocks"];
    assets: ReturnType<typeof toPublic>["assets"];
  };
  order: string[];
  choices: Record<string, string[]>;
  answers: Record<string, QuestionAnswer>;
  result?: {
    grade: AttemptGrade;
    reveals: PlayReveal[];
    finishedAt: string;
  };
};

const jsonOf = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const isOwner = (attempt: Attempt, actor: Actor): boolean => {
  if (attempt.userId && actor.userId) return attempt.userId === actor.userId;
  if (!attempt.userId && attempt.guestTokenHash && actor.guestTokenHash) {
    return attempt.guestTokenHash === actor.guestTokenHash;
  }
  return false;
};

/** 出題対象の AST(受験開始時のバージョン)を取り出す */
async function astForAttempt(book: Book, bookVersion: number): Promise<BookAst> {
  if (book.version === bookVersion) return book.ast as unknown as BookAst;
  const snapshot = await db.bookVersion.findUnique({
    where: { bookId_version: { bookId: book.id, version: bookVersion } },
  });
  if (snapshot?.ast) return snapshot.ast as unknown as BookAst;
  return book.ast as unknown as BookAst;
}

const orderedQuestions = (ast: BookAst, settings: AttemptSettings): QuestionBlock[] => {
  const byId = new Map(collectQuestions(ast.blocks).map((q) => [q.id, q]));
  const ordered: QuestionBlock[] = [];
  for (const id of settings.questionIds) {
    const q = byId.get(id);
    if (q) ordered.push(q);
  }
  // 出題セットに無い設問が増えていても落とさない(保存済みの出題順を優先)
  if (ordered.length === 0) return [...byId.values()];
  return ordered;
};

/** 管理者だけは非公開化されたブックにも触れられる(§7.2) */
async function isAdminActor(actor: Actor): Promise<boolean> {
  if (!actor.userId) return false;
  const user = await db.user.findFirst({
    where: { id: actor.userId, role: "admin", deletedAt: null },
    select: { id: true },
  });
  return Boolean(user);
}

export type StartAttemptResult =
  | { ok: true; attemptId: string }
  | { ok: false; reason: "not_found" | "forbidden" };

export async function startAttempt(input: {
  bookId: string;
  actor: Actor;
  mode: "practice" | "exam" | "review";
  reviewOnly?: string[];
  /** link 公開のブックは共有トークンが必要(§3.5, §7.8) */
  shareToken?: string;
}): Promise<StartAttemptResult> {
  const book = await db.book.findUnique({ where: { id: input.bookId } });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };
  const owned = input.actor.userId !== null && book.ownerId === input.actor.userId;
  if (book.hiddenByAdmin && !(await isAdminActor(input.actor))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!owned) {
    if (book.visibility === "link") {
      // 共有トークンが一致しない限り受験できない
      if (!input.shareToken) return { ok: false, reason: "forbidden" };
      if (!book.shareTokenHash || book.shareTokenHash !== sha256(input.shareToken)) {
        return { ok: false, reason: "forbidden" };
      }
    } else if (book.visibility === "invite") {
      // 招待ブックはメンバーだけが受験できる(§7.2)
      if (!input.actor.userId) return { ok: false, reason: "forbidden" };
      const member = await db.bookMember.findUnique({
        where: { bookId_userId: { bookId: book.id, userId: input.actor.userId } },
        select: { role: true },
      });
      if (!member) return { ok: false, reason: "forbidden" };
    } else if (book.visibility !== "public") {
      return { ok: false, reason: "forbidden" };
    }
  }

  const ast = book.ast as unknown as BookAst;
  const all = collectQuestions(ast.blocks);
  const target =
    input.reviewOnly && input.reviewOnly.length > 0
      ? all.filter((q) => input.reviewOnly!.includes(q.id))
      : all;
  if (target.length === 0) return { ok: false, reason: "not_found" };

  const seed = Math.floor(Math.random() * 0xffffffff);
  const questionIds = ast.meta.shuffle.questions
    ? (() => {
        const rnd = mulberry32(seed);
        const arr = [...target.map((q) => q.id)];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [arr[i], arr[j]] = [arr[j]!, arr[i]!];
        }
        return arr;
      })()
    : target.map((q) => q.id);

  const settings: AttemptSettings = {
    seed,
    questionIds,
    practiceFeedback: ast.meta.practiceFeedback,
  };
  const startedAt = new Date();
  const timeLimitSeconds = ast.meta.timeLimit;

  const attempt = await db.attempt.create({
    data: {
      bookId: book.id,
      bookVersion: book.version,
      userId: input.actor.userId,
      guestTokenHash: input.actor.userId ? null : input.actor.guestTokenHash,
      mode: input.mode,
      settings: jsonOf(settings),
      maxScore: 0,
      startedAt,
      ...(timeLimitSeconds
        ? { deadlineAt: new Date(startedAt.getTime() + timeLimitSeconds * 1000) }
        : {}),
    },
  });
  return { ok: true, attemptId: attempt.id };
}

const submitDeadline = (attempt: Attempt): Date | null =>
  attempt.deadlineAt
    ? new Date(attempt.deadlineAt.getTime() + serverEnv.submitGraceSeconds * 1000)
    : null;

const isExpired = (attempt: Attempt, now = Date.now()): boolean => {
  const deadline = submitDeadline(attempt);
  return deadline !== null && now > deadline.getTime();
};

/** 回答行から画面用の回答を組み立てる */
function answersFromRows(
  rows: Array<{ questionId: string; blankId: string | null; value: unknown }>,
): Record<string, QuestionAnswer> {
  const out: Record<string, QuestionAnswer> = {};
  for (const row of rows) {
    const value = (row.value ?? {}) as Record<string, unknown>;
    if (row.blankId) {
      const current = out[row.questionId];
      const values = current && current.kind === "blanks" ? current.values : {};
      values[row.blankId] = typeof value.text === "string" ? value.text : "";
      out[row.questionId] = { kind: "blanks", values };
      continue;
    }
    if (Array.isArray(value.choiceIds)) {
      out[row.questionId] = {
        kind: "choice",
        choiceIds: value.choiceIds.filter((v): v is string => typeof v === "string"),
      };
    } else if (typeof value.boolean === "boolean") {
      out[row.questionId] = { kind: "boolean", value: value.boolean };
    } else if (typeof value.text === "string") {
      const selfGrade = value.selfGrade;
      out[row.questionId] = {
        kind: "essay",
        text: value.text,
        ...(selfGrade === "full" || selfGrade === "half" || selfGrade === "none"
          ? { selfGrade: selfGrade as SelfGrade }
          : {}),
      };
    }
  }
  return out;
}

export type LoadResult =
  | { ok: true; state: PlayState }
  | { ok: false; reason: "not_found" | "forbidden" };

export async function loadPlayState(
  attemptId: string,
  actor: Actor,
  depth = 0,
): Promise<LoadResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { book: true, answers: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, actor)) return { ok: false, reason: "forbidden" };

  // 期限切れのまま放置された受験は、開いた時点で確定する(cron が動かなくても破綻しない)
  if (attempt.status === "in_progress" && isExpired(attempt) && depth === 0) {
    await submitAttempt({ attemptId, actor, expired: true });
    return loadPlayState(attemptId, actor, 1);
  }

  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const publicBook = toPublic(ast);
  const settings = attempt.settings as unknown as AttemptSettings;
  const questions = orderedQuestions(ast, settings);

  const choiceOrder: Record<string, string[]> = {};
  const rnd = mulberry32(settings.seed ^ 0x9e3779b9);
  for (const q of questions) {
    const ids = (q.choices ?? []).map((c) => c.id);
    if (!ast.meta.shuffle.choices) {
      choiceOrder[q.id] = ids;
      continue;
    }
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    choiceOrder[q.id] = shuffled;
  }

  const state: PlayState = {
    attempt: {
      id: attempt.id,
      bookId: attempt.bookId,
      seed: settings.seed,
      mode: attempt.mode,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
      bookVersion: attempt.bookVersion,
      guest: !attempt.userId,
      submitBy: submitDeadline(attempt)?.toISOString() ?? null,
    },
    book: {
      title: publicBook.meta.title,
      ...(publicBook.meta.description ? { description: publicBook.meta.description } : {}),
      ...(publicBook.meta.timeLimit ? { timeLimit: publicBook.meta.timeLimit } : {}),
      practiceFeedback: publicBook.meta.practiceFeedback,
      shuffleChoices: publicBook.meta.shuffle.choices,
      blocks: publicBook.blocks,
      assets: publicBook.assets,
    },
    order: questions.map((q) => q.id),
    choices: choiceOrder,
    answers: answersFromRows(attempt.answers),
  };

  if (attempt.status === "submitted" || attempt.status === "expired") {
    const inputs = toInputs(attempt.answers);
    const grade = gradeAttempt(ast, questions, inputs, { regexTest: re2Test });
    state.result = {
      grade,
      reveals: playReveals(ast, settings.questionIds),
      finishedAt: (attempt.finishedAt ?? attempt.updatedAt).toISOString(),
    };
  }

  return { ok: true, state };
}

function toInputs(rows: Array<{ questionId: string; blankId: string | null; value: unknown }>): Map<string, AnswerInput> {
  const answers = answersFromRows(rows);
  const inputs = new Map<string, AnswerInput>();
  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer.kind === "blanks") inputs.set(questionId, { blanks: answer.values });
    else if (answer.kind === "choice") inputs.set(questionId, { choiceIds: answer.choiceIds });
    else if (answer.kind === "boolean") inputs.set(questionId, { boolean: answer.value });
    else inputs.set(questionId, { text: answer.text, ...(answer.selfGrade ? { selfGrade: answer.selfGrade } : {}) });
  }
  return inputs;
}

/**
 * (attemptId, questionId, blankId) は DB 側の `NULLS NOT DISTINCT` 一意索引で守る。
 * Prisma の型には現れないため findFirst + update/create で実装する。
 */
async function upsertAnswerRow(
  data: {
    attemptId: string;
    questionId: string;
    questionRevision: number;
    blankId: string | null;
    value: unknown;
  },
): Promise<void> {
  const where = {
    attemptId: data.attemptId,
    questionId: data.questionId,
    blankId: data.blankId,
  };
  const existing = await db.answer.findFirst({ where, select: { id: true } });
  if (existing) {
    await db.answer.update({
      where: { id: existing.id },
      data: { value: jsonOf(data.value), questionRevision: data.questionRevision },
    });
    return;
  }
  try {
    await db.answer.create({
      data: {
        attemptId: data.attemptId,
        questionId: data.questionId,
        questionRevision: data.questionRevision,
        blankId: data.blankId,
        value: jsonOf(data.value),
      },
    });
  } catch (error) {
    // 同時更新で一意制約に当たった場合は更新に切り替える
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await db.answer.findFirst({ where, select: { id: true } });
      if (row) {
        await db.answer.update({
          where: { id: row.id },
          data: { value: jsonOf(data.value), questionRevision: data.questionRevision },
        });
        return;
      }
    }
    throw error;
  }
}

export type AnswerValue =
  | { text: string }
  | { choiceIds: string[] }
  | { boolean: boolean }
  | { text: string; selfGrade?: SelfGrade };

export type SaveAnswerResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "closed" | "invalid" };

export async function saveAnswer(input: {
  attemptId: string;
  actor: Actor;
  questionId: string;
  blankId: string | null;
  value: AnswerValue;
  questionRevision: number;
}): Promise<SaveAnswerResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { book: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, input.actor)) return { ok: false, reason: "forbidden" };
  if (attempt.status !== "in_progress") return { ok: false, reason: "closed" };
  if (isExpired(attempt)) {
    await submitAttempt({ attemptId: attempt.id, actor: input.actor, expired: true });
    return { ok: false, reason: "closed" };
  }

  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const settings = attempt.settings as unknown as AttemptSettings;
  if (!settings.questionIds.includes(input.questionId)) return { ok: false, reason: "invalid" };
  const question = orderedQuestions(ast, settings).find((q) => q.id === input.questionId);
  if (!question) return { ok: false, reason: "invalid" };

  const serialized = JSON.stringify(input.value);
  if (serialized.length > serverEnv.answerMaxChars) return { ok: false, reason: "invalid" };

  await upsertAnswerRow({
    attemptId: attempt.id,
    questionId: input.questionId,
    questionRevision: input.questionRevision,
    blankId: input.blankId,
    value: input.value,
  });
  return { ok: true };
}

export type SubmitResult =
  | { ok: true; grade: AttemptGrade; reveals: PlayReveal[] }
  | { ok: false; reason: "not_found" | "forbidden" | "closed" };

export async function submitAttempt(input: {
  attemptId: string;
  actor: Actor;
  expired?: boolean;
  selfGrades?: Record<string, SelfGrade>;
}): Promise<SubmitResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { book: true, answers: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, input.actor)) return { ok: false, reason: "forbidden" };

  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const settings = attempt.settings as unknown as AttemptSettings;
  const questions = orderedQuestions(ast, settings);

  if (attempt.status !== "in_progress") {
    const inputs = toInputs(attempt.answers);
    const grade = gradeAttempt(ast, questions, inputs, { regexTest: re2Test });
    return {
      ok: true,
      grade,
      reveals: playReveals(ast, settings.questionIds),
    };
  }

  // 自己採点(essay)を取り込む
  const selfGrades = input.selfGrades ?? {};
  for (const [questionId, grade] of Object.entries(selfGrades)) {
    if (!["full", "half", "none"].includes(grade)) continue;
    const question = questions.find((q) => q.id === questionId);
    if (!question || question.kind !== "essay") continue;
    const existing = attempt.answers.find((a) => a.questionId === questionId && a.blankId === null);
    const text = existing ? ((existing.value as Record<string, unknown>).text as string) : "";
    await upsertAnswerRow({
      attemptId: attempt.id,
      questionId,
      questionRevision: existing?.questionRevision ?? 1,
      blankId: null,
      value: { text: text ?? "", selfGrade: grade },
    });
  }

  const rows = await db.answer.findMany({ where: { attemptId: attempt.id } });
  const inputs = toInputs(rows);
  const grade = gradeAttempt(ast, questions, inputs, { regexTest: re2Test });
  const gradeByQuestion = new Map(grade.questions.map((q) => [q.questionId, q]));

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const qg = gradeByQuestion.get(row.questionId);
      if (!qg) continue;
      const blank = row.blankId ? qg.blanks?.find((b) => b.blankId === row.blankId) : undefined;
      const correct = blank ? blank.correct : qg.correct;
      const points = blank ? blank.points : qg.score;
      await tx.answer.update({
        where: { id: row.id },
        data: {
          correct: correct ?? null,
          points,
          ...(qg.kind === "essay" ? { selfGraded: qg.selfGraded } : {}),
        },
      });
    }
    await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        status: input.expired ? "expired" : "submitted",
        finishedAt: new Date(),
        score: grade.score,
        maxScore: grade.maxScore,
      },
    });
  });

  return {
    ok: true,
    grade,
    reveals: playReveals(ast, settings.questionIds),
  };
}

/** 期限切れの Attempt を回収する(バッチ・cron 用。§9) */
export async function expireStaleAttempts(limit = 50): Promise<number> {
  const now = new Date(Date.now() - serverEnv.submitGraceSeconds * 1000);
  const stale = await db.attempt.findMany({
    where: { status: "in_progress", deadlineAt: { lt: now } },
    select: { id: true, userId: true, guestTokenHash: true },
    take: limit,
  });
  let expired = 0;
  for (const row of stale) {
    const result = await submitAttempt({
      attemptId: row.id,
      actor: { userId: row.userId, guestTokenHash: row.guestTokenHash },
      expired: true,
    });
    if (result.ok) expired += 1;
  }
  return expired;
}

export { latestRevisions };

/* ------------------------------------------------------------------ *
 * 即時採点・中断・自己採点・結果(§7.4, §7.5, §7.7, §7.9)
 * ------------------------------------------------------------------ */

export type CheckResult =
  | { ok: true; question: QuestionGrade; reveal: PlayReveal }
  | {
      ok: false;
      reason: "not_found" | "forbidden" | "closed" | "not_allowed" | "invalid";
    };

/**
 * 設問単位の即時採点(練習・復習モード + `practiceFeedback: true` のみ)
 * 正誤・得点に加え、その設問の正解・解説・模範解答を返す。
 * 応答後は `Answer.checkedAt` を記録し、受験画面では回答欄をロックする。
 */
export async function checkQuestion(input: {
  attemptId: string;
  actor: Actor;
  questionId: string;
}): Promise<CheckResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { book: true, answers: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, input.actor)) return { ok: false, reason: "forbidden" };
  if (attempt.status !== "in_progress") return { ok: false, reason: "closed" };
  if (isExpired(attempt)) {
    await submitAttempt({ attemptId: attempt.id, actor: input.actor, expired: true });
    return { ok: false, reason: "closed" };
  }
  if (attempt.mode === "exam") return { ok: false, reason: "not_allowed" };

  const settings = attempt.settings as unknown as AttemptSettings;
  if (!settings.practiceFeedback) return { ok: false, reason: "not_allowed" };

  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const questions = orderedQuestions(ast, settings);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question) return { ok: false, reason: "invalid" };

  const inputs = toInputs(attempt.answers);
  const grade = gradeQuestion(question, inputs.get(question.id), {
    normalize: ast.meta.normalize,
    regexTest: re2Test,
  });

  const reveal = playReveals(ast, [question.id])[0];
  if (!reveal) return { ok: false, reason: "invalid" };

  // 未回答の essay も開示後に自己採点できるよう、空の回答行を用意する
  if (question.kind === "essay") {
    const existing = attempt.answers.find((a) => a.questionId === question.id && a.blankId === null);
    if (!existing) {
      await upsertAnswerRow({
        attemptId: attempt.id,
        questionId: question.id,
        questionRevision: 1,
        blankId: null,
        value: { text: "" },
      });
    }
  }

  // 自己採点の前提として「開示済み」を記録する(§7.5)
  await db.answer.updateMany({
    where: { attemptId: attempt.id, questionId: question.id },
    data: { checkedAt: new Date() },
  });

  return { ok: true, question: grade, reveal };
}

export type AbandonResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "closed" };

/** 受験の中断(採点しない。統計・復習対象から外れる) */
export async function abandonAttempt(input: {
  attemptId: string;
  actor: Actor;
}): Promise<AbandonResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    select: { id: true, userId: true, guestTokenHash: true, status: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt as Attempt, input.actor)) return { ok: false, reason: "forbidden" };
  if (attempt.status !== "in_progress") return { ok: false, reason: "closed" };

  await db.attempt.update({
    where: { id: attempt.id },
    data: { status: "abandoned", finishedAt: new Date() },
  });
  return { ok: true };
}

export type SelfGradeResult =
  | { ok: true; grade: AttemptGrade }
  | { ok: false; reason: "not_found" | "forbidden" | "closed" | "invalid" };

/** essay の自己採点(模範解答の開示後 = check 済み or 終端状態のみ) */
export async function selfGradeQuestion(input: {
  attemptId: string;
  actor: Actor;
  questionId: string;
  selfGrade: SelfGrade;
}): Promise<SelfGradeResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { book: true, answers: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, input.actor)) return { ok: false, reason: "forbidden" };
  if (attempt.status === "abandoned") return { ok: false, reason: "closed" };

  const settings = attempt.settings as unknown as AttemptSettings;
  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const questions = orderedQuestions(ast, settings);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question || question.kind !== "essay") return { ok: false, reason: "invalid" };

  const existing = attempt.answers.find((a) => a.questionId === question.id && a.blankId === null);
  const revealed =
    attempt.status === "submitted" ||
    attempt.status === "expired" ||
    Boolean(existing?.checkedAt);
  if (!revealed) return { ok: false, reason: "closed" };

  const text = existing ? String((existing.value as Record<string, unknown>).text ?? "") : "";
  await upsertAnswerRow({
    attemptId: attempt.id,
    questionId: question.id,
    questionRevision: existing?.questionRevision ?? 1,
    blankId: null,
    value: { text, selfGrade: input.selfGrade },
  });

  const rows = await db.answer.findMany({ where: { attemptId: attempt.id } });
  const inputs = toInputs(rows);
  const grade = gradeAttempt(ast, questions, inputs, { regexTest: re2Test });

  // 設問得点と合計を再集計する
  await db.$transaction(async (tx) => {
    const byQuestion = new Map(grade.questions.map((q) => [q.questionId, q]));
    for (const row of rows) {
      const qg = byQuestion.get(row.questionId);
      if (!qg) continue;
      const blank = row.blankId ? qg.blanks?.find((b) => b.blankId === row.blankId) : undefined;
      await tx.answer.update({
        where: { id: row.id },
        data: {
          correct: (blank ? blank.correct : qg.correct) ?? null,
          points: blank ? blank.points : qg.score,
          ...(qg.kind === "essay" ? { selfGraded: qg.selfGraded } : {}),
        },
      });
    }
    await tx.attempt.update({
      where: { id: attempt.id },
      data: { score: grade.score, maxScore: grade.maxScore },
    });
  });

  return { ok: true, grade };
}

export type AttemptResultView = {
  attempt: {
    id: string;
    bookId: string;
    bookTitle: string;
    mode: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    score: string;
    maxScore: string;
    scoreRate: number | null;
  };
  grade: AttemptGrade;
  reveals: PlayReveal[];
  canSelfGrade: string[];
  /** 復習表示用の公開ブロック(出題順)と提出済みの回答 */
  blocks: PlayState["book"]["blocks"];
  assets: PlayState["book"]["assets"];
  order: string[];
  answers: PlayState["answers"];
  practiceFeedback: boolean;
};

export type ResultResult =
  | { ok: true; result: AttemptResultView }
  | { ok: false; reason: "not_found" | "forbidden" | "not_finished" };

/** 結果・解説(終端状態の submitted / expired のみ。§7.9) */
export async function loadResult(input: {
  attemptId: string;
  actor: Actor;
}): Promise<ResultResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { book: true, answers: true },
  });
  if (!attempt) return { ok: false, reason: "not_found" };
  if (!isOwner(attempt, input.actor)) return { ok: false, reason: "forbidden" };
  if (attempt.status !== "submitted" && attempt.status !== "expired") {
    return { ok: false, reason: "not_finished" };
  }

  const settings = attempt.settings as unknown as AttemptSettings;
  const ast = await astForAttempt(attempt.book, attempt.bookVersion);
  const questions = orderedQuestions(ast, settings);
  const grade = gradeAttempt(ast, questions, toInputs(attempt.answers), { regexTest: re2Test });
  const publicBook = toPublic(ast);

  const maxValue = Number(attempt.maxScore);
  return {
    ok: true,
    result: {
      blocks: publicBook.blocks,
      assets: publicBook.assets,
      order: settings.questionIds,
      answers: answersFromRows(attempt.answers),
      practiceFeedback: settings.practiceFeedback,
      attempt: {
        id: attempt.id,
        bookId: attempt.bookId,
        bookTitle: (attempt.book.ast as unknown as BookAst).meta.title,
        mode: attempt.mode,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        score: attempt.score.toFixed(2),
        maxScore: attempt.maxScore.toFixed(2),
        scoreRate:
          maxValue > 0 ? Math.round((Number(attempt.score) / maxValue) * 1000) / 10 : null,
      },
      grade,
      reveals: playReveals(ast, settings.questionIds),
      canSelfGrade: questions.filter((q) => q.kind === "essay").map((q) => q.id),
    },
  };
}

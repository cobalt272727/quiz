import {
  collectQuestions,
  gradeAttempt,
  toPublic,
  toPublicBlock,
  toResult,
  type AnswerInput,
  type AttemptGrade,
  type Block,
  type BookAst,
  type PublicBlock,
  type QuestionBlock,
  type QuestionGrade,
  type ResultAnswer,
  type SelfGrade,
} from "@qb/parser";

/** 画面で保持する回答(設問単位) */
export type QuestionAnswer =
  | { kind: "blanks"; values: Record<string, string> }
  | { kind: "choice"; choiceIds: string[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "essay"; text: string; selfGrade?: SelfGrade };

/**
 * 提出後にだけ見せてよい内容(§7.9)。
 * 内部ブロックをそのまま持たず、公開射影した形で保持する。
 */
export type Reveal = {
  answers: ResultAnswer[];
  explain?: PublicBlock[];
  model?: PublicBlock[];
};

export function questionsOf(ast: BookAst): QuestionBlock[] {
  return collectQuestions(ast.blocks);
}

export function publicBook(ast: BookAst): ReturnType<typeof toPublic> {
  return toPublic(ast);
}

export function emptyAnswer(q: QuestionBlock): QuestionAnswer {
  switch (q.kind) {
    case "single":
    case "multi":
      return { kind: "choice", choiceIds: [] };
    case "truefalse":
      return { kind: "boolean", value: false };
    case "essay":
      return { kind: "essay", text: "" };
    default:
      return { kind: "blanks", values: {} };
  }
}

export function toAnswerInput(a: QuestionAnswer | undefined): AnswerInput | undefined {
  if (!a) return undefined;
  switch (a.kind) {
    case "blanks":
      return { blanks: a.values };
    case "choice":
      return { choiceIds: a.choiceIds };
    case "boolean":
      return { boolean: a.value };
    case "essay":
      return { text: a.text, ...(a.selfGrade ? { selfGrade: a.selfGrade } : {}) };
  }
}

export function gradeBook(
  ast: BookAst,
  questions: QuestionBlock[],
  answers: Record<string, QuestionAnswer>,
): AttemptGrade {
  const inputs = new Map<string, AnswerInput>();
  for (const q of questions) {
    const input = toAnswerInput(answers[q.id]);
    if (input) inputs.set(q.id, input);
  }
  return gradeAttempt(ast, questions, inputs);
}

export function buildReveals(ast: BookAst): Map<string, Reveal> {
  const byId = new Map<string, QuestionBlock>();
  for (const q of questionsOf(ast)) byId.set(q.id, q);
  const out = new Map<string, Reveal>();
  for (const entry of toResult(ast)) {
    const q = byId.get(entry.questionId);
    out.set(entry.questionId, {
      answers: entry.answers,
      ...(q?.explain ? { explain: q.explain.map(toPublicBlock) } : {}),
      ...(q?.model ? { model: q.model.map(toPublicBlock) } : {}),
    });
  }
  return out;
}

export function resultMap(grade: AttemptGrade): Map<string, QuestionGrade> {
  return new Map(grade.questions.map((q) => [q.questionId, q]));
}

/** 空欄 ID を本文の出現順に集める(公開射影でも `t` と `id` だけ見る) */
export function collectBlankIds(blocks: PublicBlock[]): string[] {
  const out: string[] = [];
  const walkInlines = (inlines: PublicBlock extends never ? never : unknown[]) => {
    for (const raw of inlines as Array<Record<string, unknown>>) {
      if (raw.t === "blank" || raw.t === "choiceBlank") out.push(String(raw.id));
      else if (Array.isArray(raw.c)) walkInlines(raw.c);
    }
  };
  const walk = (bs: PublicBlock[]) => {
    for (const b of bs) {
      if (b.type === "paragraph") walkInlines(b.c);
      else if (b.type === "list") b.items.forEach(walk);
      else if (b.type === "table") {
        b.header.forEach(walkInlines);
        b.rows.forEach((row) => row.forEach(walkInlines));
      } else if (b.type === "question") walk(b.body);
    }
  };
  walk(blocks);
  return out;
}

/* ------------------------------------------------------------------ */
/* シャッフル(seed 固定で再現可能)                                     */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export type PlayPlan = {
  questions: QuestionBlock[];
  /** 設問 ID → 表示順の選択肢 ID(シャッフルは表示のみ。保存値は ID) */
  choiceOrder: Map<string, string[]>;
};

export function planPlay(ast: BookAst, seed: number, opts?: { reviewOnly?: string[] }): PlayPlan {
  const rnd = mulberry32(seed);
  const all = questionsOf(ast);
  const target =
    opts?.reviewOnly && opts.reviewOnly.length > 0
      ? all.filter((q) => opts.reviewOnly!.includes(q.id))
      : all;
  const questions = ast.meta.shuffle.questions ? shuffleWith(target, rnd) : target;

  const choiceOrder = new Map<string, string[]>();
  for (const q of questions) {
    const ids = (q.choices ?? []).map((c) => c.id);
    choiceOrder.set(q.id, ast.meta.shuffle.choices ? shuffleWith(ids, rnd) : ids);
  }
  return { questions, choiceOrder };
}

export function newSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

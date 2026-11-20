/**
 * 採点(§4.5)
 *
 * 正はサーバ。`normalize` はブック全体の設定を実効値として使う(§4.6)。
 */

import type { BookAst, Matcher, QKind, QuestionBlock } from "./types.ts";
import { collectBlanks } from "./types.ts";
import {
  centsToString,
  decimalToFrac,
  fracAdd,
  fracCompare,
  fracMul,
  parsePointsToFrac,
  roundToCentsHalfUp,
  withinTolerance,
  type Frac,
} from "./decimal.ts";
import {
  normalizeForCompare,
  normalizeForRegex,
  normalizeNumberAnswer,
  REGEX_MAX_INPUT_LENGTH,
  TEXT_ANSWER_MAX_LENGTH,
  validateRegexSubset,
} from "./text.ts";

export type SelfGrade = "full" | "half" | "none";

export type AnswerInput = {
  /** blankId → 回答値(選択肢空欄は選択肢インデックス) */
  blanks?: Record<string, string>;
  /** single / multi の選択肢 ID */
  choiceIds?: string[];
  /** truefalse */
  boolean?: boolean;
  /** essay の本文 */
  text?: string;
  /** essay の自己採点 */
  selfGrade?: SelfGrade;
};

export type BlankGrade = {
  blankId: string;
  correct: boolean;
  answered: boolean;
  /** 按分した表示用得点(小数 2 桁) */
  points: string;
};

export type QuestionGrade = {
  questionId: string;
  kind: QKind;
  answered: boolean;
  /** essay は自己採点待ちのため null */
  correct: boolean | null;
  selfGraded: boolean;
  /** 小数 2 桁 */
  score: string;
  maxScore: string;
  blanks?: BlankGrade[];
};

export type AttemptGrade = {
  score: string;
  maxScore: string;
  questions: QuestionGrade[];
  /** 復習対象(§8) */
  reviewQuestionIds: string[];
};

export type GradeOptions = {
  /** 実効の normalize 設定(ブック全体) */
  normalize: { kana: boolean };
  /** 正規表現の実行エンジン(サーバでは re2 を差し込む) */
  regexTest?: (pattern: string, flags: string, input: string) => boolean;
};

const defaultRegexTest = (pattern: string, flags: string, input: string): boolean => {
  try {
    return new RegExp(`^(?:${pattern})$`, flags).test(input);
  } catch {
    return false;
  }
};

export function gradeQuestion(
  question: QuestionBlock,
  answer: AnswerInput | undefined,
  options: GradeOptions,
): QuestionGrade {
  const maxCents = pointsToCents(question.points);
  const blankList = collectBlanks(question.body);

  if (question.kind === "blank" && blankList.length > 0) {
    return gradeBlankQuestion(question, blankList, answer, options, maxCents);
  }

  if (question.kind === "single" || question.kind === "multi") {
    return gradeChoiceQuestion(question, answer, maxCents);
  }

  if (question.kind === "truefalse") {
    const answered = typeof answer?.boolean === "boolean";
    const correct = answered && answer!.boolean === question.answer;
    return {
      questionId: question.id,
      kind: question.kind,
      answered,
      correct,
      selfGraded: false,
      score: correct ? centsToString(maxCents) : centsToString(0n),
      maxScore: centsToString(maxCents),
    };
  }

  // essay
  const text = answer?.text ?? "";
  const answered = text.trim() !== "";
  const selfGrade = answer?.selfGrade;
  const selfGraded = selfGrade !== undefined && selfGrade !== null;
  let cents = 0n;
  if (selfGraded) {
    if (selfGrade === "full") cents = maxCents;
    else if (selfGrade === "half") cents = roundToCentsHalfUp(fracHalf(maxCents));
    else cents = 0n;
  }
  return {
    questionId: question.id,
    kind: question.kind,
    answered,
    correct: null,
    selfGraded,
    score: centsToString(cents),
    maxScore: centsToString(maxCents),
  };
}

function fracHalf(cents: bigint): Frac {
  return { num: cents, den: 200n };
}

function pointsToCents(points: number): bigint {
  const f = parsePointsToFrac(points);
  return f ? roundToCentsHalfUp(f) : 0n;
}

function gradeBlankQuestion(
  question: QuestionBlock,
  blankList: ReturnType<typeof collectBlanks>,
  answer: AnswerInput | undefined,
  options: GradeOptions,
  maxCents: bigint,
): QuestionGrade {
  const pointsFrac = parsePointsToFrac(question.points) ?? { num: 0n, den: 1n };
  const weights = blankList.map((b) => parsePointsToFrac(b.weight) ?? { num: 1n, den: 1n });
  const totalWeight = weights.reduce<Frac>((acc, w) => fracAdd(acc, w), { num: 0n, den: 1n });

  const results: BlankGrade[] = [];
  let correctWeight: Frac = { num: 0n, den: 1n };
  let answeredAny = false;

  blankList.forEach((blank, idx) => {
    const raw = answer?.blanks?.[blank.id];
    const value = typeof raw === "string" ? raw : "";
    const hasValue = value.trim() !== "";
    if (hasValue) answeredAny = true;

    const correct = hasValue
      ? blank.t === "choiceBlank"
        ? checkChoiceBlank(blank.correct, value)
        : checkMatchers(blank.answers, value, options)
      : false;

    if (correct) correctWeight = fracAdd(correctWeight, weights[idx]);
    results.push({ blankId: blank.id, correct, answered: hasValue, points: "0.00" });
  });

  const scoreFrac = totalWeight.num === 0n ? { num: 0n, den: 1n } : fracMul(pointsFrac, { num: correctWeight.num * totalWeight.den, den: correctWeight.den * totalWeight.num });
  const scoreCents = roundToCentsHalfUp(scoreFrac);

  // 空欄別の按分値。合算が設問得点と一致するよう端数を最後の正解空欄で調整する
  let allocated = 0n;
  let lastCorrectIndex = -1;
  results.forEach((r, idx) => {
    if (!r.correct) return;
    const share = totalWeight.num === 0n
      ? 0n
      : roundToCentsHalfUp(fracMul(pointsFrac, { num: weights[idx].num * totalWeight.den, den: weights[idx].den * totalWeight.num }));
    allocated += share;
    r.points = centsToString(share);
    lastCorrectIndex = idx;
  });
  if (lastCorrectIndex >= 0) {
    const adjusted = scoreCents - allocated + BigInt(results[lastCorrectIndex].points.replace(".", ""));
    results[lastCorrectIndex].points = centsToString(adjusted);
  }

  return {
    questionId: question.id,
    kind: question.kind,
    answered: answeredAny,
    correct: scoreCents === maxCents && maxCents > 0n,
    selfGraded: false,
    score: centsToString(scoreCents),
    maxScore: centsToString(maxCents),
    blanks: results,
  };
}

function checkChoiceBlank(correct: number[], value: string): boolean {
  const idx = Number.parseInt(value, 10);
  if (!Number.isInteger(idx)) return false;
  return correct.includes(idx);
}

function checkMatchers(matchers: Matcher[], raw: string, options: GradeOptions): boolean {
  if (matchers.length === 0) return false;
  const hasNumber = matchers.some((m) => m.kind === "number");
  if (hasNumber) {
    const parsed = normalizeNumberAnswer(raw);
    if (parsed === null) return false;
    return matchers.some(
      (m) => m.kind === "number" && withinTolerance(parsed, m.v, m.tol),
    );
  }
  if (raw.length > TEXT_ANSWER_MAX_LENGTH) return false;
  const regexTest = options.regexTest ?? defaultRegexTest;
  for (const m of matchers) {
    if (m.kind === "exact") {
      if (normalizeForCompare(raw, options.normalize) === normalizeForCompare(m.v, options.normalize)) {
        return true;
      }
      continue;
    }
    if (m.kind === "regex") {
      if (!validateRegexSubset(m.pattern, m.flags ?? "").ok) continue;
      if (raw.length > REGEX_MAX_INPUT_LENGTH) continue;
      const input = normalizeForRegex(raw);
      if (regexTest(m.pattern, m.flags ?? "", input)) return true;
    }
  }
  return false;
}

function gradeChoiceQuestion(
  question: QuestionBlock,
  answer: AnswerInput | undefined,
  maxCents: bigint,
): QuestionGrade {
  const choices = question.choices ?? [];
  const correctIds = new Set(choices.filter((c) => c.correct).map((c) => c.id));
  const selected = new Set(answer?.choiceIds ?? []);
  const answered = selected.size > 0;

  if (question.kind === "single") {
    const correct = selected.size === 1 && [...selected].every((id) => correctIds.has(id));
    return {
      questionId: question.id,
      kind: question.kind,
      answered,
      correct,
      selfGraded: false,
      score: correct ? centsToString(maxCents) : centsToString(0n),
      maxScore: centsToString(maxCents),
    };
  }

  if (question.scoring === "partial") {
    let good = 0;
    let bad = 0;
    for (const id of selected) {
      if (correctIds.has(id)) good++;
      else bad++;
    }
    const numerator = Math.max(0, good - bad);
    const denom = correctIds.size;
    const fracScore: Frac =
      denom === 0 ? { num: 0n, den: 1n } : { num: BigInt(numerator), den: BigInt(denom) };
    const cents = roundToCentsHalfUp(fracMul(decimalToFrac({ sign: 1, digits: BigInt(maxCents).toString(), exp: -2 }), fracScore));
    return {
      questionId: question.id,
      kind: question.kind,
      answered,
      correct: cents === maxCents && maxCents > 0n,
      selfGraded: false,
      score: centsToString(cents),
      maxScore: centsToString(maxCents),
    };
  }

  const exactMatch =
    selected.size === correctIds.size && [...selected].every((id) => correctIds.has(id));
  return {
    questionId: question.id,
    kind: question.kind,
    answered,
    correct: exactMatch,
    selfGraded: false,
    score: exactMatch ? centsToString(maxCents) : centsToString(0n),
    maxScore: centsToString(maxCents),
  };
}

/** 出題セット全体を採点する */
export function gradeAttempt(
  ast: BookAst,
  questions: QuestionBlock[],
  answers: Map<string, AnswerInput>,
  options?: Partial<GradeOptions>,
): AttemptGrade {
  const opts: GradeOptions = {
    normalize: options?.normalize ?? ast.meta.normalize,
    regexTest: options?.regexTest,
  };
  const results = questions.map((q) => gradeQuestion(q, answers.get(q.id), opts));
  let score = 0n;
  let max = 0n;
  const review: string[] = [];

  for (const r of results) {
    score += BigInt(r.score.replace(".", ""));
    max += BigInt(r.maxScore.replace(".", ""));
    if (r.kind === "essay") {
      const self = answers.get(r.questionId)?.selfGrade;
      if (self === "half" || self === "none") review.push(r.questionId);
    } else if (!r.correct || BigInt(r.score.replace(".", "")) < BigInt(r.maxScore.replace(".", ""))) {
      review.push(r.questionId);
    }
  }

  return {
    score: centsToString(score),
    maxScore: centsToString(max),
    questions: results,
    reviewQuestionIds: review,
  };
}

/** 復習対象の判定(単体) */
export function isReviewTarget(grade: QuestionGrade, selfGrade?: SelfGrade): boolean {
  if (grade.kind === "essay") return selfGrade === "half" || selfGrade === "none";
  return (grade.correct !== true) || fracCompare(
    { num: BigInt(grade.score.replace(".", "")), den: 1n },
    { num: BigInt(grade.maxScore.replace(".", "")), den: 1n },
  ) < 0;
}

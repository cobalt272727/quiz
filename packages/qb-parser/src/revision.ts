/**
 * 設問リビジョン(§4.6)
 *
 * 「採点に影響する変更」だけで `QuestionRevision` を増やすための正規化表現。
 * 本文の誤字修正や解説の追記ではリビジョンを増やさない。
 */

import type { Block, GradingSnapshot, Matcher, QuestionBlock } from "./types.ts";
import { collectBlanks } from "./types.ts";

const matcherKey = (m: Matcher): string => {
  switch (m.kind) {
    case "exact":
      return `exact:${m.v}`;
    case "regex":
      return `regex:${m.pattern}:${m.flags ?? ""}`;
    case "number":
      return `number:${m.v}:${m.tol ?? ""}`;
  }
};

/** 空欄を文書順に集め、採点に必要な情報だけを取り出す */
export function buildGradingSnapshot(
  question: QuestionBlock,
  normalizeKana: boolean,
): GradingSnapshot {
  const blanks = collectBlanks(question.body).map((blank) => {
    if (blank.t === "blank") {
      return {
        id: blank.id,
        weight: blank.weight,
        matchers: blank.answers,
      };
    }
    return {
      id: blank.id,
      weight: blank.weight,
      matchers: [] as Matcher[],
      choiceCorrect: [...blank.correct].sort((a, b) => a - b),
    };
  });

  const snapshot: GradingSnapshot = {
    kind: question.kind,
    points: question.points,
    normalizeKana,
    blanks,
  };
  if (question.scoring) snapshot.scoring = question.scoring;
  if (question.kind === "truefalse") snapshot.answer = question.answer;
  if (question.choices) {
    snapshot.choices = question.choices.map((c) => ({ id: c.id, correct: c.correct }));
  }
  return snapshot;
}

/**
 * スナップショットの正規化文字列。同じ内容なら常に同じ文字列になる
 * (キー順を固定し、並びはソース順=文書順に従う)。
 */
export function serializeGradingSnapshot(snapshot: GradingSnapshot): string {
  const blanks = snapshot.blanks.map((b) => {
    const parts = [`${b.id}/${b.weight}`, ...b.matchers.map(matcherKey)];
    if (b.choiceCorrect) parts.push(`c[${b.choiceCorrect.join(",")}]`);
    return parts.join("|");
  });
  const choices = snapshot.choices?.map((c) => `${c.id}:${c.correct ? 1 : 0}`).join(",") ?? "";
  return JSON.stringify([
    snapshot.kind,
    snapshot.points,
    snapshot.scoring ?? "",
    snapshot.kind === "truefalse" ? (snapshot.answer ? 1 : 0) : "",
    snapshot.normalizeKana ? 1 : 0,
    blanks,
    choices,
  ]);
}

/** 設問の採点定義の同一性判定に使うキー(サーバでハッシュ化して保存する) */
export function gradingKey(question: QuestionBlock, normalizeKana: boolean): string {
  return serializeGradingSnapshot(buildGradingSnapshot(question, normalizeKana));
}

/** 採点に影響する変更があったかを比べる */
export function needsNewRevision(
  previous: GradingSnapshot,
  next: GradingSnapshot,
): boolean {
  return serializeGradingSnapshot(previous) !== serializeGradingSnapshot(next);
}

/** ブロック木から設問 ID → スナップショットを作る(サーバの保存時検証用) */
export function gradingSnapshotsByQuestion(
  blocks: Block[],
  normalizeKana: boolean,
): Map<string, GradingSnapshot> {
  const out = new Map<string, GradingSnapshot>();
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "question") {
        out.set(b.id, buildGradingSnapshot(b, normalizeKana));
        walk(b.body);
        if (b.model) walk(b.model);
        if (b.explain) walk(b.explain);
        if (b.hint) walk(b.hint);
      } else if (b.type === "list") {
        b.items.forEach(walk);
      } else if (b.type === "table") {
        // 表・段落には設問は現れない(§4.3)
      }
    }
  };
  walk(blocks);
  return out;
}

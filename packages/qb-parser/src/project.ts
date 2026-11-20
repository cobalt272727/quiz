/**
 * 受験用の公開射影(§5.3)と結果用の整形(§7.9)
 *
 * `toPublic` は許可リスト方式で組み立てる。内部 AST をコピーして
 * 秘密フィールドを削除する方式には依存しない(§5.3)。
 */

import type {
  BookAst,
  Inline,
  Matcher,
  Meta,
  Asset,
  QKind,
  QuestionBlock,
  TableBlock,
} from "./types.ts";
import { AST_VERSION } from "./types.ts";
import { decimalToPlainString, parseDecimal } from "./decimal.ts";

export type PublicInline =
  | { t: "text"; v: string }
  | { t: "strong"; c: PublicInline[] }
  | { t: "em"; c: PublicInline[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "link"; href: string; c: PublicInline[] }
  | { t: "blank"; id: string; weight: number; input: "text" | "number" }
  | { t: "choiceBlank"; id: string; weight: number; options: string[] };

export type PublicChoice = { id: string; label: PublicInline[] };

export type PublicQuestion = {
  type: "question";
  id: string;
  kind: QKind;
  points: number;
  tags: string[];
  auto: boolean;
  body: PublicBlock[];
  choices?: PublicChoice[];
  scoring?: "all" | "partial";
  hint?: PublicBlock[];
};

export type PublicBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; c: PublicInline[] }
  | { type: "code"; lang?: string; v: string }
  | { type: "list"; ordered: boolean; items: PublicBlock[][] }
  | { type: "math"; v: string }
  | {
      type: "image";
      assetId?: string;
      src?: string;
      alt: string;
      caption?: string;
      width?: number;
    }
  | { type: "table"; header: PublicInline[][]; rows: PublicInline[][][] }
  | PublicQuestion;

export type PublicBook = {
  astVersion: number;
  meta: Meta;
  assets: Asset[];
  blocks: PublicBlock[];
};

/** 受験者へ配信してよいデータだけを組み立てる(§5.3) */
export function toPublic(ast: BookAst): PublicBook {
  return {
    astVersion: ast.astVersion ?? AST_VERSION,
    meta: toPublicMeta(ast.meta),
    assets: ast.assets.map(toPublicAsset),
    blocks: ast.blocks.map(toPublicBlock),
  };
}

function toPublicMeta(meta: Meta): Meta {
  return {
    title: meta.title,
    ...(meta.description !== undefined ? { description: meta.description } : {}),
    tags: [...meta.tags],
    lang: meta.lang,
    ...(meta.timeLimit !== undefined ? { timeLimit: meta.timeLimit } : {}),
    shuffle: { questions: meta.shuffle.questions, choices: meta.shuffle.choices },
    normalize: { kana: meta.normalize.kana },
    practiceFeedback: meta.practiceFeedback,
  };
}

function toPublicAsset(asset: Asset): Asset {
  return {
    id: asset.id,
    name: asset.name,
    mime: asset.mime,
    ...(asset.width !== undefined ? { width: asset.width } : {}),
    ...(asset.height !== undefined ? { height: asset.height } : {}),
  };
}

export function toPublicBlock(block: PublicBlockSource): PublicBlock {
  switch (block.type) {
    case "heading":
      return { type: "heading", level: block.level, text: block.text, id: block.id };
    case "paragraph":
      return { type: "paragraph", c: block.c.map(toPublicInline) };
    case "code":
      return { type: "code", ...(block.lang ? { lang: block.lang } : {}), v: block.v };
    case "list":
      return {
        type: "list",
        ordered: block.ordered,
        items: block.items.map((item) => item.map(toPublicBlock)),
      };
    case "math":
      return { type: "math", v: block.v };
    case "image":
      return {
        type: "image",
        ...(block.assetId ? { assetId: block.assetId } : {}),
        ...(block.src ? { src: block.src } : {}),
        alt: block.alt,
        ...(block.caption ? { caption: block.caption } : {}),
        ...(block.width ? { width: block.width } : {}),
      };
    case "table":
      return toPublicTable(block);
    case "question":
      return toPublicQuestion(block);
    default: {
      const never: never = block;
      return never;
    }
  }
}

function toPublicTable(table: TableBlock): PublicBlock {
  return {
    type: "table",
    header: table.header.map((cell) => cell.map(toPublicInline)),
    rows: table.rows.map((row) => row.map((cell) => cell.map(toPublicInline))),
  };
}

function toPublicQuestion(q: QuestionBlock): PublicQuestion {
  // 許可リスト方式: 明示的に許可したフィールドだけを返す
  return {
    type: "question",
    id: q.id,
    kind: q.kind,
    points: q.points,
    tags: [...q.tags],
    auto: q.auto,
    body: q.body.map(toPublicBlock),
    ...(q.choices
      ? { choices: q.choices.map((c) => ({ id: c.id, label: c.label.map(toPublicInline) })) }
      : {}),
    ...(q.scoring ? { scoring: q.scoring } : {}),
    ...(q.hint ? { hint: q.hint.map(toPublicBlock) } : {}),
  };
}

export function toPublicInline(inline: Inline): PublicInline {
  switch (inline.t) {
    case "text":
      return { t: "text", v: inline.v };
    case "strong":
      return { t: "strong", c: inline.c.map(toPublicInline) };
    case "em":
      return { t: "em", c: inline.c.map(toPublicInline) };
    case "code":
      return { t: "code", v: inline.v };
    case "math":
      return { t: "math", v: inline.v };
    case "link":
      return { t: "link", href: inline.href, c: inline.c.map(toPublicInline) };
    case "blank":
      return {
        t: "blank",
        id: inline.id,
        weight: inline.weight,
        input: blankInputType(inline.answers),
      };
    case "choiceBlank":
      return {
        t: "choiceBlank",
        id: inline.id,
        weight: inline.weight,
        options: [...inline.options],
      };
    default: {
      const never: never = inline;
      return never;
    }
  }
}

function blankInputType(matchers: Matcher[]): "text" | "number" {
  return matchers.length > 0 && matchers.every((m) => m.kind === "number") ? "number" : "text";
}

/* ------------------------------------------------------------------ */
/* 結果画面用の正解表示(§7.9)                                          */
/* ------------------------------------------------------------------ */

export type ResultAnswer =
  | { kind: "exact"; blankId: string; display: string[] }
  | { kind: "number"; blankId: string; display: string[] }
  | { kind: "regex"; blankId: string; display: string[] }
  | { kind: "choice"; blankId: string; display: string[] }
  | { kind: "choice"; questionId: string; display: string[] }
  | { kind: "boolean"; display: string[] }
  | { kind: "model"; display: string[] };

export type ResultEntry = {
  questionId: string;
  answers: ResultAnswer[];
};

/**
 * 終端状態の Attempt に限り使用する。Matcher をそのまま返さず表示用に整形する。
 * - exact: 許容解答をすべて
 * - number: `値 ± 許容誤差`
 * - regex: パターン文字列をそのまま
 */
export function toResult(ast: BookAst): ResultEntry[] {
  const out: ResultEntry[] = [];
  const walk = (blocks: BookAst["blocks"]) => {
    for (const block of blocks) {
      if (block.type === "question") {
        out.push({
          questionId: block.id,
          answers: questionResultAnswers(block),
        });
        continue;
      }
      if (block.type === "list") block.items.forEach((item) => walk(item));
      if (block.type === "table") {
        // 表内の空欄は自動設問として切り出されているため、ここでは扱わない
        continue;
      }
    }
  };
  walk(ast.blocks);
  return out;
}

function questionResultAnswers(q: QuestionBlock): ResultAnswer[] {
  const answers: ResultAnswer[] = [];
  const blanks = collectQuestionBlanks(q);

  for (const blank of blanks) {
    if (blank.t === "choiceBlank") {
      answers.push({
        kind: "choice",
        blankId: blank.id,
        display: blank.correct.map((i) => blank.options[i] ?? ""),
      });
      continue;
    }
    const exact = blank.answers.filter((m) => m.kind === "exact").map((m) => (m as { v: string }).v);
    if (exact.length > 0) {
      answers.push({ kind: "exact", blankId: blank.id, display: exact });
    }
    const numbers = blank.answers.filter((m) => m.kind === "number") as Array<{
      v: string;
      tol?: string;
    }>;
    if (numbers.length > 0) {
      answers.push({
        kind: "number",
        blankId: blank.id,
        display: numbers.map((m) => `${plainDecimal(m.v)} ± ${plainDecimal(m.tol ?? "0")}`),
      });
    }
    const regexes = blank.answers.filter((m) => m.kind === "regex") as Array<{
      pattern: string;
      flags?: string;
    }>;
    if (regexes.length > 0) {
      answers.push({
        kind: "regex",
        blankId: blank.id,
        display: regexes.map((m) => `/${m.pattern}/${m.flags ?? ""}`),
      });
    }
  }

  if (q.kind === "single" || q.kind === "multi") {
    answers.push({
      kind: "choice",
      questionId: q.id,
      display: (q.choices ?? []).filter((c) => c.correct).map((c) => c.id),
    });
  }
  if (q.kind === "truefalse") {
    answers.push({ kind: "boolean", display: [q.answer ? "true" : "false"] });
  }
  if (q.kind === "essay") {
    answers.push({ kind: "model", display: ["__model__"] });
  }
  return answers;
}

function collectQuestionBlanks(q: QuestionBlock) {
  const out: Array<
    | { t: "blank"; id: string; answers: Matcher[] }
    | { t: "choiceBlank"; id: string; correct: number[]; options: string[] }
  > = [];
  const walkInlines = (inlines: Inline[]) => {
    for (const i of inlines) {
      if (i.t === "blank") out.push({ t: "blank", id: i.id, answers: i.answers });
      else if (i.t === "choiceBlank")
        out.push({ t: "choiceBlank", id: i.id, correct: i.correct, options: i.options });
      else if (i.t === "strong" || i.t === "em" || i.t === "link") walkInlines(i.c);
    }
  };
  const walkBlocks = (blocks: BookAst["blocks"]) => {
    for (const b of blocks) {
      if (b.type === "paragraph") walkInlines(b.c);
      else if (b.type === "list") b.items.forEach(walkBlocks);
      else if (b.type === "table") {
        b.header.forEach(walkInlines);
        b.rows.forEach((row) => row.forEach(walkInlines));
      }
    }
  };
  walkBlocks(q.body);
  return out;
}

function plainDecimal(literal: string): string {
  const d = parseDecimal(literal);
  return d ? decimalToPlainString(d) : literal;
}

/** 内部型を使わない呼び出し側向けのエイリアス */
type PublicBlockSource = BookAst["blocks"][number];

/**
 * QB Markup 内部 AST (SPEC_v4.md §5.1)
 *
 * このファイルは型のみを定義する。実行時検証は validate.ts / 各パーサで行う。
 * HTML は一切通さない(§5.1 末尾)。
 */

/** AST 構造のバージョン。構造を変えたときだけ上げる(§5.4) */
export const AST_VERSION = 1;

/** パーサ実装のバージョン。astVersion と混同しない(§5.4) */
export const PARSER_VERSION = "0.1.0";

export type Lang = "ja" | "en";

export type Meta = {
  title: string;
  description?: string;
  tags: string[];
  lang: Lang;
  /** 秒 */
  timeLimit?: number;
  shuffle: { questions: boolean; choices: boolean };
  normalize: { kana: boolean };
  practiceFeedback: boolean;
};

export type Asset = {
  id: string;
  name: string;
  mime: string;
  width?: number;
  height?: number;
};

/**
 * 空欄の判定器。
 * number の v / tol は 10 進文字列で保持する(§5.1)
 */
export type Matcher =
  | { kind: "exact"; v: string }
  | { kind: "regex"; pattern: string; flags?: "i" }
  | { kind: "number"; v: string; tol?: string };

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "blank"; id: string; weight: number; answers: Matcher[] }
  | {
      t: "choiceBlank";
      id: string;
      weight: number;
      options: string[];
      /** `?` を付けた選択肢のインデックス(1 つ以上) */
      correct: number[];
    };

/** 内部専用: ブロック末尾の属性トークン。最終 AST には残さない(§4.6) */
export type AttrToken = {
  t: "attr";
  key: string;
  value: string;
  /** ソース上の絶対オフセット */
  offset: number;
};

export type InlineToken = Inline | AttrToken;

export type QKind = "blank" | "single" | "multi" | "essay" | "truefalse";

export type HeadingBlock = { type: "heading"; level: 1 | 2 | 3; text: string; id: string };
export type ParagraphBlock = { type: "paragraph"; c: Inline[] };
export type CodeBlock = { type: "code"; lang?: string; v: string };
export type ListBlock = { type: "list"; ordered: boolean; items: Block[][] };
export type MathBlock = { type: "math"; v: string };
export type ImageBlock = {
  type: "image";
  assetId?: string;
  src?: string;
  alt: string;
  caption?: string;
  width?: number;
};
export type TableBlock = { type: "table"; header: Inline[][]; rows: Inline[][][] };

export type Choice = {
  id: string;
  label: Inline[];
  correct: boolean;
};

export type QuestionBlock = {
  type: "question";
  id: string;
  kind: QKind;
  points: number;
  tags: string[];
  /** @q なしで自動生成された設問(§4.3) */
  auto: boolean;
  body: Block[];
  /** single / multi */
  choices?: Choice[];
  /** truefalse */
  answer?: boolean;
  /** multi */
  scoring?: "all" | "partial";
  /** essay の模範解答 */
  model?: Block[];
  explain?: Block[];
  hint?: Block[];
};

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | MathBlock
  | ImageBlock
  | TableBlock
  | QuestionBlock;

export type BookAst = {
  astVersion: number;
  meta: Meta;
  assets: Asset[];
  blocks: Block[];
};

/**
 * 設問の採点定義(§4.6 のリビジョン対象)。
 * これが変わると QuestionRevision が増える。
 */
export type GradingSnapshot = {
  kind: QKind;
  points: number;
  scoring?: "all" | "partial";
  answer?: boolean;
  normalizeKana: boolean;
  blanks: Array<{
    id: string;
    weight: number;
    matchers: Matcher[];
    choiceCorrect?: number[];
  }>;
  choices?: Array<{ id: string; correct: boolean }>;
};

export const isQuestion = (b: Block): b is QuestionBlock =>
  (b as { type?: string }).type === "question";

export type BlankInline =
  | Extract<Inline, { t: "blank" }>
  | Extract<Inline, { t: "choiceBlank" }>;

/** ブロック内の設問を順に集める(再帰) */
export function collectQuestions(blocks: Block[]): QuestionBlock[] {
  const out: QuestionBlock[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (isQuestion(b)) {
        out.push(b);
        walk(b.body);
        if (b.model) walk(b.model);
        if (b.explain) walk(b.explain);
        if (b.hint) walk(b.hint);
      } else if (b.type === "list") b.items.forEach(walk);
    }
  };
  walk(blocks);
  return out;
}

/** ブロックが保持する空欄(再帰) */
export function collectBlanks(blocks: Block[]): BlankInline[] {
  const out: BlankInline[] = [];
  const fromInlines = (inlines: Inline[]) => {
    for (const i of inlines) collect(i);
    function collect(i: Inline) {
      if (i.t === "blank" || i.t === "choiceBlank") out.push(i);
      else if (i.t === "strong" || i.t === "em" || i.t === "link") i.c.forEach(collect);
    }
  };
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.type) {
        case "paragraph":
          fromInlines(b.c);
          break;
        case "heading":
          break;
        case "list":
          b.items.forEach(walk);
          break;
        case "table":
          b.header.forEach(fromInlines);
          for (const row of b.rows) for (const cell of row) fromInlines(cell);
          break;
        case "question":
          walk(b.body);
          if (b.model) walk(b.model);
          if (b.explain) walk(b.explain);
          if (b.hint) walk(b.hint);
          break;
        default:
          break;
      }
    }
  };
  walk(blocks);
  return out;
}

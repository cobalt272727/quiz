import type { Block, BookAst, QuestionBlock } from "../src/types.ts";
import { isQuestion } from "../src/types.ts";
import { parse, type ParseOptions, type ParseResult } from "../src/parse.ts";
import type { IdKind } from "../src/ids.ts";

/** テスト用の決定的 ID 生成器(q_000001, b_000001, ...) */
export function makeIdGen(): (kind: IdKind, isTaken: (id: string) => boolean) => string {
  let q = 0;
  let b = 0;
  return (kind, isTaken) => {
    for (;;) {
      const n = kind === "question" ? ++q : ++b;
      const id = `${kind === "question" ? "q" : "b"}_${String(n).padStart(6, "0")}`;
      if (!isTaken(id)) return id;
    }
  };
}

export function parseT(src: string, opts: ParseOptions = {}): ParseResult {
  return parse(src, { idGen: makeIdGen(), ...opts });
}

export const codes = (r: ParseResult): string[] => r.diagnostics.map((d) => d.code);

export const hasCode = (r: ParseResult, code: string): boolean => codes(r).includes(code);

export function questions(ast: BookAst): QuestionBlock[] {
  const out: QuestionBlock[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (isQuestion(b)) {
        out.push(b);
        walk(b.body);
      } else if (b.type === "list") b.items.forEach(walk);
    }
  };
  walk(ast.blocks);
  return out;
}

export const fm = (body: string, meta = "title: テスト"): string => `---\n${meta}\n---\n\n${body}`;

export function onlyQuestion(r: ParseResult): QuestionBlock {
  const q = questions(r.ast);
  if (q.length !== 1) throw new Error(`expected 1 question, got ${q.length}: ${JSON.stringify(q)}`);
  return q[0];
}

export function firstBlank(ast: BookAst) {
  for (const b of ast.blocks) {
    if (b.type !== "question") continue;
    const q = b;
    const found = search(q.body);
    if (found) return found;
  }
  return null;

  function search(blocks: Block[]): null | { id: string; weight: number; kind: string; value: unknown } {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        const f = searchInlines(block.c);
        if (f) return f;
      } else if (block.type === "list") {
        for (const item of block.items) {
          const f = search(item);
          if (f) return f;
        }
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row) {
            const f = searchInlines(cell);
            if (f) return f;
          }
        }
      }
    }
    return null;
  }

  function searchInlines(inlines: unknown[]): null | { id: string; weight: number; kind: string; value: unknown } {
    for (const i of inlines as Array<Record<string, unknown>>) {
      if (i.t === "blank") return { id: i.id as string, weight: i.weight as number, kind: "blank", value: i.answers };
      if (i.t === "choiceBlank") return { id: i.id as string, weight: i.weight as number, kind: "choiceBlank", value: i };
      if (Array.isArray(i.c)) {
        const f = searchInlines(i.c);
        if (f) return f;
      }
    }
    return null;
  }
}

/** ブロックのネストを平坦化してデバッグしやすくする */
export function flatText(ast: BookAst): string {
  return JSON.stringify(ast);
}

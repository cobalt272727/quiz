/**
 * パーサのエントリポイント(§5.2)
 */

import type { BookAst, Block } from "./types.ts";
import { AST_VERSION } from "./types.ts";
import {
  buildLineIndex,
  createDiagnosticSink,
  type Diagnostic,
} from "./diagnostics.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { parseBlocks } from "./blocks.ts";
import {
  defaultIdGenerator,
  type IdGenerator,
  type ParseContext,
} from "./parse-context.ts";
import { applyWriteback, type PendingWrite } from "./ids.ts";

export type ParseOptions = {
  /** ID 生成器(テストで固定したい場合に差し替える) */
  idGen?: IdGenerator;
  /** 退役済み ID(サーバ検証のみ。§4.6) */
  retiredQuestionIds?: Iterable<string>;
  retiredBlankIds?: Iterable<string>;
  /** ブック内アセット名。指定すると画像参照を検証する */
  assetNames?: Iterable<string>;
  /** アセット名 → アセット ID の解決表 */
  assetIds?: Map<string, string>;
  /** 外部画像 URL を許可するか(既定 false。§9) */
  allowExternalImages?: boolean;
};

export type ParseResult = {
  /** 改行を LF に正規化したソース(書き戻しはこの文字列に対して行う) */
  source: string;
  ast: BookAst;
  diagnostics: Diagnostic[];
  /** ID 書き戻しの差分。空なら確定済み */
  writes: PendingWrite[];
  hasErrors: boolean;
  /** 参照されているブック内アセット名(`img:name`) */
  assetRefs: string[];
};

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const normalized = normalizeNewlines(source);
  const index = buildLineIndex(normalized);
  const diags = createDiagnosticSink(index);

  const { meta, bodyOffset } = parseFrontmatter(normalized, diags);

  const ctx: ParseContext = {
    src: normalized,
    diags,
    opts: {
      idGen: options.idGen ?? defaultIdGenerator,
      retiredQuestionIds: new Set(options.retiredQuestionIds ?? []),
      retiredBlankIds: new Set(options.retiredBlankIds ?? []),
      assetNames: options.assetNames ? new Set(options.assetNames) : undefined,
      assetIds: options.assetIds,
      allowExternalImages: options.allowExternalImages ?? false,
      maxQuestions: 2000,
    },
    questionIds: new Set(),
    blankIds: new Set(),
    writes: [],
    assets: [],
    blockEnd: new Map(),
    blockStart: new Map(),
    inlineTokens: new WeakMap(),
    listMeta: new WeakMap(),
    listMetaByBlock: new WeakMap(),
    tableRowTokens: new WeakMap(),
    headingIds: new Map(),
    seq: 0,
  };

  const blocks = parseBlocks(ctx, bodyOffset, normalized.length, { inQuestion: false });
  const assetRefs = collectAssetRefs(blocks);

  const ast: BookAst = {
    astVersion: AST_VERSION,
    meta,
    assets: [],
    blocks,
  };

  const diagnostics = diags.list.slice().sort((a, b) => a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
  return {
    source: normalized,
    ast,
    diagnostics,
    writes: ctx.writes,
    hasErrors: diagnostics.some((d) => d.severity === "error"),
    assetRefs,
  };
}

export type SaveResult = {
  source: string;
  result: ParseResult;
  /** 書き戻しを行ったか */
  wroteBack: boolean;
};

/**
 * 保存時用: ID をソースへ書き戻し、再解析して確定済みの source / AST を返す。
 * 2 回実行しても結果が変わらない(冪等。§4.6)。
 */
export function saveSource(source: string, options: ParseOptions = {}): SaveResult {
  const first = parse(source, options);
  if (first.writes.length === 0) {
    return { source: first.source, result: first, wroteBack: false };
  }
  const written = applyWriteback(first.source, first.writes);
  const second = parse(written, options);
  return { source: written, result: second, wroteBack: true };
}

export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function collectAssetRefs(blocks: Block[]): string[] {
  const out = new Set<string>();
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "image" && b.src?.startsWith("img:")) out.add(b.src.slice(4));
      else if (b.type === "question") {
        walk(b.body);
        if (b.model) walk(b.model);
        if (b.explain) walk(b.explain);
        if (b.hint) walk(b.hint);
      } else if (b.type === "list") b.items.forEach(walk);
    }
  };
  walk(blocks);
  return [...out];
}

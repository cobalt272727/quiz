/**
 * パーサの内部コンテキスト(共有パッケージ内のみ)
 */

import type { Asset, Inline, InlineToken } from "./types.ts";
import type { DiagnosticSink } from "./diagnostics.ts";
import { generateId, type IdKind, type PendingWrite } from "./ids.ts";

export type IdGenerator = (kind: IdKind, isTaken: (id: string) => boolean) => string;

export type ResolvedOptions = {
  idGen: IdGenerator;
  /** 退役済み設問 ID(サーバ検証のみ。§4.6) */
  retiredQuestionIds: Set<string>;
  retiredBlankIds: Set<string>;
  /** ブック内アセット名。指定時のみ画像参照を検証できる */
  assetNames?: Set<string>;
  /** アセット名 → アセット ID の解決表(任意) */
  assetIds?: Map<string, string>;
  allowExternalImages: boolean;
  maxQuestions: number;
};

export type ParseContext = {
  src: string;
  diags: DiagnosticSink;
  opts: ResolvedOptions;
  questionIds: Set<string>;
  blankIds: Set<string>;
  writes: PendingWrite[];
  assets: Asset[];
  /** ブロックの書き戻し位置(段落・リスト項目・表の行) */
  blockEnd: Map<object, number>;
  /** ブロック開始位置(診断の位置決め用) */
  blockStart: Map<object, number>;
  /** 段落の InlineToken(属性トークン `{qid=..}` の検出用) */
  inlineTokens: WeakMap<object, InlineToken[]>;
  /** リスト項目(Block[])ごとのチェックボックス情報 */
  listMeta: WeakMap<object, { cb: (boolean | null)[]; label: Inline[][] }>;
  /** リストブロックごとの項目終端オフセット */
  listMetaByBlock: WeakMap<object, { endOffsets: number[] }>;
  /** 表の行(Inline[][])ごとのセル InlineToken */
  tableRowTokens: WeakMap<object, InlineToken[][]>;
  /** 見出しアンカーの重複回避 */
  headingIds: Map<string, number>;
  seq: number;
};

export function addWrite(ctx: ParseContext, offset: number, text: string): void {
  ctx.writes.push({ offset, text, seq: ctx.seq++ });
}

export function isIdTaken(ctx: ParseContext, kind: IdKind, id: string): boolean {
  if (kind === "question") {
    return (
      ctx.questionIds.has(id) ||
      ctx.opts.retiredQuestionIds.has(id)
    );
  }
  return ctx.blankIds.has(id) || ctx.opts.retiredBlankIds.has(id);
}

export function reserveId(ctx: ParseContext, kind: IdKind, id: string): void {
  if (kind === "question") ctx.questionIds.add(id);
  else ctx.blankIds.add(id);
}

export function newId(ctx: ParseContext, kind: IdKind): string {
  const id = ctx.opts.idGen(kind, (candidate) => isIdTaken(ctx, kind, candidate));
  reserveId(ctx, kind, id);
  return id;
}

export const defaultIdGenerator: IdGenerator = (kind, isTaken) =>
  generateId(kind, isTaken);

/**
 * ブロック解析(§4.3, §4.8)
 *
 * 行指向のブロック走査 + 生ソースに対するインライン解析。
 * Markdown のサブセット(見出し・段落・リスト・表・コード・数式・画像)を
 * 自前で構造化し、HTML は一切生成しない。
 */

import type {
  BlankInline,
  Block,
  Choice,
  ImageBlock,
  Inline,
  InlineToken,
  ListBlock,
  ParagraphBlock,
  QKind,
  QuestionBlock,
  TableBlock,
  TextBlock,
} from "./types.ts";
import type { ParseContext } from "./parse-context.ts";
import { addWrite, newId, reserveId, isIdTaken } from "./parse-context.ts";
import { isWellFormedId } from "./ids.ts";
import { parseInline, takeTrailingAttr, toInline, hasBlank } from "./inline.ts";
import { parseAttributeText, type AttrPair } from "./blank.ts";
import { collectBlanks } from "./types.ts";
import {
  decimalToPlainString,
  formatNumberLiteral,
  parseDecimal,
  type DecimalParts,
} from "./decimal.ts";

const MAX_QUESTION_POINTS = 1000;
const MAX_QUESTIONS = 2000;

type Line = { text: string; start: number };

export type BlockParseOptions = {
  inQuestion: boolean;
  /** 空欄・属性を解析せず文字として扱う(`@text` 用) */
  noQb?: boolean;
  /** `@text` の内側 */
  inText?: boolean;
};

export function splitLines(src: string, start: number, end: number): Line[] {
  const out: Line[] = [];
  let lineStart = start;
  for (let i = start; i <= end; i++) {
    if (i === end || src.charCodeAt(i) === 10) {
      out.push({ text: src.slice(lineStart, i), start: lineStart });
      lineStart = i + 1;
    }
  }
  return out;
}

const lineEnd = (line: Line) => line.start + line.text.length;
const isBlankLine = (text: string) => text.trim() === "";

/* ------------------------------------------------------------------ */
/* 行の分類                                                             */
/* ------------------------------------------------------------------ */

function matchFence(text: string): { fence: string; info: string; indent: number } | null {
  const m = /^([ \t]*)(`{3,}|~{3,})(.*)$/.exec(text);
  if (!m) return null;
  return { indent: m[1].length, fence: m[2], info: m[3].trim() };
}

function matchHeading(text: string): { level: number; text: string } | null {
  const m = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/.exec(text);
  if (!m) return null;
  const body = m[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
  return { level: m[1].length, text: body };
}

function matchDirective(text: string): { name: string; rest: string; restOffset: number } | null {
  const m = /^@(q|text|end|explain|hint|model)(?:[ \t]+(.*?))?[ \t]*$/.exec(text);
  if (!m) return null;
  const restRaw = m[2] ?? "";
  return { name: m[1], rest: restRaw, restOffset: m[0].length - restRaw.length };
}

const DELIM_CELL = ":?-+:?";
const DELIMITER_RE = new RegExp(`^\\|?(\\s*${DELIM_CELL}\\s*\\|)*\\s*${DELIM_CELL}\\s*\\|?$`);

function isDelimiterRow(text: string): boolean {
  const t = text.trim();
  if (!t.includes("-")) return false;
  return DELIMITER_RE.test(t);
}

function isTableStart(lines: Line[], i: number): boolean {
  const cur = lines[i];
  const next = lines[i + 1];
  if (!cur || !next) return false;
  if (!cur.text.includes("|")) return false;
  return isDelimiterRow(next.text);
}

function matchListItem(
  text: string,
): { indent: number; ordered: boolean; content: string; contentOffset: number } | null {
  const m = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(text);
  if (!m) return null;
  return {
    indent: m[1].length,
    ordered: /^\d/.test(m[2]),
    content: m[4],
    contentOffset: m[0].length - m[4].length,
  };
}

/**
 * 画像行 `![alt](src){attrs}` を解析する。
 *
 * `img:` はブック内アセット名をそのまま参照するため、空白や括弧を含む名前
 * (例: `img:logo (2)`)も受け付ける。URL は従来どおり空白を含めない。
 */
function matchImageLine(text: string): { alt: string; src: string; attrs: string | null } | null {
  const m = /^[ \t]*!\[([^\]]*)\]\(\s*((?:img:)?[^()\s]+)\s*\)(\{[^}]*\})?[ \t]*$/.exec(text);
  if (m) return { alt: m[1], src: m[2], attrs: m[3] ?? null };

  // アセット名に空白や括弧を含む場合(名前はアップロード時のファイル名由来)
  const asset = /^[ \t]*!\[([^\]]*)\]\(\s*img:(.+?)\s*\)(\{[^}]*\})?[ \t]*$/.exec(text);
  if (!asset) return null;
  return { alt: asset[1], src: `img:${asset[2]}`, attrs: asset[3] ?? null };
}

const THEMATIC_RE = /^[ \t]{0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;

/** 段落を終わらせる行かどうか */
function startsNewBlock(lines: Line[], i: number): boolean {
  const text = lines[i].text;
  if (isBlankLine(text)) return true;
  if (matchFence(text)) return true;
  if (matchHeading(text)) return true;
  if (matchDirective(text)) return true;
  if (matchListItem(text)) return true;
  if (matchImageLine(text)) return true;
  if (THEMATIC_RE.test(text)) return true;
  if (/^[ \t]*\$\$/.test(text)) return true;
  if (isTableStart(lines, i)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* エントリポイント                                                     */
/* ------------------------------------------------------------------ */

export function parseBlocks(
  ctx: ParseContext,
  start: number,
  end: number,
  opts: BlockParseOptions,
): Block[] {
  const lines = splitLines(ctx.src, start, end);
  const blocks = parseBlocksFromLines(ctx, lines, opts);
  if (opts.inQuestion) return blocks;
  return promoteAutoQuestions(ctx, blocks);
}

function parseBlocksFromLines(
  ctx: ParseContext,
  lines: Line[],
  opts: BlockParseOptions,
): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlankLine(line.text)) {
      i++;
      continue;
    }

    const fence = matchFence(line.text);
    if (fence) {
      const closingRe = new RegExp(`^[ \\t]*${fence.fence[0]}{${fence.fence.length},}[ \\t]*$`);
      let j = i + 1;
      const bodyStart = lineEnd(line) + 1;
      while (j < lines.length && !closingRe.test(lines[j].text)) j++;
      const bodyEnd = j < lines.length ? lines[j].start : Math.min(lineEnd(lines[lines.length - 1]), ctx.src.length);
      const lang = fence.info.split(/\s+/)[0] || undefined;
      blocks.push({ type: "code", ...(lang ? { lang } : {}), v: ctx.src.slice(bodyStart, Math.max(bodyStart, bodyEnd - (bodyEnd > bodyStart && ctx.src[bodyEnd - 1] === "\n" ? 0 : 0))) });
      // 本文はフェンス内の生テキスト(末尾の改行を 1 つ落とす)
      const raw = ctx.src.slice(bodyStart, bodyEnd);
      (blocks[blocks.length - 1] as { v: string }).v = raw.replace(/\n$/, "");
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    const heading = matchHeading(line.text);
    if (heading) {
      const level = Math.min(heading.level, 3) as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        level,
        text: plainText(heading.text),
        id: headingId(ctx, heading.text),
      });
      i++;
      continue;
    }

    const directive = matchDirective(line.text);
    if (directive) {
      if (directive.name === "q") {
        const parsed = parseQuestionBlock(ctx, lines, i, opts);
        if (parsed.block) blocks.push(parsed.block);
        i = parsed.next;
        continue;
      }
      if (directive.name === "text") {
        const parsed = parseTextBlock(ctx, lines, i);
        if (parsed.block) blocks.push(parsed.block);
        i = parsed.next;
        continue;
      }
      ctx.diags.error(
        "QB-E010",
        line.start,
        directive.name === "end"
          ? "対応する `@q` がない `@end` です"
          : `\`@${directive.name}\` は @q ブロック内にのみ書けます`,
      );
      i++;
      continue;
    }

    // 数式ブロック $$...$$
    const mathOpen = /^[ \t]*\$\$(.*)$/.exec(line.text);
    if (mathOpen) {
      const startOffset = line.start + line.text.indexOf("$$") + 2;
      const sameLine = mathOpen[1].indexOf("$$");
      if (sameLine >= 0) {
        blocks.push({ type: "math", v: mathOpen[1].slice(0, sameLine).trim() });
        i++;
        continue;
      }
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j].text.includes("$$")) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        ctx.diags.error("QB-E002", line.start, "`$$` が閉じられていません");
        blocks.push({ type: "math", v: ctx.src.slice(startOffset).trim() });
        i = lines.length;
        continue;
      }
      const endOffset = lines[j].start + lines[j].text.indexOf("$$");
      blocks.push({ type: "math", v: ctx.src.slice(startOffset, endOffset).trim() });
      i = j + 1;
      continue;
    }

    const image = matchImageLine(line.text);
    if (image) {
      const block = buildImage(ctx, image, line.start);
      if (block) blocks.push(block);
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const parsed = parseTable(ctx, lines, i, opts);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    if (matchListItem(line.text)) {
      const parsed = parseList(ctx, lines, i, opts);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    if (THEMATIC_RE.test(line.text)) {
      i++;
      continue;
    }

    // 段落
    let j = i + 1;
    while (j < lines.length && !startsNewBlock(lines, j)) j++;
    const lastLine = lines[j - 1];
    const paraStart = line.start;
    const paraEnd = lastLine.start + lastLine.text.trimEnd().length;
    const raw = ctx.src.slice(paraStart, paraEnd);
    const text = raw
      .split("\n")
      .map((l) => l.replace(/^[ \t]*>[ \t]?/, ""))
      .join("\n");
    const paragraph = makeParagraph(ctx, text, paraStart, opts);
    ctx.blockEnd.set(paragraph, paraEnd);
    ctx.blockStart.set(paragraph, paraStart);
    blocks.push(paragraph);
    i = j;
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* 段落・画像                                                           */
/* ------------------------------------------------------------------ */

function makeParagraph(
  ctx: ParseContext,
  text: string,
  baseOffset: number,
  opts: BlockParseOptions,
): ParagraphBlock {
  const tokens = parseInline(ctx, text, baseOffset, opts.noQb ? { noQb: true } : {});
  const block: ParagraphBlock = { type: "paragraph", c: toInline(tokens) };
  if (opts.inQuestion) {
    reportStrayQid(ctx, tokens);
  } else {
    ctx.inlineTokens.set(block, tokens);
  }
  return block;
}

function reportStrayQid(ctx: ParseContext, tokens: InlineToken[]): void {
  for (const t of tokens) {
    if (t.t === "attr" && t.key === "qid") {
      ctx.diags.error("QB-E010", t.offset, "`{qid=..}` は @q の外の設問にのみ付けられます");
    }
  }
}

function buildImage(
  ctx: ParseContext,
  image: { alt: string; src: string; attrs: string | null },
  offset: number,
): ImageBlock | null {
  let width: number | undefined;
  if (image.attrs) {
    const attrs = parseAttributeText(image.attrs.slice(1, -1), offset + image.src.length);
    for (const pair of attrs.pairs) {
      if (pair.key === "width") {
        const n = Number(pair.value);
        if (!Number.isInteger(n) || n <= 0 || n > 4000) {
          ctx.diags.error("QB-E010", pair.offset, `画像の width \`${pair.value}\` は 1〜4000 の整数です`);
          continue;
        }
        width = n;
      } else {
        ctx.diags.error("QB-E010", pair.offset, `画像に指定できない属性 \`${pair.key}\` です`);
      }
    }
  }

  if (image.src.startsWith("img:")) {
    const name = image.src.slice(4);
    if (ctx.opts.assetNames && !ctx.opts.assetNames.has(name)) {
      ctx.diags.error("QB-E005", offset, `画像 \`${name}\` が見つかりません`);
    }
    const assetId = ctx.opts.assetIds?.get(name);
    return {
      type: "image",
      ...(assetId ? { assetId } : {}),
      ...(assetId ? {} : { src: image.src }),
      alt: image.alt,
      ...(width ? { width } : {}),
    };
  }

  if (/^https?:\/\//i.test(image.src) || /^\/\//.test(image.src)) {
    if (!ctx.opts.allowExternalImages) {
      ctx.diags.error("QB-E005", offset, "外部画像 URL は許可されていません(サイト設定で許可できます)");
    } else {
      ctx.diags.warn("QB-W002", offset, "外部画像を使用しています");
    }
    return { type: "image", src: image.src, alt: image.alt, ...(width ? { width } : {}) };
  }

  ctx.diags.error("QB-E005", offset, `画像 \`${image.src}\` の参照方法が不正です`);
  return { type: "image", src: image.src, alt: image.alt, ...(width ? { width } : {}) };
}

/* ------------------------------------------------------------------ */
/* 表                                                                   */
/* ------------------------------------------------------------------ */

type Cell = { text: string; offset: number };

function splitTableCells(line: Line): Cell[] {
  const text = line.text;
  const cells: Cell[] = [];
  let cur = "";
  let curStart = line.start;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      cur += ch + text[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push({ text: cur, offset: curStart });
      cur = "";
      curStart = line.start + i + 1;
      continue;
    }
    cur += ch;
  }
  cells.push({ text: cur, offset: curStart });

  if (cells.length > 0 && cells[0].text.trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].text.trim() === "") cells.pop();
  return cells;
}

function parseTable(
  ctx: ParseContext,
  lines: Line[],
  i: number,
  opts: BlockParseOptions,
): { block: TableBlock; next: number } {
  const headerLine = lines[i];
  const headerCells = splitTableCells(headerLine);
  const header = headerCells.map((cell) => parseTableCell(ctx, cell, opts));
  const rows: Inline[][][] = [];
  const rowTokens: InlineToken[][][] = [];
  const rowEnds: number[] = [];
  const rowStarts: number[] = [];

  let j = i + 2;
  while (j < lines.length) {
    const line = lines[j];
    if (isBlankLine(line.text)) break;
    if (!line.text.includes("|")) break;
    if (matchDirective(line.text)) break;
    const cells = splitTableCells(line);
    if (cells.length !== headerCells.length) {
      ctx.diags.error(
        "QB-E003",
        line.start,
        `表のセル数が一致しません(ヘッダー ${headerCells.length} 列 / この行 ${cells.length} 列)。表内の [[ ]] では区切りの | を \\| と書いてください`,
      );
    }
    const parsedCells: Inline[][] = [];
    const cellTokens: InlineToken[][] = [];
    for (const cell of cells) {
      const tokens = parseInline(ctx, cell.text.trim(), cell.offset + leadingSpace(cell.text), {
        table: true,
        ...(opts.noQb ? { noQb: true } : {}),
      });
      parsedCells.push(toInline(tokens));
      cellTokens.push(tokens);
    }
    while (parsedCells.length < headerCells.length) {
      parsedCells.push([]);
      cellTokens.push([]);
    }
    rows.push(parsedCells.slice(0, headerCells.length));
    rowTokens.push(cellTokens.slice(0, headerCells.length));
    const last = cells[cells.length - 1] ?? cells[0];
    rowEnds.push(last ? last.offset + last.text.trimEnd().length : line.start + line.text.trimEnd().length);
    rowStarts.push(line.start);
    j++;
  }

  const block: TableBlock = { type: "table", header, rows };
  for (let r = 0; r < rows.length; r++) {
    ctx.tableRowTokens.set(rows[r], rowTokens[r]);
    ctx.blockEnd.set(rows[r], rowEnds[r]);
    ctx.blockStart.set(rows[r], rowStarts[r]);
  }
  return { block, next: j };
}

function leadingSpace(s: string): number {
  return s.length - s.trimStart().length;
}

function parseTableCell(ctx: ParseContext, cell: Cell, opts: BlockParseOptions): Inline[] {
  const tokens = parseInline(ctx, cell.text.trim(), cell.offset + leadingSpace(cell.text), {
    table: true,
    ...(opts.noQb ? { noQb: true } : {}),
  });
  return toInline(tokens);
}

/* ------------------------------------------------------------------ */
/* リスト                                                               */
/* ------------------------------------------------------------------ */

function parseList(
  ctx: ParseContext,
  lines: Line[],
  i: number,
  opts: BlockParseOptions,
): { block: ListBlock; next: number } {
  const first = matchListItem(lines[i].text)!;
  const ordered = first.ordered;
  const items: Block[][] = [];
  const endOffsets: number[] = [];
  let j = i;

  while (j < lines.length) {
    const line = lines[j];
    const item = matchListItem(line.text);
    if (!item) break;
    // 別の種類のリストは新しいリストとして扱う
    if (item.ordered !== ordered) break;

    const itemBlocks: Block[] = [];
    let content = item.content;
    let checkbox: boolean | null = null;
    const cb = /^\[([ xX])\][ \t]+/.exec(content);
    if (cb) {
      checkbox = cb[1].toLowerCase() === "x";
      content = content.slice(cb[0].length);
    }
    const contentOffset = line.start + item.contentOffset + (item.content.length - content.length);
    const tokens = parseInline(ctx, content, contentOffset, opts.noQb ? { noQb: true } : {});
    const paragraph: ParagraphBlock = { type: "paragraph", c: toInline(tokens) };
    ctx.blockEnd.set(paragraph, line.start + line.text.trimEnd().length);
    ctx.blockStart.set(paragraph, line.start + item.contentOffset);
    if (opts.inQuestion) reportStrayQid(ctx, tokens);
    else ctx.inlineTokens.set(paragraph, tokens);
    itemBlocks.push(paragraph);
    items.push(itemBlocks);
    endOffsets.push(line.start + line.text.trimEnd().length);

    // 継続行(次のリスト項目・空行・新ブロックまで)は同じ項目の段落にする
    let k = j + 1;
    while (k < lines.length && !isBlankLine(lines[k].text) && !matchListItem(lines[k].text) && !startsNewBlock(lines, k)) {
      const cont = lines[k];
      const text = cont.text.replace(/^[ \t]*>[ \t]?/, "");
      const contTokens = parseInline(ctx, text, cont.start, opts.noQb ? { noQb: true } : {});
      const contBlock: ParagraphBlock = { type: "paragraph", c: toInline(contTokens) };
      ctx.blockEnd.set(contBlock, cont.start + cont.text.trimEnd().length);
      ctx.blockStart.set(contBlock, cont.start);
      if (opts.inQuestion) reportStrayQid(ctx, contTokens);
      else ctx.inlineTokens.set(contBlock, contTokens);
      itemBlocks.push(contBlock);
      endOffsets[endOffsets.length - 1] = cont.start + cont.text.trimEnd().length;
      k++;
    }

    if (checkbox !== null) {
      ctx.listMeta.set(items[items.length - 1] as unknown as object, {
        cb: [checkbox],
        label: [paragraph.c],
      });
    }
    j = k;
  }

  const block: ListBlock = { type: "list", ordered, items };
  ctx.listMetaByBlock.set(block, { endOffsets });
  return { block, next: j };
}

/* ------------------------------------------------------------------ */
/* @q 設問ブロック                                                       */
/* ------------------------------------------------------------------ */

const Q_KEYS = new Set(["id", "type", "points", "tags", "scoring", "answer"]);

/** 空欄の重みを 10 進で厳密に合計する(0.1 + 0.2 の浮動小数点誤差を避ける) */
function totalBlankWeight(blanks: BlankInline[]): number {
  if (blanks.length === 0) return 0;
  const parts: DecimalParts[] = [];
  for (const blank of blanks) {
    const parsed = parseDecimal(formatNumberLiteral(blank.weight));
    if (parsed) parts.push(parsed);
  }
  if (parts.length === 0) return 0;
  const minExp = Math.min(...parts.map((p) => p.exp));
  let total = 0n;
  for (const part of parts) {
    const v = BigInt(part.digits) * 10n ** BigInt(part.exp - minExp);
    total += part.sign < 0 ? -v : v;
  }
  const sign: 1 | -1 = total < 0n ? -1 : 1;
  const digits = (total < 0n ? -total : total).toString();
  return Number(decimalToPlainString({ sign, digits, exp: minExp }));
}

function parseQuestionBlock(
  ctx: ParseContext,
  lines: Line[],
  i: number,
  opts: BlockParseOptions,
): { block: QuestionBlock | null; next: number } {
  const header = lines[i];
  const directive = matchDirective(header.text)!;

  if (opts.inText) {
    ctx.diags.error("QB-E010", header.start, "`@text` の中に `@q` は書けません");
  } else if (opts.inQuestion) {
    ctx.diags.error("QB-E010", header.start, "`@q` を入れ子にすることはできません");
  }

  const attrs = parseAttributeText(directive.rest, header.start + 2 + directive.restOffset);
  const attrMap = new Map<string, AttrPair>();
  for (const pair of attrs.pairs) {
    if (!Q_KEYS.has(pair.key)) {
      ctx.diags.error("QB-E010", pair.offset, `@q に指定できない属性 \`${pair.key}\` です`);
      continue;
    }
    if (attrMap.has(pair.key)) {
      ctx.diags.error("QB-E010", pair.offset, `属性 \`${pair.key}\` が重複しています`);
      continue;
    }
    attrMap.set(pair.key, pair);
  }

  // セクション境界を探す
  type Section = { kind: "body" | "explain" | "hint" | "model"; from: number; to: number };
  const sections: Section[] = [{ kind: "body", from: i + 1, to: lines.length }];
  let depth = 0;
  let endLine = -1;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  for (let j = i + 1; j < lines.length; j++) {
    const text = lines[j].text;
    const fence = matchFence(text);
    if (inFence) {
      if (fence && fence.fence[0] === fenceChar && fence.fence.length >= fenceLen) inFence = false;
      continue;
    }
    if (fence) {
      inFence = true;
      fenceChar = fence.fence[0];
      fenceLen = fence.fence.length;
      continue;
    }
    const d = matchDirective(text);
    if (!d) continue;
    // 入れ子の @text は @end を消費するので、対応する @end を数える
    if (d.name === "q" || d.name === "text") {
      depth++;
      continue;
    }
    if (d.name === "end") {
      if (depth > 0) {
        depth--;
        continue;
      }
      endLine = j;
      break;
    }
    if (depth > 0) continue;
    sections[sections.length - 1].to = j;
    sections.push({ kind: d.name as "explain" | "hint" | "model", from: j + 1, to: lines.length });
  }

  if (endLine < 0) {
    ctx.diags.error("QB-E002", header.start, "`@q` が `@end` で閉じられていません");
    endLine = lines.length;
  } else {
    sections[sections.length - 1].to = endLine;
  }

  const bodyStart = sections[0].to > i ? lineOffsetAt(lines, i + 1) : lineEnd(header) + 1;
  const bodyEnd = sections[0].to < lines.length ? lines[sections[0].to].start : ctx.src.length;
  const body = parseBlocks(ctx, bodyStart, bodyEnd, {
    inQuestion: true,
    ...(opts.noQb ? { noQb: true } : {}),
    ...(opts.inText ? { inText: true } : {}),
  });

  const sectionBlocks = new Map<string, Block[]>();
  for (const s of sections.slice(1)) {
    const from = lineOffsetAt(lines, s.from);
    const to = s.to < lines.length ? lines[s.to].start : ctx.src.length;
    sectionBlocks.set(
      s.kind,
      parseBlocks(ctx, from, to, {
        inQuestion: true,
        ...(opts.noQb ? { noQb: true } : {}),
        ...(opts.inText ? { inText: true } : {}),
      }),
    );
  }

  const kindAttr = attrMap.get("type");
  const kindText = kindAttr?.value ?? "blank";
  const kind: QKind = (["blank", "single", "multi", "essay", "truefalse"] as const).includes(
    kindText as QKind,
  )
    ? (kindText as QKind)
    : "blank";
  if (kindAttr && kind !== kindText) {
    ctx.diags.error("QB-E010", kindAttr.offset, `設問タイプ \`${kindText}\` は不明です`);
  }

  const tags = (attrMap.get("tags")?.value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");

  let scoring: "all" | "partial" | undefined;
  const scoringAttr = attrMap.get("scoring");
  if (scoringAttr) {
    if (scoringAttr.value === "all" || scoringAttr.value === "partial") scoring = scoringAttr.value;
    else ctx.diags.error("QB-E010", scoringAttr.offset, "`scoring` は all / partial のいずれかです");
    if (kind !== "multi") {
      ctx.diags.error("QB-E010", scoringAttr.offset, "`scoring` は type=multi でのみ指定できます");
    }
  }

  let answer: boolean | undefined;
  const answerAttr = attrMap.get("answer");
  if (kind === "truefalse") {
    if (!answerAttr) {
      ctx.diags.error("QB-E008", header.start, "`type=truefalse` には `answer=true|false` が必要です");
    } else if (answerAttr.value === "true" || answerAttr.value === "false") {
      answer = answerAttr.value === "true";
    } else {
      ctx.diags.error("QB-E010", answerAttr.offset, "`answer` は true / false のいずれかです");
    }
  } else if (answerAttr) {
    ctx.diags.error("QB-E010", answerAttr.offset, "`answer` は type=truefalse でのみ指定できます");
  }

  let choices: Choice[] | undefined;
  let questionBody = body;
  if (kind === "single" || kind === "multi") {
    const extracted = extractChoices(ctx, body);
    questionBody = extracted.body;
    choices = extracted.choices ?? undefined;
    if (!choices) {
      ctx.diags.error("QB-E008", header.start, "`type=single|multi` には `- [x]` 形式の選択肢リストが必要です");
    } else {
      const correctCount = choices.filter((c) => c.correct).length;
      if (kind === "single" && correctCount !== 1) {
        ctx.diags.error("QB-E008", header.start, `type=single の正解は 1 つです(現在 ${correctCount})`);
      }
      if (kind === "multi" && correctCount === 0) {
        ctx.diags.error("QB-E008", header.start, "type=multi の正解が 0 です");
      }
    }
  }

  if (kind === "blank") {
    if (collectBlanks(questionBody).length === 0) {
      ctx.diags.error("QB-E008", header.start, "空欄が 1 つもない空欄設問です");
    }
  }

  // points 未指定(`points=-1` も同じ)は、設問内の空欄の重み合計を配点にする。
  // 空欄を持たない設問(選択・真偽・記述)は従来どおり 1 点。
  let points: number;
  const pointsAttr = attrMap.get("points");
  const pointsValue = pointsAttr ? Number(pointsAttr.value) : -1;
  if (!pointsAttr || pointsValue === -1) {
    const weightSum = kind === "blank" ? totalBlankWeight(collectBlanks(questionBody)) : 0;
    if (weightSum > MAX_QUESTION_POINTS) {
      ctx.diags.error(
        "QB-E007",
        pointsAttr?.offset ?? header.start,
        `空欄の重みの合計(${weightSum})が上限(${MAX_QUESTION_POINTS})を超えています`,
      );
      points = MAX_QUESTION_POINTS;
    } else {
      points = weightSum > 0 ? weightSum : 1;
    }
  } else if (!Number.isFinite(pointsValue) || pointsValue <= 0 || pointsValue > MAX_QUESTION_POINTS) {
    ctx.diags.error("QB-E007", pointsAttr.offset, `points \`${pointsAttr.value}\` は 0 より大きく 1000 以下です`);
    points = 1;
  } else {
    points = pointsValue;
  }

  const idAttr = attrMap.get("id");
  let id: string;
  if (idAttr) {
    if (!isWellFormedId("question", idAttr.value)) {
      ctx.diags.error("QB-E010", idAttr.offset, `設問 ID \`${idAttr.value}\` の形式が不正です`);
      id = idAttr.value;
    } else if (ctx.questionIds.has(idAttr.value)) {
      ctx.diags.error("QB-E001", idAttr.offset, `設問 ID \`${idAttr.value}\` が重複しています`);
      id = idAttr.value;
    } else if (ctx.opts.retiredQuestionIds.has(idAttr.value)) {
      ctx.diags.error("QB-E011", idAttr.offset, `退役済みの設問 ID \`${idAttr.value}\` です`);
      id = idAttr.value;
    } else {
      id = idAttr.value;
      ctx.questionIds.add(id);
    }
  } else {
    id = newId(ctx, "question");
    ctx.diags.warn("QB-W001", header.start, "設問 ID を保存時に付与します");
    addWrite(ctx, header.start + 2, ` id=${id}`);
  }

  const block: QuestionBlock = {
    type: "question",
    id,
    kind,
    points,
    tags,
    auto: false,
    body: questionBody,
    ...(choices ? { choices } : {}),
    ...(answer !== undefined ? { answer } : {}),
    ...(scoring ? { scoring } : {}),
    ...(sectionBlocks.has("model") ? { model: sectionBlocks.get("model")! } : {}),
    ...(sectionBlocks.has("explain") ? { explain: sectionBlocks.get("explain")! } : {}),
    ...(sectionBlocks.has("hint") ? { hint: sectionBlocks.get("hint")! } : {}),
  };

  if (kind === "essay" && !block.model) {
    // 模範解答がなくても自己採点は可能(表示されないだけ)
  }

  if (ctx.questionIds.size > MAX_QUESTIONS) {
    ctx.diags.error("QB-E010", header.start, `設問数が上限(${MAX_QUESTIONS})を超えています`);
  }

  return { block, next: endLine + 1 };
}

/* ------------------------------------------------------------------ */
/* @text 表示専用ブロック                                                */
/* ------------------------------------------------------------------ */

/**
 * `@text ... @end` を解析する(表示専用)。
 *
 * 中の Markdown 記法は解釈するが、`[[...]]`・`{id=...}` は文字として扱い、
 * 空欄・設問を生成しない。受験画面にもそのまま表示される。
 */
function parseTextBlock(
  ctx: ParseContext,
  lines: Line[],
  i: number,
): { block: TextBlock | null; next: number } {
  const header = lines[i];
  const directive = matchDirective(header.text)!;
  if (directive.rest.trim() !== "") {
    ctx.diags.error("QB-E010", header.start, "`@text` に属性は指定できません");
  }

  let depth = 0;
  let endLine = -1;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  for (let j = i + 1; j < lines.length; j++) {
    const text = lines[j].text;
    const fence = matchFence(text);
    if (inFence) {
      if (fence && fence.fence[0] === fenceChar && fence.fence.length >= fenceLen) inFence = false;
      continue;
    }
    if (fence) {
      inFence = true;
      fenceChar = fence.fence[0];
      fenceLen = fence.fence.length;
      continue;
    }
    const d = matchDirective(text);
    if (!d) continue;
    // 入れ子の @q / @text の @end を外側の終端と取り違えない
    if (d.name === "q" || d.name === "text") {
      depth++;
      continue;
    }
    if (d.name === "end") {
      if (depth > 0) {
        depth--;
        continue;
      }
      endLine = j;
      break;
    }
  }

  if (endLine < 0) {
    ctx.diags.error("QB-E002", header.start, "`@text` が `@end` で閉じられていません");
    endLine = lines.length;
  }

  const bodyStart = lineOffsetAt(lines, i + 1);
  const bodyEnd = endLine < lines.length ? lines[endLine].start : ctx.src.length;
  const body = parseBlocks(ctx, bodyStart, bodyEnd, {
    inQuestion: true,
    inText: true,
    noQb: true,
  });

  return { block: { type: "text", body }, next: endLine + 1 };
}

function lineOffsetAt(lines: Line[], index: number): number {
  if (index >= lines.length) return lines.length > 0 ? lineEnd(lines[lines.length - 1]) + 1 : 0;
  return lines[index].start;
}

function extractChoices(
  ctx: ParseContext,
  body: Block[],
): { body: Block[]; choices: Choice[] | null } {
  const remaining = [...body];
  for (let idx = 0; idx < remaining.length; idx++) {
    const b = remaining[idx];
    if (b.type !== "list") continue;
    const entries = b.items.map((item) => ctx.listMeta.get(item as unknown as object));
    if (entries.some((e) => !e)) continue;
    const choiceItems = entries as Array<{ cb: (boolean | null)[]; label: Inline[][] }>;
    const choices: Choice[] = choiceItems.map((entry, n) => ({
      id: `c${n + 1}`,
      label: entry.label[0] ?? [],
      correct: entry.cb[0] === true,
    }));
    remaining.splice(idx, 1);
    return { body: remaining, choices };
  }
  return { body: remaining, choices: null };
}

/* ------------------------------------------------------------------ */
/* 自動設問の生成(§4.3)                                                */
/* ------------------------------------------------------------------ */

function promoteAutoQuestions(ctx: ParseContext, blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const tokens = ctx.inlineTokens.get(block);
      if (tokens && hasBlank(block.c)) {
        out.push(
          buildAutoQuestion(ctx, tokens, [block], ctx.blockEnd.get(block) ?? 0, ctx.blockStart.get(block) ?? 0),
        );
      } else {
        reportUnusedQid(ctx, tokens);
        out.push(block);
      }
      continue;
    }

    if (block.type === "list") {
      const anyQuestion = block.items.some((item) => collectBlanks(item).length > 0);
      if (!anyQuestion) {
        for (const item of block.items) reportUnusedQid(ctx, lastTokens(ctx, item));
        out.push(block);
        continue;
      }
      const meta = ctx.listMetaByBlock.get(block);
      block.items.forEach((item, idx) => {
        const hasQuestion = collectBlanks(item).length > 0;
        if (!hasQuestion) {
          reportUnusedQid(ctx, lastTokens(ctx, item));
          out.push({ type: "list", ordered: block.ordered, items: [item] });
          return;
        }
        const tokens = lastTokens(ctx, item);
        const end = meta?.endOffsets[idx] ?? 0;
        out.push(
          buildAutoQuestion(ctx, tokens, [{ type: "list", ordered: block.ordered, items: [item] }], end, 0),
        );
      });
      continue;
    }

    if (block.type === "table") {
      const hasRowQuestion = block.rows.some((row) => collectBlanks([{ type: "table", header: [], rows: [row] }]).length > 0);
      if (!hasRowQuestion) {
        out.push(block);
        continue;
      }
      for (const row of block.rows) {
        const rowHasBlank = collectBlanks([{ type: "table", header: [], rows: [row] }]).length > 0;
        if (!rowHasBlank) {
          reportUnusedQid(ctx, (ctx.tableRowTokens.get(row) ?? []).flat());
          out.push({ type: "table", header: block.header, rows: [row] });
          continue;
        }
        const cellTokens = ctx.tableRowTokens.get(row) ?? [];
        const tokens = cellTokens.flat();
        out.push(
          buildAutoQuestion(
            ctx,
            tokens,
            [{ type: "table", header: block.header, rows: [row] }],
            ctx.blockEnd.get(row) ?? 0,
            ctx.blockStart.get(row) ?? 0,
          ),
        );
      }
      continue;
    }

    out.push(block);
  }
  return out;
}

function lastTokens(ctx: ParseContext, blocks: Block[]): InlineToken[] | null {
  let found: InlineToken[] | null = null;
  for (const b of blocks) {
    if (b.type === "paragraph") {
      const t = ctx.inlineTokens.get(b);
      if (t) found = t;
    }
  }
  return found;
}

function reportUnusedQid(ctx: ParseContext, tokens: InlineToken[] | null | undefined): void {
  if (!tokens) return;
  for (const t of tokens) {
    if (t.t === "attr" && t.key === "qid") {
      ctx.diags.error("QB-E010", t.offset, "`{qid=..}` は空欄を 1 つ以上含むブロックにのみ付けられます");
    }
  }
}

function buildAutoQuestion(
  ctx: ParseContext,
  tokens: InlineToken[] | null,
  body: Block[],
  endOffset: number,
  diagOffset: number,
): QuestionBlock {
  let id: string | null = null;
  if (tokens) {
    const { attr, tokens: restTokens } = takeTrailingAttr(tokens, "qid");
    reportUnusedQid(ctx, restTokens);
    if (attr) {
      if (!isWellFormedId("question", attr.value)) {
        ctx.diags.error("QB-E010", attr.offset, `設問 ID \`${attr.value}\` の形式が不正です`);
        id = attr.value;
      } else if (ctx.questionIds.has(attr.value)) {
        ctx.diags.error("QB-E001", attr.offset, `設問 ID \`${attr.value}\` が重複しています`);
        id = attr.value;
      } else if (ctx.opts.retiredQuestionIds.has(attr.value)) {
        ctx.diags.error("QB-E011", attr.offset, `退役済みの設問 ID \`${attr.value}\` です`);
        id = attr.value;
      } else {
        id = attr.value;
        reserveId(ctx, "question", id);
      }
    }
  }

  if (!id) {
    id = newId(ctx, "question");
    ctx.diags.warn("QB-W001", diagOffset, "設問 ID を保存時に付与します");
    const prev = endOffset > 0 ? ctx.src[endOffset - 1] ?? "" : "";
    const prefix = prev === "" || /[\s|]/.test(prev) ? "" : " ";
    addWrite(ctx, endOffset, `${prefix}{qid=${id}}`);
  }

  if (ctx.questionIds.size > MAX_QUESTIONS) {
    ctx.diags.error("QB-E010", endOffset, `設問数が上限(${MAX_QUESTIONS})を超えています`);
  }

  return {
    type: "question",
    id,
    kind: "blank",
    points: 1,
    tags: [],
    auto: true,
    body,
  };
}

/* ------------------------------------------------------------------ */
/* 見出し                                                               */
/* ------------------------------------------------------------------ */

function plainText(raw: string): string {
  return raw
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/[*_`$]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
}

function headingId(ctx: ParseContext, text: string): string {
  const base =
    plainText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  const count = ctx.headingIds.get(base) ?? 0;
  ctx.headingIds.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

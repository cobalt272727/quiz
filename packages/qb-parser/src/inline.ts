/**
 * インライン解析(§4.2, §4.8)
 *
 * `[[ ]]` は mdast のテキスト値ではなく生ソースに対して解析する(§4.8)。
 * この実装はそもそも Markdown を経由せず生ソースを直接走査するため、
 * `\[[` や `&vert;` が Markdown パーサに消費される問題は原理的に起きない。
 *
 * 解釈しない領域(§4.8): インラインコード / 数式 / リンク URL・表示テキスト。
 */

import type { AttrToken, Inline, InlineToken } from "./types.ts";
import type { ParseContext } from "./parse-context.ts";
import { parseAttributeText, parseBlank } from "./blank.ts";
import { isAllowedLinkHref } from "./text.ts";

export type InlineFlags = {
  /** QB記法を解釈しない(リンクの表示テキスト用) */
  noQb?: boolean;
  noLinks?: boolean;
  table?: boolean;
};

const PUNCT_ESCAPABLE = /[\\`*_{}\[\]()#+\-.!|~$<>?]/;

export function parseInline(
  ctx: ParseContext,
  text: string,
  baseOffset: number,
  flags: InlineFlags = {},
): InlineToken[] {
  const out: InlineToken[] = [];
  let buf = "";

  const flush = () => {
    if (buf === "") return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.v += buf;
    else out.push({ t: "text", v: buf });
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // 1. エスケープ
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "[" && text[i + 2] === "[") {
        // \[[ は空欄開始記号のエスケープ(§4.2)
        buf += "[[";
        i += 3;
        continue;
      }
      if (PUNCT_ESCAPABLE.test(next)) {
        buf += next;
        i += 2;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    // 2. コードスパン(内部は QB記法を解釈しない)
    if (ch === "`") {
      const run = /^`+/.exec(text.slice(i))![0];
      const close = findCodeSpanClose(text, i + run.length, run);
      if (close < 0) {
        buf += run;
        i += run.length;
        continue;
      }
      flush();
      out.push({ t: "code", v: text.slice(i + run.length, close).replace(/\n/g, " ") });
      i = close + run.length;
      continue;
    }

    // 3. 数式($...$ / $$...$$)
    if (ch === "$") {
      const isBlock = text[i + 1] === "$";
      const delim = isBlock ? "$$" : "$";
      const start = i + delim.length;
      const close = findUnescaped(text, delim, start);
      if (close >= 0) {
        flush();
        out.push({ t: "math", v: text.slice(start, close).trim() });
        i = close + delim.length;
        continue;
      }
      buf += delim;
      i += delim.length;
      continue;
    }

    // 4. 画像 / リンク(表示テキストでは QB記法を解釈しない。§4.8)
    if (!flags.noLinks && (ch === "[" || (ch === "!" && text[i + 1] === "["))) {
      const isImage = ch === "!";
      const labelStart = isImage ? i + 2 : i + 1;
      const labelEnd = findLabelClose(text, labelStart);
      if (labelEnd >= 0 && text[labelEnd + 1] === "(") {
        const dest = readDestination(text, labelEnd + 1);
        if (dest) {
          if (isImage) {
            // AST にインライン画像はないため alt をテキストにする
            buf += text.slice(labelStart, labelEnd);
          } else {
            if (!isAllowedLinkHref(dest.href)) {
              ctx.diags.error(
                "QB-E012",
                baseOffset + i,
                `URL スキームが許可されていません: ${dest.href}`,
              );
            }
            flush();
            out.push({
              t: "link",
              href: dest.href,
              c: toInline(
                parseInline(ctx, text.slice(labelStart, labelEnd), baseOffset + labelStart, {
                  ...flags,
                  noQb: true,
                  noLinks: true,
                }),
              ),
            });
          }
          i = dest.end;
          continue;
        }
      }
    }

    // 5. 空欄
    if (ch === "[") {
      if (text[i + 1] === "[" && !flags.noQb) {
        const parsed = readBlankToken(ctx, text, i, baseOffset, flags);
        if (parsed) {
          flush();
          out.push(parsed.inline);
          i = parsed.end;
          continue;
        }
      }
      buf += "[";
      i++;
      continue;
    }

    // 6. 強調(内部の QB記法は解釈する)
    if (ch === "*" || ch === "_") {
      const strong = text[i + 1] === ch;
      const delim = strong ? ch + ch : ch;
      if (!(ch === "_" && !strong && isWordChar(text[i - 1]))) {
        const close = findEmphasisClose(text, i + delim.length, delim);
        if (close >= 0 && close > i + delim.length) {
          flush();
          const inner = text.slice(i + delim.length, close);
          out.push({
            t: strong ? "strong" : "em",
            c: toInline(parseInline(ctx, inner, baseOffset + i + delim.length, flags)),
          });
          i = close + delim.length;
          continue;
        }
      }
      buf += delim;
      i += delim.length;
      continue;
    }

    // 7. ブロック末尾の属性 `{qid=..}` / `{id=..}`
    if (ch === "{") {
      if (text[i + 1] === "{" && !flags.noQb) {
        ctx.diags.error("QB-E006", baseOffset + i, "`[[答]]` を使ってください");
      }
      const m = /^\{([A-Za-z][A-Za-z0-9_-]*)\s*=\s*([^{}]*)\}/.exec(text.slice(i));
      if (m && !flags.noQb) {
        flush();
        out.push({ t: "attr", key: m[1], value: m[2].trim(), offset: baseOffset + i });
        i += m[0].length;
        continue;
      }
    }

    // 8. 改行は空白として扱う
    if (ch === "\n") {
      buf += "\n";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}


/** `[` の対応する `]` を探す(入れ子とエスケープを考慮) */
function findLabelClose(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** `(href "title")` を読み取る。open は `(` の位置 */
function readDestination(text: string, open: number): { href: string; end: number } | null {
  let i = open + 1;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  let href = "";
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      href += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "(") {
      depth++;
      href += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) return { href: href.trim(), end: i + 1 };
      depth--;
      href += ch;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t") {
      const rest = text.slice(i);
      const title = /^[ \t]+"[^"]*"[ 	]*\)/.exec(rest);
      if (title) return { href: href.trim(), end: i + title[0].length };
      break;
    }
    href += ch;
    i++;
  }
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  if (text[i] !== ")") return null;
  return { href: href.trim(), end: i + 1 };
}

function readBlankToken(
  ctx: ParseContext,
  text: string,
  start: number,
  baseOffset: number,
  flags: InlineFlags,
): { inline: Inline; end: number } | null {
  let j = start + 2;
  let content = "";
  let closed = false;
  while (j < text.length) {
    if (text[j] === "\\" && j + 1 < text.length) {
      content += text[j] + text[j + 1];
      j += 2;
      continue;
    }
    if (text[j] === "]" && text[j + 1] === "]") {
      closed = true;
      break;
    }
    content += text[j];
    j++;
  }
  if (!closed) {
    ctx.diags.error("QB-E002", baseOffset + start, "空欄が `]]` で閉じられていません");
    return null;
  }
  let end = j + 2;
  let attrs = null;
  const attrMatch = /^\{([^{}]*)\}/.exec(text.slice(end));
  if (attrMatch) {
    attrs = parseAttributeText(attrMatch[1], baseOffset + end);
    end += attrMatch[0].length;
  }
  const inline = parseBlank(ctx, content, baseOffset + start + 2, attrs, {
    table: !!flags.table,
    tokenEnd: baseOffset + end,
  });
  return { inline, end };
}

/** AttrToken を取り除き、Inline[] に落とす */
export function toInline(tokens: InlineToken[]): Inline[] {
  return tokens.filter((t): t is Inline => t.t !== "attr");
}

/** 末尾の属性を 1 つ取り出す(`{qid=..}` の位置検出用) */
export function takeTrailingAttr(
  tokens: InlineToken[],
  key: string,
): { attr: AttrToken | null; tokens: InlineToken[] } {
  const rest = [...tokens];
  let attr: AttrToken | null = null;
  while (rest.length > 0) {
    const last = rest[rest.length - 1];
    if (last.t !== "attr") break;
    if (!attr && last.key === key) {
      attr = last;
      rest.pop();
      continue;
    }
    break;
  }
  return { attr, tokens: rest };
}

export function hasBlank(inlines: Inline[]): boolean {
  return inlines.some((i) => {
    if (i.t === "blank" || i.t === "choiceBlank") return true;
    if (i.t === "strong" || i.t === "em" || i.t === "link") return hasBlank(i.c);
    return false;
  });
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

function findUnescaped(text: string, delim: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text.startsWith(delim, i)) return i;
    i++;
  }
  return -1;
}

function findCodeSpanClose(text: string, from: number, run: string): number {
  let i = from;
  while (i < text.length) {
    if (text.startsWith(run, i)) {
      // より長いバックティック列は別のコードスパン開始
      const longer = new RegExp(`^\`{${run.length + 1},}`).exec(text.slice(i));
      if (!longer) return i;
      i += longer[0].length;
      continue;
    }
    i++;
  }
  return -1;
}

function findEmphasisClose(text: string, from: number, delim: string): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      const run = /^`+/.exec(text.slice(i))![0];
      const close = findCodeSpanClose(text, i + run.length, run);
      i = close < 0 ? i + run.length : close + run.length;
      continue;
    }
    if (text.startsWith(delim, i)) {
      if (delim === "_" && isWordChar(text[i + 1])) {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

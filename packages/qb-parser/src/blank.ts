/**
 * 空欄の解析(§4.2, §4.5)
 *
 * `[[ ]]` の中身を Matcher / 選択肢に変換し、属性 `{id=.. w=..}` を検証する。
 */

import type { Inline, Matcher } from "./types.ts";
import { addWrite, newId, type ParseContext } from "./parse-context.ts";
import { isWellFormedId } from "./ids.ts";
import { validateRegexSubset } from "./text.ts";

export type AttrPair = { key: string; value: string; offset: number };

export type ParsedAttributes = {
  pairs: AttrPair[];
  /** `{` の絶対オフセット */
  braceOffset: number;
};

const DECIMAL_UNSIGNED = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/;
const DECIMAL_SIGNED = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/;

/** `id=.. w=..` を解析する(キーは呼び出し側で検証) */
export function parseAttributeText(raw: string, braceOffset: number): ParsedAttributes {
  const pairs: AttrPair[] = [];
  const re = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const value = m[2].startsWith('"') && m[2].endsWith('"') ? m[2].slice(1, -1) : m[2];
    pairs.push({ key: m[1], value, offset: braceOffset + 1 + m.index });
  }
  return { pairs, braceOffset };
}

export type BlankParseOptions = {
  /** 表のセル内かどうか(現状は区切り規則が同じ) */
  table: boolean;
  /** 空欄トークンの終端(`]]` の直後) */
  tokenEnd: number;
};

/**
 * 空欄 1 つを解析する。文法違反でも Inline を返し(プレビューを壊さない)、
 * 診断にエラーを積む。保存可否は呼び出し側が diagnostics で判断する。
 */
export function parseBlank(
  ctx: ParseContext,
  content: string,
  contentOffset: number,
  attrs: ParsedAttributes | null,
  options: BlankParseOptions,
): Inline {
  let id: string | undefined;
  let weight = 1;
  let attrHasId = false;

  if (attrs) {
    for (const pair of attrs.pairs) {
      if (pair.key === "id") {
        attrHasId = true;
        if (!isWellFormedId("blank", pair.value)) {
          ctx.diags.error("QB-E010", pair.offset, `空欄 ID \`${pair.value}\` の形式が不正です`);
          continue;
        }
        if (ctx.blankIds.has(pair.value)) {
          ctx.diags.error("QB-E001", pair.offset, `空欄 ID \`${pair.value}\` が重複しています`);
          continue;
        }
        if (ctx.opts.retiredBlankIds.has(pair.value)) {
          ctx.diags.error("QB-E011", pair.offset, `退役済みの空欄 ID \`${pair.value}\` です`);
          continue;
        }
        id = pair.value;
        ctx.blankIds.add(id);
      } else if (pair.key === "w") {
        const n = Number(pair.value);
        if (!Number.isFinite(n) || n <= 0 || n > 1000) {
          ctx.diags.error("QB-E007", pair.offset, `重み \`${pair.value}\` は 0 より大きく 1000 以下です`);
          continue;
        }
        weight = n;
      } else {
        ctx.diags.error("QB-E010", pair.offset, `空欄に指定できない属性 \`${pair.key}\` です`);
      }
    }
  }

  if (!id) {
    id = newId(ctx, "blank");
    ctx.diags.warn("QB-W001", contentOffset, "空欄 ID を保存時に付与します");
    if (attrs) {
      addWrite(ctx, attrs.braceOffset + 1, `id=${id} `);
    } else {
      addWrite(ctx, options.tokenEnd, `{id=${id}}`);
    }
  }

  const trimmed = content.trim();
  if (trimmed === "") {
    ctx.diags.error("QB-E008", contentOffset, "空欄が空です");
    return { t: "blank", id, weight, answers: [] };
  }
  if (trimmed.length > 2000) {
    ctx.diags.error("QB-E010", contentOffset, "空欄の定義が長すぎます");
  }

  // 正規表現 [[/pattern/flags]]
  if (trimmed.startsWith("/")) {
    const last = trimmed.lastIndexOf("/");
    if (last <= 0) {
      ctx.diags.error("QB-E004", contentOffset, "正規表現は /pattern/ の形で閉じてください");
      return { t: "blank", id, weight, answers: [{ kind: "regex", pattern: trimmed.slice(1) }] };
    }
    const pattern = trimmed.slice(1, last);
    const flags = trimmed.slice(last + 1).trim();
    const check = validateRegexSubset(pattern, flags);
    if (!check.ok) ctx.diags.error("QB-E004", contentOffset, check.reason);
    const matcher: Matcher = { kind: "regex", pattern, ...(flags === "i" ? { flags: "i" as const } : {}) };
    return { t: "blank", id, weight, answers: [matcher] };
  }

  // 数値 [[=値 ±許容誤差]]
  if (trimmed.startsWith("=")) {
    const body = trimmed.slice(1).trim();
    const parts = body.split("±");
    if (parts.length > 2) {
      ctx.diags.error("QB-E009", contentOffset, "許容誤差の区切り `±` が複数あります");
      return { t: "blank", id, weight, answers: [] };
    }
    const v = parts[0].trim();
    const tol = parts.length === 2 ? parts[1].trim() : undefined;
    if (!DECIMAL_SIGNED.test(v)) {
      ctx.diags.error("QB-E009", contentOffset, `数値 \`${v}\` を解析できません`);
      return { t: "blank", id, weight, answers: [] };
    }
    if (tol !== undefined && !DECIMAL_UNSIGNED.test(tol)) {
      ctx.diags.error("QB-E009", contentOffset, `許容誤差 \`${tol}\` は 0 以上の有限数です`);
      return { t: "blank", id, weight, answers: [{ kind: "number", v }] };
    }
    return {
      t: "blank",
      id,
      weight,
      answers: [{ kind: "number", v, ...(tol !== undefined ? { tol } : {}) }],
    };
  }

  const parts = splitAlternatives(content);
  const choices = parts.map(parseChoicePart);
  const hasChoiceMark = choices.some((c) => c.correct);

  if (hasChoiceMark) {
    const options: string[] = [];
    const correct: number[] = [];
    for (const c of choices) {
      if (c.value === "") continue;
      if (c.correct) correct.push(options.length);
      options.push(c.value);
    }
    if (options.length < 2) {
      ctx.diags.error("QB-E008", contentOffset, "選択肢空欄には 2 つ以上の選択肢が必要です");
    }
    return { t: "choiceBlank", id, weight, options, correct };
  }

  const answers: Matcher[] = choices
    .map((c) => c.value.trim())
    .filter((v) => v !== "")
    .map((v) => ({ kind: "exact" as const, v }));
  if (answers.length === 0) {
    ctx.diags.error("QB-E008", contentOffset, "許容解答がありません");
  }
  return { t: "blank", id, weight, answers };
}

/** `|` と `\|` を区切りとして分割する。`&vert;` はリテラルの `|` (§4.7) */
export function splitAlternatives(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      parts.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (ch === "|") {
      parts.push(cur);
      cur = "";
      continue;
    }
    if (ch === "&" && s.startsWith("&vert;", i)) {
      cur += "|";
      i += 5;
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

type ChoicePart = { value: string; correct: boolean };

function parseChoicePart(raw: string): ChoicePart {
  const t = raw.trim();
  if (t.startsWith("?")) return { value: t.slice(1).trim(), correct: true };
  if (t.startsWith("\\?")) return { value: `?${t.slice(2).trim()}`, correct: false };
  return { value: t, correct: false };
}

/**
 * フロントマター(YAML サブセット)の解析と Meta の検証(§4.1)
 *
 * 依存を増やさないため、フロントマターで使う形だけを解釈する小さな YAML 実装。
 * 対応: スカラ(文字列/数値/真偽)、インライン配列 `[a, b]`、
 *       インラインマップ `{k: v}`、ブロック配列 `- a`、ブロックマップ(1 階層)
 */

import type { Lang, Meta } from "./types.ts";
import type { DiagnosticSink } from "./diagnostics.ts";

type YamlScalar = string | number | boolean;
type YamlValue = YamlScalar | YamlValue[] | { [k: string]: YamlValue };
type YamlMap = { [k: string]: YamlValue };

export type FrontmatterResult = {
  meta: Meta;
  /** フロントマター終端の絶対オフセット(本文の開始位置) */
  bodyOffset: number;
};

const DEFAULT_META: Omit<Meta, "title"> = {
  tags: [],
  lang: "ja",
  shuffle: { questions: false, choices: false },
  normalize: { kana: false },
  practiceFeedback: false,
};

/** 先頭が `---` で始まる場合のみフロントマターとして扱う */
export function hasFrontmatter(source: string): boolean {
  const s = source.startsWith("\uFEFF") ? source.slice(1) : source;
  return /^---[ \t]*\r?\n/.test(s);
}

export function parseFrontmatter(
  source: string,
  diags: DiagnosticSink,
): FrontmatterResult {
  const bomLength = source.startsWith("\uFEFF") ? 1 : 0;
  const body = source.slice(bomLength);
  const lines = body.split("\n");

  const startLine = 1;
  if (!/^---[ \t]*\r?$/.test(lines[0] ?? "")) {
    diags.error("QB-E010", bomLength, "フロントマターは `---` で始めてください");
    return { meta: { title: "", ...cloneDefault() }, bodyOffset: bomLength };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*\r?$/.test(lines[i]) || /^\.\.\.[ \t]*\r?$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    diags.error("QB-E010", bomLength, "フロントマターが閉じられていません");
    return { meta: { title: "", ...cloneDefault() }, bodyOffset: bomLength };
  }

  const yamlLines = lines.slice(1, end);
  const { map, errors } = parseYamlSubset(yamlLines);
  const yamlOffset = bomLength + body.indexOf("\n") + 1;
  for (const err of errors) {
    diags.error("QB-E010", yamlOffset, `フロントマター ${err}`);
  }

  const meta = validateMeta(map, diags, yamlOffset, startLine);
  // bodyOffset: 終了 `---` 行の次
  let offset = bomLength;
  for (let i = 0; i <= end; i++) offset += lines[i].length + 1;
  return { meta, bodyOffset: Math.min(offset, source.length) };
}

function cloneDefault(): Omit<Meta, "title"> {
  return {
    ...DEFAULT_META,
    tags: [],
    shuffle: { ...DEFAULT_META.shuffle },
    normalize: { ...DEFAULT_META.normalize },
  };
}

/* ------------------------------------------------------------------ */
/* YAML サブセット                                                      */
/* ------------------------------------------------------------------ */

const stripQuote = (s: string): string => {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
};

/** 値部分のコメントを除去する(引用符内と URL の # は残す) */
function stripComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function parseScalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s === "") return "";
  if (/^\[/.test(s)) return parseFlowSequence(s);
  if (/^\{/.test(s)) return parseFlowMap(s);
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return stripQuote(s);
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^(null|Null|NULL|~)$/.test(s)) return "";
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote === '"') {
        if (i + 1 < s.length) cur += s[++i];
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findKeySeparator(s: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === ":" && depth === 0) return i;
  }
  return -1;
}

function parseFlowSequence(s: string): YamlValue[] {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (inner.trim() === "") return [];
  return splitTopLevel(inner, ",").map((p) => parseScalar(p));
}

function parseFlowMap(s: string): YamlMap {
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  const out: YamlMap = {};
  if (inner.trim() === "") return out;
  for (const part of splitTopLevel(inner, ",")) {
    const idx = findKeySeparator(part);
    if (idx < 0) continue;
    const key = stripQuote(part.slice(0, idx).trim());
    out[key] = parseScalar(part.slice(idx + 1));
  }
  return out;
}

export function parseYamlSubset(lines: string[]): { map: YamlMap; errors: string[] } {
  const map: YamlMap = {};
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^[ \t]*/)?.[0].length ?? 0;
    if (indent > 0) {
      errors.push(`行 ${i + 1}: 想定外のインデントです`);
      continue;
    }
    const withoutComment = stripComment(raw);
    const idx = findKeySeparator(withoutComment);
    if (idx < 0) {
      errors.push(`行 ${i + 1}: \`key: value\` 形式で書いてください`);
      continue;
    }
    const key = stripQuote(withoutComment.slice(0, idx).trim());
    const rest = withoutComment.slice(idx + 1).trim();
    if (rest !== "") {
      map[key] = parseScalar(rest);
      continue;
    }
    // ブロック値(インデントされた配列 or マップ)
    const childLines: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "" || l.trim().startsWith("#")) {
        childLines.push(l);
        continue;
      }
      const ind = l.match(/^[ \t]*/)?.[0].length ?? 0;
      if (ind === 0) break;
      childLines.push(l);
    }
    i = j - 1;
    const meaningful = childLines.filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    if (meaningful.length === 0) {
      map[key] = "";
      continue;
    }
    if (meaningful[0].trim().startsWith("- ")) {
      map[key] = meaningful.map((l) => parseScalar(stripComment(l.trim().slice(1).trim())));
    } else {
      const nested: YamlMap = {};
      for (const l of meaningful) {
        const ind = l.match(/^[ \t]*/)?.[0].length ?? 0;
        const t = stripComment(l.trim());
        const k = findKeySeparator(t);
        if (k < 0) {
          errors.push(`行 ${i + 1}: ネストした値が不正です`);
          continue;
        }
        void ind;
        nested[stripQuote(t.slice(0, k).trim())] = parseScalar(t.slice(k + 1));
      }
      map[key] = nested;
    }
  }
  return { map, errors };
}

/* ------------------------------------------------------------------ */
/* Meta 検証                                                            */
/* ------------------------------------------------------------------ */

const META_KEYS = new Set([
  "title",
  "description",
  "tags",
  "lang",
  "timeLimit",
  "practiceFeedback",
  "shuffle",
  "normalize",
]);

function validateMeta(
  map: YamlMap,
  diags: DiagnosticSink,
  offset: number,
  line: number,
): Meta {
  for (const key of Object.keys(map)) {
    if (!META_KEYS.has(key)) {
      diags.error("QB-E010", offset, `未知のフロントマター項目 \`${key}\` (行 ${line})`);
    }
  }

  const meta: Meta = { title: "", ...cloneDefault() };

  const title = map.title;
  if (typeof title === "string" && title.trim() !== "") meta.title = title.trim();
  else diags.error("QB-E010", offset, "`title` は必須です");

  if (typeof map.description === "string" && map.description !== "") {
    meta.description = map.description;
  }
  if (Array.isArray(map.tags)) {
    meta.tags = map.tags.map((t) => String(t)).filter((t) => t !== "");
  } else if (typeof map.tags === "string" && map.tags !== "") {
    meta.tags = [map.tags];
  }
  if (map.lang === "ja" || map.lang === "en") meta.lang = map.lang as Lang;
  else if (map.lang !== undefined) diags.error("QB-E010", offset, "`lang` は ja / en のいずれかです");

  if (map.timeLimit !== undefined) {
    const v = map.timeLimit;
    if (typeof v === "number" && Number.isInteger(v) && v > 0) meta.timeLimit = v;
    else diags.error("QB-E010", offset, "`timeLimit` は正の整数(秒)です");
  }

  if (map.practiceFeedback !== undefined) {
    if (typeof map.practiceFeedback === "boolean") meta.practiceFeedback = map.practiceFeedback;
    else diags.error("QB-E010", offset, "`practiceFeedback` は真偽値です");
  }

  if (map.shuffle !== undefined) {
    if (isPlainMap(map.shuffle)) {
      for (const [k, v] of Object.entries(map.shuffle)) {
        if (k !== "questions" && k !== "choices") {
          diags.error("QB-E010", offset, "`shuffle` は questions / choices のみ指定できます");
          continue;
        }
        if (typeof v !== "boolean") {
          diags.error("QB-E010", offset, `\`shuffle.${k}\` は真偽値です`);
          continue;
        }
        meta.shuffle[k] = v;
      }
    } else {
      diags.error("QB-E010", offset, "`shuffle` はマップです");
    }
  }

  if (map.normalize !== undefined) {
    if (isPlainMap(map.normalize)) {
      for (const [k, v] of Object.entries(map.normalize)) {
        if (k !== "kana") {
          diags.error("QB-E010", offset, "`normalize` は kana のみ指定できます");
          continue;
        }
        if (typeof v !== "boolean") {
          diags.error("QB-E010", offset, "`normalize.kana` は真偽値です");
          continue;
        }
        meta.normalize.kana = v;
      }
    } else {
      diags.error("QB-E010", offset, "`normalize` はマップです");
    }
  }

  return meta;
}

function isPlainMap(v: YamlValue): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

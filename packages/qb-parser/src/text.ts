/**
 * 比較用の正規化・リンク検証・正規表現の RE2 互換検証(§4.5, §9)
 */

export type NormalizeOptions = { kana: boolean };

/** 判定対象の文字列正規化(NFKC → 前後空白除去 → 英字の大小無視 → かな同一視) */
export function normalizeForCompare(input: string, opts: NormalizeOptions): string {
  let s = input.normalize("NFKC").trim();
  // 英字のみ大小を無視する(トルコ語 i 等のロケール依存を避ける)
  s = s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  if (opts.kana) s = hiraganaToKatakana(s);
  return s;
}

export function hiraganaToKatakana(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x3041 && cp <= 0x3096) out += String.fromCodePoint(cp + 0x60);
    else out += ch;
  }
  return out;
}

/** 正規表現の入力正規化。大小無視は i フラグのみで制御する(§4.5) */
export function normalizeForRegex(input: string): string {
  return input.normalize("NFKC").trim();
}

export const REGEX_MAX_PATTERN_LENGTH = 200;
export const REGEX_MAX_INPUT_LENGTH = 500;
export const NUMBER_ANSWER_MAX_LENGTH = 64;
export const TEXT_ANSWER_MAX_LENGTH = 500;

export type RegexValidation = { ok: true } | { ok: false; reason: string };

/**
 * RE2 互換サブセットの検証。後方参照・先読み/後読み・原子グループ・
 * 条件式・独占的量子を拒否する(§4.5, §9)。
 */
export function validateRegexSubset(pattern: string, flags: string): RegexValidation {
  if (pattern.length > REGEX_MAX_PATTERN_LENGTH) {
    return { ok: false, reason: `パターン長が ${REGEX_MAX_PATTERN_LENGTH} 文字を超えています` };
  }
  if (flags !== "" && flags !== "i") {
    return { ok: false, reason: "フラグは i のみ指定できます" };
  }

  // エスケープを考慮して走査する
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return { ok: false, reason: "末尾のバックスラッシュ" };
      if (!inClass) {
        if (/[1-9]/.test(next)) return { ok: false, reason: "後方参照は使用できません" };
        if (next === "k") return { ok: false, reason: "名前付き後方参照は使用できません" };
        if (next === "C") return { ok: false, reason: "\\C は使用できません" };
      }
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      if (pattern.startsWith("(?=", i) || pattern.startsWith("(?!", i)) {
        return { ok: false, reason: "先読みは使用できません" };
      }
      if (pattern.startsWith("(?<=", i) || pattern.startsWith("(?<!", i)) {
        return { ok: false, reason: "後読みは使用できません" };
      }
      if (pattern.startsWith("(?>", i)) {
        return { ok: false, reason: "原子グループは使用できません" };
      }
      if (pattern.startsWith("(?(", i)) {
        return { ok: false, reason: "条件式は使用できません" };
      }
      if (pattern.startsWith("(?R", i) || /^\(\?\d/.test(pattern.slice(i))) {
        return { ok: false, reason: "再帰は使用できません" };
      }
    }
    if ((ch === "*" || ch === "+" || ch === "?" || ch === "}") && pattern[i + 1] === "+") {
      return { ok: false, reason: "独占的量子は使用できません" };
    }
  }

  try {
    new RegExp(`(?:${pattern})`, flags);
  } catch {
    return { ok: false, reason: "正規表現として解析できません" };
  }
  return { ok: true };
}

const MINUS_VARIANTS = /[\u2212\uFF0D\u2010-\u2015\u2043\uFE63\u2796]/g;

/**
 * 数値空欄の回答を解析する(§4.5)。
 * 失敗は null(= 不正解)。NFKC → 負号の統一 → 桁区切りカンマの検証 → 文法検証。
 */
export function normalizeNumberAnswer(raw: string): string | null {
  let s = raw.normalize("NFKC").trim();
  if (s.length === 0 || s.length > NUMBER_ANSWER_MAX_LENGTH) return null;
  s = s.replace(MINUS_VARIANTS, "-");
  if (s.includes(",")) {
    const m = /^([+-]?)([0-9][0-9,]*)(\.[0-9]*)?([eE][+-]?\d{1,3})?$/.exec(s);
    if (!m) return null;
    // 3 桁区切りの位置にある場合のみ許可する(`1,5` は不正解)
    if (!/^\d{1,3}(,\d{3})+$/.test(m[2])) return null;
    s = `${m[1]}${m[2].replace(/,/g, "")}${m[3] ?? ""}${m[4] ?? ""}`;
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/.test(s)) return null;
  return s;
}

/** リンク URL のスキーム検証(§9)。許可: http / https / mailto、および相対 URL */
export function isAllowedLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("//")) return false;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!m) return true; // スキームなし = 相対 URL / アンカー
  const scheme = m[1].toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto";
}

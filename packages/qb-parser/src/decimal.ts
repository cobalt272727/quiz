/**
 * 10 進演算(§4.5)
 *
 * 依存を増やさないため、`decimal.js` 相当の必要最小限を BigInt で実装する。
 * - 数値空欄の境界判定(浮動小数点誤差なし)
 * - 配点の按分と「小数第 3 位を四捨五入して 2 桁」の丸め
 * 仕様が要求するのはこの 2 点だけなので、汎用の Decimal クラスは持たない。
 */

const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/;

export function isDecimalLiteral(s: string): boolean {
  return DECIMAL_RE.test(s);
}

export type DecimalParts = {
  /** 1 または -1 */
  sign: 1 | -1;
  /** 先頭 0 を除いた整数部+小数部の数字列(0 は "0") */
  digits: string;
  /** 値 = sign * digits * 10^exp */
  exp: number;
};

/** 10 進リテラルを厳密に分解する。文法違反は null(§4.5 の文法) */
export function parseDecimal(input: string): DecimalParts | null {
  const s = input.trim();
  if (!DECIMAL_RE.test(s)) return null;
  let rest = s;
  let sign: 1 | -1 = 1;
  if (rest[0] === "+") rest = rest.slice(1);
  else if (rest[0] === "-") {
    sign = -1;
    rest = rest.slice(1);
  }
  let exponent = 0;
  const eIdx = rest.search(/[eE]/);
  if (eIdx >= 0) {
    exponent = Number.parseInt(rest.slice(eIdx + 1), 10);
    rest = rest.slice(0, eIdx);
  }
  const dot = rest.indexOf(".");
  let digits: string;
  let fracLen = 0;
  if (dot >= 0) {
    fracLen = rest.length - dot - 1;
    digits = rest.slice(0, dot) + rest.slice(dot + 1);
  } else {
    digits = rest;
  }
  digits = digits.replace(/^0+/, "");
  if (digits === "") digits = "0";
  return { sign, digits, exp: exponent - fracLen };
}

/** 正規化した 10 進文字列(保存・比較用。指数表記を許容) */
export function decimalToString(d: DecimalParts): string {
  if (d.digits === "0") return "0";
  const sign = d.sign < 0 ? "-" : "";
  return `${sign}${d.digits}e${d.exp}`;
}

/** 指数を展開した平易な 10 進表記(表示用。例: `1.2e-3` → `0.0012`) */
export function decimalToPlainString(d: DecimalParts): string {
  if (d.digits === "0") return "0";
  const sign = d.sign < 0 ? "-" : "";
  const digits = d.digits;
  if (d.exp >= 0) return `${sign}${digits}${"0".repeat(d.exp)}`;
  const pointPos = digits.length + d.exp;
  if (pointPos > 0) {
    return `${sign}${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return `${sign}0.${"0".repeat(-pointPos)}${digits}`;
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** sign * digits * 10^(exp - minExp) を BigInt で返す */
function scaled(parts: DecimalParts, minExp: number): bigint {
  const v = BigInt(parts.digits) * pow10(parts.exp - minExp);
  return parts.sign < 0 ? -v : v;
}

/**
 * `abs(value - target) <= tolerance` を厳密に判定する(境界値は正解に含める)
 */
export function withinTolerance(value: string, target: string, tolerance?: string): boolean {
  const v = parseDecimal(value);
  const t = parseDecimal(target);
  const tol = parseDecimal(tolerance ?? "0");
  if (!v || !t || !tol) return false;
  if (tol.sign < 0) return false;
  const minExp = Math.min(v.exp, t.exp, tol.exp);
  const diff = scaled(v, minExp) - scaled(t, minExp);
  const abs = diff < 0n ? -diff : diff;
  return abs <= scaled(tol, minExp);
}

/* ------------------------------------------------------------------ */
/* 有理数(BigInt)と配点の丸め                                          */
/* ------------------------------------------------------------------ */

export type Frac = { num: bigint; den: bigint };

export const frac = (num: bigint, den: bigint = 1n): Frac => {
  if (den === 0n) throw new Error("division by zero");
  if (den < 0n) return { num: -num, den: -den };
  return { num, den };
};

export function decimalToFrac(d: DecimalParts): Frac {
  if (d.exp >= 0) return frac(BigInt(d.sign) * BigInt(d.digits) * pow10(d.exp));
  return frac(BigInt(d.sign) * BigInt(d.digits), pow10(-d.exp));
}

export function fracAdd(a: Frac, b: Frac): Frac {
  return frac(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function fracMul(a: Frac, b: Frac): Frac {
  return frac(a.num * b.num, a.den * b.den);
}

export function fracSub(a: Frac, b: Frac): Frac {
  return frac(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function fracIsZero(a: Frac): boolean {
  return a.num === 0n;
}

export function fracCompare(a: Frac, b: Frac): number {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** 小数第 3 位を四捨五入して整数セント(bigint)にする(§4.5。0 以上の値のみ想定) */
export function roundToCentsHalfUp(a: Frac): bigint {
  const negative = a.num < 0n;
  const num = negative ? -a.num : a.num;
  // floor((2*num*100 + den) / (2*den)) が「小数第 3 位の四捨五入」に一致する
  const q = (num * 200n + a.den) / (2n * a.den);
  return negative ? -q : q;
}

/** セント整数を `-12.34` 形式に整形する */
export function centsToString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fracPart = abs % 100n;
  const text = `${whole}.${fracPart.toString().padStart(2, "0")}`;
  return negative && abs !== 0n ? `-${text}` : text;
}

export function centsToNumber(cents: bigint): number {
  return Number(centsToString(cents));
}

export function addCents(a: bigint, b: bigint): bigint {
  return a + b;
}

export function parsePointsToFrac(points: number | string): Frac | null {
  const s = typeof points === "number" ? formatNumberLiteral(points) : points;
  const d = parseDecimal(s);
  return d ? decimalToFrac(d) : null;
}

/** JS number を精度落ちしない範囲で 10 進リテラルにする */
export function formatNumberLiteral(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  const s = String(n);
  if (!s.includes("e") && !s.includes("E")) return s;
  // 指数表記を展開する(1e-7 等)
  const d = parseDecimal(s);
  return d ? decimalToString(d) : s;
}

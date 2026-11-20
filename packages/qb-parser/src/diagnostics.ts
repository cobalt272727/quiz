/**
 * 診断コードと診断リスト(§5.2)
 */

export const DIAGNOSTIC_MESSAGES = {
  "QB-E001": "ID がブック内で重複しています",
  "QB-E002": "[[ ]] / @q が閉じていません",
  "QB-E003": "表内の [[ ]] では区切りの | を \\| と書いてください",
  "QB-E004": "RE2 互換でない正規表現、または長さ超過です",
  "QB-E005": "参照している画像が解決できません",
  "QB-E006": "{{ }} は廃止されました。[[答]] を使ってください",
  "QB-E007": "配点 points / 重み w が範囲外です(有限の正数、上限 1000)",
  "QB-E008": "設問の正解定義が不正です",
  "QB-E009": "数値空欄の構文が不正です",
  "QB-E010": "属性値が不正です",
  "QB-E011": "退役済み ID を再利用しています",
  "QB-E012": "リンク URL のスキームが許可リスト外です",
  "QB-W001": "ID が未付与です(保存時に自動付与されます)",
  "QB-W002": "外部画像を使用しています",
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_MESSAGES;
export type Severity = "error" | "warning";

export type Diagnostic = {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  length?: number;
};

export type LineIndex = {
  /** 1 始まりの行番号と桁に変換する */
  locate(offset: number): { line: number; column: number };
};

export function buildLineIndex(source: string): LineIndex {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return {
    locate(offset: number) {
      const clamped = Math.max(0, Math.min(offset, source.length));
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= clamped) lo = mid;
        else hi = mid - 1;
      }
      return { line: lo + 1, column: clamped - starts[lo] + 1 };
    },
  };
}

export type DiagnosticSink = {
  error(code: DiagnosticCode, offset: number, message?: string, length?: number): void;
  warn(code: DiagnosticCode, offset: number, message?: string, length?: number): void;
  list: Diagnostic[];
};

export function createDiagnosticSink(index: LineIndex): DiagnosticSink {
  const list: Diagnostic[] = [];
  const push = (
    severity: Severity,
    code: DiagnosticCode,
    offset: number,
    message?: string,
    length?: number,
  ) => {
    const { line, column } = index.locate(offset);
    const base = DIAGNOSTIC_MESSAGES[code];
    list.push({
      code,
      severity,
      message: message ? `${base}: ${message}` : base,
      line,
      column,
      ...(length !== undefined ? { length } : {}),
    });
  };
  return {
    error: (code, offset, message, length) => push("error", code, offset, message, length),
    warn: (code, offset, message, length) => push("warning", code, offset, message, length),
    list,
  };
}

export class ParseError extends Error {
  readonly code: DiagnosticCode;
  constructor(code: DiagnosticCode, message?: string) {
    super(message ? `${DIAGNOSTIC_MESSAGES[code]}: ${message}` : DIAGNOSTIC_MESSAGES[code]);
    this.code = code;
    this.name = "ParseError";
  }
}

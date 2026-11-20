/**
 * ID の生成・検証・ソースへの書き戻し(§4.6)
 */

export type IdKind = "question" | "blank";

/** `q_` / `b_` + 小文字英数字 6〜16 文字 */
export const ID_RE = /^[qb]_[a-z0-9]{6,16}$/;
export const ID_PREFIX: Record<IdKind, "q" | "b"> = {
  question: "q",
  blank: "b",
};
export const DEFAULT_ID_LENGTH = 6;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type PendingWrite = {
  /** ソース上の絶対オフセット */
  offset: number;
  text: string;
  /** 同一オフセット内での安定順序 */
  seq: number;
};

export function isWellFormedId(kind: IdKind, id: string): boolean {
  if (!ID_RE.test(id)) return false;
  return id.startsWith(`${ID_PREFIX[kind]}_`);
}

function randomChars(length: number): string {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("CSPRNG (globalThis.crypto.getRandomValues) が利用できません");
  }
  const out: string[] = [];
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    cryptoObj.getRandomValues(buf);
    for (const byte of buf) {
      // 剰余バイアスを避けるため 36 の倍数範囲のみ採用
      if (byte < 252) {
        out.push(ALPHABET[byte % 36]);
        if (out.length === length) break;
      }
    }
  }
  return out.join("");
}

/** 衝突しない ID を生成する(既定 6 文字) */
export function generateId(
  kind: IdKind,
  isTaken: (id: string) => boolean,
  length = DEFAULT_ID_LENGTH,
): string {
  const prefix = ID_PREFIX[kind];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = `${prefix}_${randomChars(length)}`;
    if (!isTaken(id)) return id;
  }
  // 極端な衝突時は長さを伸ばす
  if (length < 16) return generateId(kind, isTaken, length + 1);
  throw new Error("ID を生成できませんでした");
}

/** 書き戻しをソースへ適用する。冪等(同じ書き戻しを 2 回適用しない前提) */
export function applyWriteback(source: string, writes: PendingWrite[]): string {
  const seen = new Set<string>();
  const byOffset = new Map<number, PendingWrite[]>();
  for (const w of writes) {
    const key = `${w.offset}:${w.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byOffset.get(w.offset);
    if (list) list.push(w);
    else byOffset.set(w.offset, [w]);
  }
  const offsets = [...byOffset.keys()].sort((a, b) => b - a);
  let out = source;
  for (const offset of offsets) {
    const group = byOffset.get(offset)!.sort((a, b) => a.seq - b.seq);
    out = out.slice(0, offset) + group.map((g) => g.text).join("") + out.slice(offset);
  }
  return out;
}

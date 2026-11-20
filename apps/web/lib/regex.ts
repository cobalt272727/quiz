import { RE2 } from "re2";

/**
 * サーバ採点用の正規表現エンジン(SPEC_v4 §4.5, §9)
 *
 * JavaScript の `RegExp` はバックトラック方式のため、`(a+)+$` のような
 * パターンと長い入力で計算量が爆発する(ReDoS)。RE2 は線形時間で動作する。
 * 作者の書いたパターンはユーザー入力なので、サーバでは必ずこちらを使う。
 */

type Compiled = InstanceType<typeof RE2>;

const MAX_CACHE = 500;
const cache = new Map<string, Compiled | null>();

/** `^(?:pattern)$` で全体一致を判定する(クライアント側の既定実装と同じ意味) */
export function re2Test(pattern: string, flags: string, input: string): boolean {
  const key = `${flags}\u0000${pattern}`;
  let compiled = cache.get(key);
  if (compiled === undefined) {
    try {
      compiled = new RE2(`^(?:${pattern})$`, flags);
    } catch {
      // RE2 が受け付けないパターン(保存時に QB-E004 で弾かれているはず)
      compiled = null;
    }
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, compiled);
  }
  if (!compiled) return false;
  try {
    return compiled.test(input);
  } catch {
    return false;
  }
}

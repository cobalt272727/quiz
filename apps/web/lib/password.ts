import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * パスワードのハッシュ化(SPEC_v4 §6.1)
 *
 * scrypt(N=16384, r=8, p=1)。`next/headers` に依存しないので、
 * 運用ツール(tools/)からも直接読み込める。
 */

export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(stored: string | null, password: string): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}


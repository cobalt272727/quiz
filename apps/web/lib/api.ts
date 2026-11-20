import { NextResponse } from "next/server";

/** API の共通ユーティリティ(SPEC_v4 §7) */

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "parse_failed"
  | "payload_too_large"
  | "unsupported"
  | "internal";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

const STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  parse_failed: 422,
  payload_too_large: 413,
  unsupported: 501,
  internal: 500,
};

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  headers?: HeadersInit,
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: STATUS[code], headers },
  );
}

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class BodyError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    throw new BodyError("payload_too_large", "リクエストが大きすぎます", 413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new BodyError("payload_too_large", "リクエストが大きすぎます", 413);
  }
  if (!text.trim()) throw new BodyError("invalid_request", "本文が空です", 400);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BodyError("invalid_request", "JSON として解釈できません", 400);
  }
}

/**
 * 変更系リクエストの送信元確認(CSRF 対策)。
 * SameSite=Lax に加えて、Origin が付いている場合はホストの一致を要求する。
 */
export function checkSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("host");
    return !host || originHost === host;
  } catch {
    return false;
  }
}

/**
 * クライアント IP。
 *
 * リバースプロキシが `X-Real-IP` を設定する構成を前提にする(`X-Forwarded-For` も許容)。
 * プロキシ側でこれらのヘッダーを**上書き**して信頼できる値にしておくこと(§9)。
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

export function clientUserAgent(request: Request): string {
  return request.headers.get("user-agent") ?? "";
}

/** 予期しない例外を握りつぶさず、500 と汎用メッセージに変換する */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof BodyError) {
    return fail(error.code, error.message);
  }
  console.error("[api]", error);
  return fail("internal", "サーバ内部でエラーが発生しました");
}

export const noStore = { "cache-control": "no-store" } as const;

/**
 * パスワード変更が必要なアカウント(管理者発行の一時パスワード)を
 * 書き込み API から締め出す(§3.4)。
 */
export function passwordChangeRequired(): NextResponse<ApiError> {
  return fail("forbidden", "パスワードの変更が必要です。設定画面で新しいパスワードを設定してください", {
    reason: "password_change_required",
  });
}

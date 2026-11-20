import { getCurrentUser } from "@/lib/auth";
import { importZipBook } from "@/lib/export";
import { checkSameOrigin, clientIp, fail, handleRouteError, json } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZIP_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 };

/** POST /api/books/import … ZIP(本文 + 画像)から作成。multipart の `file`(§9) */
export async function POST(request: Request) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const limited = await consumeRateLimit(`import:${user.id}:${clientIp(request)}`, ZIP_LIMIT);
    if (!limited.ok) return fail("rate_limited", "取り込みの回数が多すぎます");

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) return fail("invalid_request", "ZIP ファイルを指定してください");
    if (file.size > 20 * 1024 * 1024) return fail("payload_too_large", "ZIP が大きすぎます");
    if (!/\.zip$/i.test((file as File).name ?? "")) {
      return fail("invalid_request", "ZIP ファイルを指定してください");
    }

    const result = await importZipBook({
      actorId: user.id,
      zip: Buffer.from(await file.arrayBuffer()),
    });
    if (!result.ok) {
      if (result.reason === "too_large") return fail("payload_too_large", result.message ?? "大きすぎます");
      if (result.reason === "parse") return fail("parse_failed", "本文を解析できません");
      if (result.reason === "asset") return fail("invalid_request", result.message ?? "画像を取り込めません");
      return fail("invalid_request", result.message ?? "ZIP の内容が不正です");
    }
    return json({ book: { id: result.bookId } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { getCurrentUser } from "@/lib/auth";
import { exportBook, type ExportFormat } from "@/lib/export";
import { fail, handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/books/:id/export?format=qb|json|zip … 書き出し(owner / editor。§7.1) */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const format = (new URL(request.url).searchParams.get("format") ?? "qb") as ExportFormat;
    if (!["qb", "json", "zip"].includes(format)) {
      return fail("invalid_request", "format は qb / json / zip のいずれかです");
    }

    const result = await exportBook({ bookId: id, userId: user.id, format });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "書き出し権限がありません");
      return fail("not_found", "ブックが見つかりません");
    }

    return new Response(new Uint8Array(result.file.body), {
      headers: {
        "content-type": result.file.contentType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.file.filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

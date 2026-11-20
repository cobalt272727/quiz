import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { restoreBookVersion } from "@/lib/versions";
import { checkSameOrigin, fail, handleRouteError, json, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; version: string }> };

const Body = z.object({ expectedVersion: z.number().int().positive() });

/** POST /api/books/:id/versions/:version/restore … 過去の版を新しい版として復元 */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const { id, version } = await params;
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return fail("invalid_request", "版の指定が不正です");
    }

    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await restoreBookVersion({
      bookId: id,
      userId: user.id,
      version: versionNumber,
      expectedVersion: parsed.data.expectedVersion,
    });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "編集権限がありません");
      if (result.reason === "conflict") {
        return fail("conflict", "他の変更が保存されています。再読み込みしてください");
      }
      if (result.reason === "parse") return fail("parse_failed", "復元元の内容を解析できません");
      return fail("not_found", "指定の版が見つかりません");
    }
    return json({ book: { id, version: result.version, source: result.source } });
  } catch (error) {
    return handleRouteError(error);
  }
}

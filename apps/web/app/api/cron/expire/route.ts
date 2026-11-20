import { expireStaleAttempts } from "@/lib/attempts";
import { sweepOrphanFiles } from "@/lib/assets";
import { fail, handleRouteError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 期限切れ Attempt の回収(§7.6, §9)。
 * cron からは `x-cron-secret: $CRON_SECRET` を付けて呼ぶ。
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return fail("unsupported", "CRON_SECRET が設定されていません");
    if (request.headers.get("x-cron-secret") !== secret) {
      return fail("forbidden", "認証に失敗しました");
    }
    const expired = await expireStaleAttempts(200);
    // 一時ファイルと保持期間を過ぎた論理削除ブックの画像を回収する(§9)
    const files = await sweepOrphanFiles();
    return json({ expired, removedFiles: files.removed });
  } catch (error) {
    return handleRouteError(error);
  }
}

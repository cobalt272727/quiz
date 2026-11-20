import { destroyCurrentSession } from "@/lib/auth";
import { fail, handleRouteError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("host");
      if (host && new URL(origin).host !== host) return fail("forbidden", "送信元が不正です");
    }
    await destroyCurrentSession();
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

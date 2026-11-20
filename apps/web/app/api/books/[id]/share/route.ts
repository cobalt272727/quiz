import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { issueBookShareToken, revokeBookShareToken } from "@/lib/share";
import { checkSameOrigin, fail, handleRouteError, json, noStore, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Update = z.object({
  visibility: z.enum(["private", "link", "public", "invite"]).optional(),
  allowFork: z.boolean().optional(),
  /** public / link にするときの著作権確認(§7.1) */
  copyrightConsent: z.boolean().optional(),
  /** 共有リンクの再発行(旧リンクは失効する) */
  regenerateToken: z.boolean().optional(),
  /** 既存の受験も中断する(§7.8) */
  stopExistingAttempts: z.boolean().optional(),
});

/** 共有リンクの発行(§7.7)。平文トークンはこの応答でのみ返す */
export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const result = await issueBookShareToken(id, user.id);
    if (!result.ok) {
      if (result.reason === "not_link") {
        return fail("invalid_request", "公開範囲を「リンク限定」にすると共有リンクを発行できます");
      }
      if (result.reason === "forbidden") return fail("forbidden", "このブックの所有者ではありません");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ token: result.token, path: `/s/${result.token}` }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** 公開範囲・フォーク可否の変更、トークン再発行(§7.1) */
export async function PUT(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    const { id } = await params;
    const parsed = Update.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);
    const body = parsed.data;

    const book = await db.book.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        deletedAt: true,
        hiddenByAdmin: true,
        visibility: true,
      },
    });
    if (!book || book.deletedAt) return fail("not_found", "ブックが見つかりません");
    if (book.ownerId !== user.id) return fail("forbidden", "このブックの所有者ではありません");
    if (book.hiddenByAdmin) return fail("forbidden", "このブックは公開が停止されています");

    const nextVisibility = body.visibility ?? book.visibility;
    const becomingPublic =
      (nextVisibility === "public" || nextVisibility === "link") &&
      book.visibility !== nextVisibility &&
      book.visibility !== "public" &&
      book.visibility !== "link";
    if (becomingPublic && body.copyrightConsent !== true) {
      return fail(
        "invalid_request",
        "公開するには著作権・権利侵害に関する確認が必要です",
        { requiresCopyrightConsent: true },
      );
    }

    const visibilityChanged = nextVisibility !== book.visibility;

    await db.book.update({
      where: { id },
      data: {
        ...(body.visibility ? { visibility: body.visibility } : {}),
        ...(body.allowFork === undefined ? {} : { allowFork: body.allowFork }),
        // 公開範囲を変えたら旧トークンは即時失効(§7.8)
        ...(visibilityChanged ? { shareTokenHash: null } : {}),
      },
    });

    let abandonedAttempts = 0;
    if (body.stopExistingAttempts) {
      const result = await db.attempt.updateMany({
        where: { bookId: id, status: "in_progress" },
        data: { status: "abandoned", finishedAt: new Date() },
      });
      abandonedAttempts = result.count;
    }

    let token: string | null = null;
    if (nextVisibility === "link" && (body.regenerateToken || visibilityChanged)) {
      if (body.regenerateToken || visibilityChanged) {
        const issued = await issueBookShareToken(id, user.id);
        if (issued.ok) token = issued.token;
      }
    } else if (body.regenerateToken) {
      return fail("invalid_request", "共有リンクは「リンク限定」のときだけ発行できます");
    }

    return json(
      {
        book: {
          id,
          visibility: nextVisibility,
          allowFork: body.allowFork ?? undefined,
        },
        ...(token ? { token, path: `/s/${token}` } : {}),
        abandonedAttempts,
      },
      { headers: noStore },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;
    const ok = await revokeBookShareToken(id, user.id);
    if (!ok) return fail("not_found", "ブックが見つかりません");
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

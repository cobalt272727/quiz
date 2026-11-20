import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { addMember, listMembers, removeMember, updateMember } from "@/lib/members";
import { checkSameOrigin, fail, handleRouteError, json, noStore, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Add = z.object({
  loginId: z.string().trim().min(1).max(64),
  role: z.enum(["editor", "viewer"]),
});
const Change = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(["editor", "viewer"]).optional(),
});
const Remove = z.object({ userId: z.string().min(1).max(64) });

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const result = await listMembers(id, user.id);
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "閲覧権限がありません");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ members: result.members }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** メンバー追加(所有者のみ) */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const parsed = Add.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await addMember({
      bookId: id,
      actorId: user.id,
      loginId: parsed.data.loginId,
      role: parsed.data.role,
    });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "所有者のみ追加できます");
      if (result.reason === "invalid") return fail("invalid_request", "そのログイン ID のユーザーが見つかりません");
      if (result.reason === "conflict") return fail("conflict", "すでにメンバーです");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** ロール変更(所有者のみ) */
export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const parsed = Change.safeParse(await readJsonBody(request));
    if (!parsed.success || !parsed.data.role) {
      return fail("invalid_request", "指定が不正です", parsed.error?.issues);
    }

    const result = await updateMember({
      bookId: id,
      actorId: user.id,
      userId: parsed.data.userId,
      role: parsed.data.role,
    });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "所有者のみ変更できます");
      return fail("not_found", "メンバーが見つかりません");
    }
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** メンバー削除(所有者、または本人の退出) */
export async function DELETE(request: Request, { params }: Params) {
  try {
    if (!checkSameOrigin(request)) return fail("forbidden", "送信元が不正です");
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    const parsed = Remove.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "指定が不正です", parsed.error.issues);

    const result = await removeMember({ bookId: id, actorId: user.id, userId: parsed.data.userId });
    if (!result.ok) {
      if (result.reason === "forbidden") return fail("forbidden", "削除できません");
      return fail("not_found", "メンバーが見つかりません");
    }
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

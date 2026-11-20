import { db } from "./db";
import { bookRole, canManage } from "./access";

/**
 * 共同編集(SPEC_v4 §7.2)
 *
 * - 招待はログイン ID 指定。追加できるのは所有者だけ
 * - editor は編集・画像・履歴、viewer は閲覧・受験のみ
 * - `visibility=invite` のブックはメンバーだけが開ける
 */

export type MemberView = {
  userId: string;
  loginId: string;
  name: string;
  role: "editor" | "viewer";
  createdAt: string;
};

export type MemberResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid" | "conflict" };

const memberSelect = {
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { loginId: true, name: true, deletedAt: true } },
} as const;

export async function listMembers(
  bookId: string,
  userId: string,
): Promise<{ ok: true; members: MemberView[] } | { ok: false; reason: "not_found" | "forbidden" }> {
  const role = await bookRole(bookId, userId);
  if (!role) return { ok: false, reason: "not_found" };
  if (!canManage(role) && role !== "editor") return { ok: false, reason: "forbidden" };

  const rows = await db.bookMember.findMany({
    where: { bookId },
    orderBy: { createdAt: "asc" },
    select: memberSelect,
  });
  return {
    ok: true,
    members: rows
      .filter((row) => !row.user.deletedAt)
      .map((row) => ({
        userId: row.userId,
        loginId: row.user.loginId ?? "(削除済み)",
        name: row.user.name,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      })),
  };
}

export async function addMember(input: {
  bookId: string;
  actorId: string;
  loginId: string;
  role: "editor" | "viewer";
}): Promise<MemberResult> {
  const role = await bookRole(input.bookId, input.actorId);
  if (!role) return { ok: false, reason: "not_found" };
  if (!canManage(role)) return { ok: false, reason: "forbidden" };

  const target = await db.user.findFirst({
    where: { loginId: input.loginId.trim(), deletedAt: null },
    select: { id: true },
  });
  if (!target) return { ok: false, reason: "invalid" };

  const exists = await db.bookMember.findUnique({
    where: { bookId_userId: { bookId: input.bookId, userId: target.id } },
    select: { userId: true },
  });
  if (exists) return { ok: false, reason: "conflict" };

  await db.bookMember.create({
    data: { bookId: input.bookId, userId: target.id, role: input.role },
  });
  return { ok: true };
}

export async function updateMember(input: {
  bookId: string;
  actorId: string;
  userId: string;
  role: "editor" | "viewer";
}): Promise<MemberResult> {
  const role = await bookRole(input.bookId, input.actorId);
  if (!role) return { ok: false, reason: "not_found" };
  if (!canManage(role)) return { ok: false, reason: "forbidden" };

  const updated = await db.bookMember.updateMany({
    where: { bookId: input.bookId, userId: input.userId },
    data: { role: input.role },
  });
  return updated.count > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

export async function removeMember(input: {
  bookId: string;
  actorId: string;
  userId: string;
}): Promise<MemberResult> {
  const role = await bookRole(input.bookId, input.actorId);
  if (!role) return { ok: false, reason: "not_found" };
  // 所有者は削除できず、本人は自分のメンバーシップを抜けられる
  if (!canManage(role) && input.actorId !== input.userId) {
    return { ok: false, reason: "forbidden" };
  }

  const deleted = await db.bookMember.deleteMany({
    where: { bookId: input.bookId, userId: input.userId },
  });
  return deleted.count > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

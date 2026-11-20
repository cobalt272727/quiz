import { db } from "./db";

/**
 * ブックの権限判定(SPEC_v4 §7.2 認可マトリクス)
 *
 * owner  … 削除・共有設定・メンバー管理
 * editor … source 取得・更新・画像・履歴
 * viewer … 閲覧・受験のみ
 */

export type BookRole = "owner" | "editor" | "viewer";

export const canEdit = (role: BookRole | null): boolean => role === "owner" || role === "editor";
export const canManage = (role: BookRole | null): boolean => role === "owner";

export async function bookRole(bookId: string, userId: string | null): Promise<BookRole | null> {
  if (!userId) return null;
  const book = await db.book.findUnique({ where: { id: bookId }, select: { ownerId: true } });
  if (!book) return null;
  if (book.ownerId === userId) return "owner";
  const member = await db.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

export type BookAccess =
  | { ok: true; role: BookRole; ownerId: string }
  | { ok: false; reason: "not_found" | "forbidden" | "hidden" };

/** 管理系(owner/editor)向けに、ブックの存在・非表示・権限をまとめて判定する */
export async function loadBookForEdit(bookId: string, userId: string): Promise<BookAccess> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, ownerId: true, deletedAt: true, hiddenByAdmin: true },
  });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };
  const role = await bookRole(bookId, userId);
  if (!role) return { ok: false, reason: "not_found" };
  if (book.hiddenByAdmin && role !== "owner") return { ok: false, reason: "hidden" };
  if (book.hiddenByAdmin) {
    const admin = await db.user.findFirst({
      where: { id: userId, role: "admin" },
      select: { id: true },
    });
    if (!admin) return { ok: false, reason: "hidden" };
  }
  if (!canEdit(role)) return { ok: false, reason: "forbidden" };
  return { ok: true, role, ownerId: book.ownerId };
}

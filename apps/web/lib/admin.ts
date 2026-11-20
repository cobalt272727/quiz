import type { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getCurrentUser, type SessionUser } from "./auth";
import { fail } from "./api";

/**
 * 通報・管理者操作(SPEC_v4 §7.1 通報・管理, §7.2)
 *
 * - 管理者の操作は必ず `AdminAuditLog` に残す(秘密値は含めない)
 * - `hiddenByAdmin` は削除とは独立。解除すると元の公開範囲に戻る
 * - ユーザー停止は `suspendedAt` で表現し、既存セッションも失効させる
 */

export const ADMIN_ACTIONS = [
  "book.hide",
  "book.unhide",
  "report.reviewing",
  "report.resolve",
  "report.reject",
  "user.suspend",
  "user.unsuspend",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const isAdmin = (user: Pick<SessionUser, "role"> | null): boolean =>
  user?.role === "admin";

export async function logAdminAction(input: {
  adminUserId: string;
  action: AdminAction;
  targetType: "book" | "user" | "report";
  targetId: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason?.slice(0, 500) ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export type SimpleResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid_state" };

/** 通報を作る(同じ人が同じブックに未処理の通報を出していたら `duplicate`) */
export async function createReport(input: {
  bookId: string;
  reporterId: string;
  reason: string;
}): Promise<
  { ok: true; reportId: string; duplicated: false } | { ok: false; reason: "not_found" | "duplicate" }
> {
  const book = await db.book.findUnique({
    where: { id: input.bookId },
    select: { id: true, deletedAt: true, hiddenByAdmin: true },
  });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };
  if (book.hiddenByAdmin) return { ok: false, reason: "not_found" };

  const open = await db.report.findFirst({
    where: {
      bookId: input.bookId,
      reporterId: input.reporterId,
      status: { in: ["open", "reviewing"] },
    },
    select: { id: true },
  });
  if (open) return { ok: false, reason: "duplicate" };

  const report = await db.report.create({
    data: {
      bookId: input.bookId,
      reporterId: input.reporterId,
      reason: input.reason.slice(0, 1000),
    },
    select: { id: true },
  });
  return { ok: true, reportId: report.id, duplicated: false };
}

export async function setReportStatus(input: {
  reportId: string;
  adminUserId: string;
  status: "reviewing" | "resolved" | "rejected";
  reason?: string | null;
}): Promise<SimpleResult> {
  const report = await db.report.findUnique({
    where: { id: input.reportId },
    select: { id: true, status: true },
  });
  if (!report) return { ok: false, reason: "not_found" };

  await db.report.update({
    where: { id: input.reportId },
    data: {
      status: input.status,
      resolvedAt: input.status === "reviewing" ? null : new Date(),
    },
  });
  await logAdminAction({
    adminUserId: input.adminUserId,
    action:
      input.status === "reviewing"
        ? "report.reviewing"
        : input.status === "resolved"
          ? "report.resolve"
          : "report.reject",
    targetType: "report",
    targetId: input.reportId,
    reason: input.reason ?? null,
    metadata: { from: report.status, to: input.status },
  });
  return { ok: true };
}

/** 管理者による非公開化・解除(§7.1)。既存 Attempt は任意で中断する */
export async function setBookHiddenByAdmin(input: {
  bookId: string;
  adminUserId: string;
  hidden: boolean;
  stopExistingAttempts?: boolean;
  reason?: string | null;
}): Promise<SimpleResult & { abandonedAttempts?: number }> {
  const book = await db.book.findUnique({
    where: { id: input.bookId },
    select: { id: true, deletedAt: true, hiddenByAdmin: true, title: true },
  });
  if (!book || book.deletedAt) return { ok: false, reason: "not_found" };

  await db.book.update({
    where: { id: input.bookId },
    data: { hiddenByAdmin: input.hidden },
  });

  let abandonedAttempts = 0;
  if (input.hidden && input.stopExistingAttempts) {
    const result = await db.attempt.updateMany({
      where: { bookId: input.bookId, status: "in_progress" },
      data: { status: "abandoned", finishedAt: new Date() },
    });
    abandonedAttempts = result.count;
  }

  await logAdminAction({
    adminUserId: input.adminUserId,
    action: input.hidden ? "book.hide" : "book.unhide",
    targetType: "book",
    targetId: input.bookId,
    reason: input.reason ?? null,
    metadata: {
      title: book.title,
      stopExistingAttempts: Boolean(input.stopExistingAttempts),
      abandonedAttempts,
    },
  });
  return { ok: true, abandonedAttempts };
}

/** ユーザー停止・解除(§6.1)。停止時は既存セッションをすべて失効させる */
export async function setUserSuspended(input: {
  userId: string;
  adminUserId: string;
  suspended: boolean;
  reason?: string | null;
}): Promise<SimpleResult> {
  if (input.userId === input.adminUserId) return { ok: false, reason: "forbidden" };

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, deletedAt: true, suspendedAt: true, loginId: true },
  });
  if (!user || user.deletedAt) return { ok: false, reason: "not_found" };
  if (user.role === "admin") return { ok: false, reason: "forbidden" };

  await db.user.update({
    where: { id: input.userId },
    data: { suspendedAt: input.suspended ? new Date() : null },
  });
  if (input.suspended) {
    await db.session.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await logAdminAction({
    adminUserId: input.adminUserId,
    action: input.suspended ? "user.suspend" : "user.unsuspend",
    targetType: "user",
    targetId: input.userId,
    reason: input.reason ?? null,
    metadata: { loginId: user.loginId },
  });
  return { ok: true };
}

/** API 用の管理者ゲート。401/403 をそのまま返せる形にする */
export async function gateAdmin(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: fail("unauthorized", "ログインが必要です") };
  if (user.role !== "admin") return { ok: false, response: fail("forbidden", "管理者のみ実行できます") };
  return { ok: true, user };
}

export type AdminReport = {
  id: string;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  book: { id: string; title: string; visibility: string; hiddenByAdmin: boolean; deletedAt: string | null };
  reporter: { loginId: string; name: string };
  owner: { id: string; loginId: string; name: string; suspendedAt: string | null };
};

export async function listReports(input: {
  status?: "open" | "reviewing" | "resolved" | "rejected" | "all";
  limit?: number;
}): Promise<AdminReport[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const rows = await db.report.findMany({
    where: input.status && input.status !== "all" ? { status: input.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      reporter: { select: { loginId: true, name: true } },
      book: {
        select: {
          id: true,
          title: true,
          visibility: true,
          hiddenByAdmin: true,
          deletedAt: true,
          owner: { select: { id: true, loginId: true, name: true, suspendedAt: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    book: {
      id: r.book.id,
      title: r.book.title,
      visibility: r.book.visibility,
      hiddenByAdmin: r.book.hiddenByAdmin,
      deletedAt: r.book.deletedAt?.toISOString() ?? null,
    },
    reporter: {
      loginId: r.reporter.loginId ?? "(削除済み)",
      name: r.reporter.name,
    },
    owner: {
      id: r.book.owner.id,
      loginId: r.book.owner.loginId ?? "(削除済み)",
      name: r.book.owner.name,
      suspendedAt: r.book.owner.suspendedAt?.toISOString() ?? null,
    },
  }));
}

export type AdminAuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
  admin: { loginId: string; name: string };
};

export async function listAuditLog(limit = 50): Promise<AdminAuditEntry[]> {
  const rows = await db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    include: { adminUser: { select: { loginId: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
    admin: { loginId: r.adminUser.loginId ?? "(削除済み)", name: r.adminUser.name },
  }));
}

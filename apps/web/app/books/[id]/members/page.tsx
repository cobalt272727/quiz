import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/members";
import { bookRole } from "@/lib/access";
import { MemberPanel } from "@/components/MemberPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "共同編集" };

/** メンバー管理(所有者のみ操作可。§7.2) */
export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/books/${id}/members`);

  const [book, members, role] = await Promise.all([
    db.book.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true, visibility: true } }),
    listMembers(id, user.id),
    bookRole(id, user.id),
  ]);
  if (!book || !members.ok) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <Link href={`/books/new?book=${book.id}`} className="underline">
          {book.title}
        </Link>
        {" / "}共同編集
      </p>
      <h1 className="mt-1 text-2xl font-bold">共同編集</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">
        ログイン ID で招待します。<strong>編集可</strong> は保存・画像・履歴、<strong>閲覧のみ</strong>
        は閲覧・受験だけができます。公開範囲が「招待」のブックはメンバーだけが開けます。
      </p>
      <MemberPanel bookId={book.id} members={members.members} canManage={role === "owner"} />
      <p className="mt-6 text-sm">
        <Link href={`/books/new?book=${book.id}`} className="underline">
          エディタへ戻る
        </Link>
      </p>
    </div>
  );
}

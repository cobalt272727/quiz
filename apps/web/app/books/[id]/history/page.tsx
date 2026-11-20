import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listBookVersions } from "@/lib/versions";
import { db } from "@/lib/db";
import { VersionList } from "@/components/VersionList";

export const dynamic = "force-dynamic";

export const metadata = { title: "保存履歴" };

/** 保存履歴と復元(owner / editor。§3.3) */
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/books/${(await params).id}/history`);

  const { id } = await params;
  const [book, versions] = await Promise.all([
    db.book.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, version: true },
    }),
    listBookVersions(id, user.id),
  ]);
  if (!book || !versions.ok) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <Link href={`/books/new?book=${book.id}`} className="underline">
          {book.title}
        </Link>
        {" / "}保存履歴
      </p>
      <h1 className="mt-1 text-2xl font-bold">保存履歴</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">
        現在の版は v{book.version}。過去の版を選ぶと、その内容を<strong>新しい版として</strong>
        保存します(履歴は消えません)。
      </p>
      <VersionList bookId={book.id} currentVersion={book.version} versions={versions.versions} />
    </div>
  );
}

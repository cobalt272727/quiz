import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBook } from "@/lib/library";
import { getCurrentUser } from "@/lib/auth";
import { StartAttemptButton } from "@/components/StartAttemptButton";
import { ReportButton } from "@/components/ReportButton";
import { ForkButton } from "@/components/ForkButton";
import { BookmarkButton } from "@/components/BookmarkButton";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 共有リンクのカード表示(§3.5, §8)。
 *
 * ブックのタイトル・説明・設問数をそのまま出し、URL は正規の `/b/{id}` を指す。
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const book = await getPublicBook(id);
  if (!book) {
    return { title: "ブックが見つかりません", robots: { index: false } };
  }
  const description =
    book.description?.trim() ||
    `${book.ownerName} さんの公開ブック。全 ${book.questionCount} 問をその場で受験できます。`;
  return {
    title: book.title,
    description,
    alternates: { canonical: `/b/${book.id}` },
    openGraph: {
      type: "article",
      title: book.title,
      description,
      url: `/b/${book.id}`,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: book.title }],
    },
    twitter: { card: "summary_large_image", title: book.title, description },
  };
}

export default async function PublicBookPage({ params }: Params) {
  const { id } = await params;
  const book = await getPublicBook(id);
  if (!book) notFound();
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="text-xs font-medium text-blue-600 dark:text-blue-400">公開ブック</p>
      <h1 className="mt-1 text-2xl font-bold">{book.title}</h1>
      {book.description && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
      )}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex gap-1">
          <dt>設問</dt>
          <dd className="tabular-nums">{book.questionCount} 件</dd>
        </div>
        <div className="flex gap-1">
          <dt>作者</dt>
          <dd>{book.ownerName}</dd>
        </div>
        <div className="flex gap-1">
          <dt>更新</dt>
          <dd>{book.updatedAt.toLocaleDateString("ja-JP")}</dd>
        </div>
      </dl>
      {book.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {book.tags.map((tag) => (
            <Link
              key={tag}
              href={`/browse?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-start gap-4">
        <StartAttemptButton bookId={book.id} practiceFeedback={book.practiceFeedback} />
        <ForkButton bookId={book.id} signedIn={Boolean(user)} allowed={book.allowFork} />
        {user && <BookmarkButton bookId={book.id} />}
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        受験にはログイン不要です。結果はこのブラウザの受験として保存されます。
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/browse" className="underline">
          公開ライブラリへ戻る
        </Link>
        <ReportButton bookId={book.id} signedIn={Boolean(user)} />
      </div>
    </div>
  );
}

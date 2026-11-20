import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBookByToken } from "@/lib/share";
import { StartAttemptButton } from "@/components/StartAttemptButton";

export const dynamic = "force-dynamic";
// 共有リンクは検索結果に出さない。カード表示のためタイトルだけは載せる(§8)
export const metadata = {
  title: "共有ブック",
  robots: { index: false, follow: false },
  openGraph: { type: "article" as const, title: "共有ブック", images: [{ url: "/og.png" }] },
};

export default async function SharedBookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const book = await resolveBookByToken(token);
  if (!book) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">共有リンク</p>
      <h1 className="mt-1 text-2xl font-bold">{book.title}</h1>
      {book.description && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
      )}
      <div className="mt-8">
        <StartAttemptButton bookId={book.id} shareToken={token} />
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        このリンクを知っている人だけが閲覧・受験できます。ログインは不要です。
      </p>
      <p className="mt-6 text-sm">
        <Link href="/" className="underline">
          トップへ
        </Link>
      </p>
    </div>
  );
}

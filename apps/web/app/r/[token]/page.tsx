import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveResultShare } from "@/lib/share";

export const dynamic = "force-dynamic";
export const metadata = { title: "結果共有", robots: { index: false } };

export default async function SharedResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await resolveResultShare(token);
  if (!shared) notFound();

  const percent = (() => {
    const score = Number(shared.attempt.score);
    const max = Number(shared.attempt.maxScore);
    if (!(max > 0)) return 0;
    return Math.round((score / max) * 100);
  })();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">結果共有(点数のみ)</p>
      <h1 className="mt-1 text-xl font-bold">{shared.book.title}</h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-500 dark:text-slate-400">得点</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">
          {shared.attempt.score}
          <span className="ml-1 text-lg font-normal text-slate-500 dark:text-slate-400">
            / {shared.attempt.maxScore}
          </span>
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{percent}%</p>
        {shared.attempt.finishedAt && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {shared.attempt.finishedAt.toLocaleString("ja-JP")}
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        このリンクは {shared.share.expiresAt.toLocaleDateString("ja-JP")} まで有効です。
        共有されたのは点数だけで、解答内容や正解は含まれません。
      </p>

      <p className="mt-8 text-center text-sm">
        <Link href="/browse" className="underline">
          公開ライブラリを見る
        </Link>
      </p>
    </div>
  );
}

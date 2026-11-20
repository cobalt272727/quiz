import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listOwnBooks, listSharedBooks } from "@/lib/books";
import { listBookmarks, listMyAttempts, myStats } from "@/lib/learning";
import { BookmarkButton } from "@/components/BookmarkButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "学習ダッシュボード" };

const STATUS_LABEL: Record<string, string> = {
  in_progress: "受験中",
  submitted: "提出済み",
  expired: "期限切れ",
  abandoned: "中断",
};

const MODE_LABEL: Record<string, string> = { practice: "練習", exam: "本番", review: "復習" };

/** 学習ダッシュボード(§2 `/dashboard`): 履歴・統計・ブックマーク・共有されたブック */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const [own, shared, attempts, stats, bookmarks] = await Promise.all([
    listOwnBooks(user.id),
    listSharedBooks(user.id),
    listMyAttempts(user.id, { limit: 20 }),
    myStats(user.id),
    listBookmarks(user.id),
  ]);

  const maxDay = Math.max(1, ...stats.recentDays.map((d) => d.count));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">学習ダッシュボード</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {user.name || user.loginId} さんの受験履歴と学習の進み具合
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "受験回数", value: String(stats.attempts) },
          { label: "採点済み", value: String(stats.finished) },
          { label: "平均正答率", value: stats.averageRate === null ? "—" : `${stats.averageRate}%` },
          { label: "最高正答率", value: stats.bestRate === null ? "—" : `${stats.bestRate}%` },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="mb-3 text-sm font-semibold">直近 30 日の受験</h2>
        <div className="flex h-20 items-end gap-1">
          {stats.recentDays.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} 回`}
              className="flex-1 rounded-t bg-blue-500/70"
              style={{ height: `${Math.max(3, (day.count / maxDay) * 100)}%` }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {stats.recentDays[0]?.date} 〜 {stats.recentDays.at(-1)?.date}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">最近の受験</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            まだ受験がありません。
            <Link href="/browse" className="ml-1 underline">
              公開ライブラリ
            </Link>
            から探してみてください。
          </p>
        ) : (
          <ul className="space-y-2">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
              >
                <span className="font-medium">{attempt.bookTitle}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                  {MODE_LABEL[attempt.mode] ?? attempt.mode}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {STATUS_LABEL[attempt.status] ?? attempt.status}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(attempt.startedAt).toLocaleString("ja-JP")}
                </span>
                <span className="ml-auto tabular-nums">
                  {attempt.score} / {attempt.maxScore}
                  {attempt.scoreRate !== null && (
                    <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                      ({attempt.scoreRate}%)
                    </span>
                  )}
                </span>
                <Link
                  href={
                    attempt.status === "submitted" || attempt.status === "expired"
                      ? `/attempt/${attempt.id}/result`
                      : `/attempt/${attempt.id}`
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {attempt.status === "in_progress" ? "再開" : "結果を見る"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">ブックマーク</h2>
        {bookmarks.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ブックマークはまだありません。ブックのページから追加できます。
          </p>
        ) : (
          <ul className="space-y-2">
            {bookmarks.map((bookmark) => (
              <li
                key={bookmark.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
              >
                <Link href={`/b/${bookmark.bookId}`} className="underline">
                  {bookmark.bookTitle}
                </Link>
                {bookmark.questionId && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    設問 {bookmark.questionId.slice(0, 6)}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {new Date(bookmark.createdAt).toLocaleDateString("ja-JP")}
                </span>
                <BookmarkButton bookId={bookmark.bookId} questionId={bookmark.questionId} bookmarked />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">共有されたブック</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">共同編集の招待はありません。</p>
        ) : (
          <ul className="space-y-2">
            {shared.map((book) => (
              <li
                key={book.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
              >
                <span className="font-medium">{book.title}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                  {book.role === "editor" ? "編集可" : "閲覧のみ"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  所有者 {book.ownerName}
                </span>
                <Link
                  href={book.role === "editor" ? `/books/new?book=${book.id}` : `/b/${book.id}`}
                  className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {book.role === "editor" ? "編集" : "開く"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">マイブック</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          作成・編集は <Link href="/library" className="underline">マイブック</Link> から。
          {own.length > 0 && `(${own.length} 件)`}
        </p>
      </section>
    </div>
  );
}

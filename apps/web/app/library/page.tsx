import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listOwnBooks, listSharedBooks } from "@/lib/books";
import { BookActions } from "@/components/BookActions";
import { NewBookButton } from "@/components/NewBookButton";

export const dynamic = "force-dynamic";

const VISIBILITY_LABEL: Record<string, string> = {
  private: "非公開",
  link: "リンク限定",
  public: "公開",
  invite: "招待のみ",
};

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/library");
  const [books, shared] = await Promise.all([listOwnBooks(user.id), listSharedBooks(user.id)]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">マイブック</h1>
        <NewBookButton />
      </div>

      {books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-300">まだブックがありません。</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            「新規ブックを作成」から書きはじめられます。記法はエディタの「サンプル」ボタンで確認できます。
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {books.map((book) => (
            <li
              key={book.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-lg font-semibold">{book.title}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {VISIBILITY_LABEL[book.visibility] ?? book.visibility}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  設問 {book.questionCount} 件 / v{book.version}
                </span>
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  更新 {book.updatedAt.toLocaleString("ja-JP")}
                </span>
              </div>
              {book.description && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
              )}
              <div className="mt-3">
                <BookActions
                  bookId={book.id}
                  version={book.version}
                  visibility={book.visibility}
                  allowFork={book.allowFork}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/books/new" className="underline">
          ローカル編集(ログイン不要)
        </Link>
        も使えます。ブックと解答はこのブラウザにだけ保存されます。
      </p>
    </div>
  );
}

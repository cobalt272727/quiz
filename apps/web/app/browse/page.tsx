import Link from "next/link";
import { BookCard } from "@/components/BookCard";
import { popularTags, searchPublicBooks } from "@/lib/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "公開ライブラリ" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; cursor?: string }>;
}) {
  const { q, tag, cursor } = await searchParams;
  const [page, tags] = await Promise.all([
    searchPublicBooks({
      ...(q ? { q } : {}),
      ...(tag ? { tag } : {}),
      ...(cursor ? { cursor } : {}),
    }),
    popularTags(),
  ]);

  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    const s = params.toString();
    return s ? `/browse?${s}` : "/browse";
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">公開ライブラリ</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        公開されているブックは、ログインしなくても受験できます。
      </p>

      <form action="/browse" method="get" className="mt-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="タイトル・説明・タグで検索"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          検索
        </button>
      </form>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400">タグ:</span>
          {tag && (
            <Link
              href={query({})}
              className="rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700"
            >
              すべて
            </Link>
          )}
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={query({ tag: t.tag })}
              className={`rounded-full px-2 py-0.5 text-xs ${
                tag === t.tag
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              #{t.tag} <span className="opacity-60">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      {page.items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {q || tag ? "条件に合うブックがありません。" : "まだ公開ブックがありません。"}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {page.items.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </ul>
      )}

      {page.nextCursor && (
        <Link
          href={query({ cursor: page.nextCursor })}
          className="mt-6 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        >
          次のページ
        </Link>
      )}
    </div>
  );
}

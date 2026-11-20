import Link from "next/link";
import type { PublicBookCard } from "@/lib/library";

export function BookCard({ book }: { book: PublicBookCard }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline gap-2">
        <Link href={`/b/${book.id}`} className="text-base font-semibold hover:underline">
          {book.title}
        </Link>
        <span className="text-xs text-slate-500 dark:text-slate-400">設問 {book.questionCount} 件</span>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {book.ownerName} / {book.updatedAt.toLocaleDateString("ja-JP")}
        </span>
      </div>
      {book.description && (
        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
      )}
      {book.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {book.tags.map((tag) => (
            <Link
              key={tag}
              href={`/browse?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

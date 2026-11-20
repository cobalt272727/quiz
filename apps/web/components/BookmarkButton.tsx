"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** ブック / 設問のブックマーク(§7.1 `/me/bookmarks`) */
export function BookmarkButton({
  bookId,
  questionId = null,
  bookmarked = false,
}: {
  bookId: string;
  questionId?: string | null;
  bookmarked?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(bookmarked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/bookmarks", {
        method: on ? "DELETE" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId, questionId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "操作できませんでした");
        return;
      }
      setOn(!on);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
        className={`rounded-lg border px-3 py-1 text-xs transition disabled:opacity-50 ${
          on
            ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
      >
        {on ? "★ ブックマーク済み" : "☆ ブックマーク"}
      </button>
      {error && <span className="text-xs text-rose-700 dark:text-rose-300">{error}</span>}
    </span>
  );
}

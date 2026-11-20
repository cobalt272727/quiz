"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** フォーク(§3.5)。ログインが必要 */
export function ForkButton({
  bookId,
  signedIn,
  allowed,
}: {
  bookId: string;
  signedIn: boolean;
  allowed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return null;

  const fork = async () => {
    if (!signedIn) {
      router.push(`/login?next=/b/${bookId}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/fork`, { method: "POST" });
      const data = (await res.json()) as { book?: { id: string }; error?: { message?: string } };
      if (!res.ok || !data.book) {
        setError(data.error?.message ?? "フォークできませんでした");
        return;
      }
      router.push(`/books/new?book=${data.book.id}`);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void fork()}
        disabled={busy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {busy ? "複製中…" : "フォークして編集"}
      </button>
      {error && <span className="text-xs text-rose-700 dark:text-rose-300">{error}</span>}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BLANK_BOOK_SOURCE } from "@/lib/sample";

export function NewBookButton({ source = BLANK_BOOK_SOURCE }: { source?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, visibility: "private" }),
      });
      const data = (await res.json()) as {
        book?: { id: string };
        error?: { message?: string; details?: unknown };
      };
      if (!res.ok || !data.book) {
        setError(data.error?.message ?? "作成できませんでした");
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
        onClick={create}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? "作成中…" : "新規ブックを作成"}
      </button>
      {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
    </span>
  );
}

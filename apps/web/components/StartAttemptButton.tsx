"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 公開・共有リンク経由の受験開始(ゲストでも可) */
export function StartAttemptButton({
  bookId,
  shareToken,
  label = "このブックを受験する",
}: {
  bookId: string;
  shareToken?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "practice", ...(shareToken ? { shareToken } : {}) }),
      });
      const data = (await res.json()) as { attemptId?: string; error?: { message?: string } };
      if (!res.ok || !data.attemptId) {
        setError(data.error?.message ?? "受験を開始できませんでした");
        return;
      }
      router.push(`/attempt/${data.attemptId}`);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? "開始中…" : label}
      </button>
      {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
    </span>
  );
}

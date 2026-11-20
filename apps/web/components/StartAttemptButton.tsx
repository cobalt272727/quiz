"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "practice" | "exam";

/** 公開・共有リンク経由の受験開始(ゲストでも可)。練習/本番を選べる */
export function StartAttemptButton({
  bookId,
  shareToken,
  practiceFeedback = false,
  reviewOnly,
  defaultMode = "practice",
}: {
  bookId: string;
  shareToken?: string;
  /** ブックの practiceFeedback。練習モードの説明にだけ使う */
  practiceFeedback?: boolean;
  /** 指定すると、その設問だけの復習受験を開始する(結果画面用) */
  reviewOnly?: string[];
  defaultMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReview = reviewOnly !== undefined;
  const reviewCount = reviewOnly?.length ?? 0;

  const start = async () => {
    if (isReview && reviewCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = isReview
        ? {
            mode: "review",
            reviewOnly,
            ...(shareToken ? { shareToken } : {}),
          }
        : { mode, ...(shareToken ? { shareToken } : {}) };
      const res = await fetch(`/api/books/${bookId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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

  if (isReview) {
    if (reviewCount === 0) return null;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {busy ? "開始中…" : `間違えた ${reviewCount} 問を復習する`}
        </button>
        {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
      </span>
    );
  }

  const modeButtonClass = (value: Mode) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      mode === value
        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
    }`;

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div
        className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
        role="group"
        aria-label="受験モード"
      >
        <button
          type="button"
          aria-pressed={mode === "practice"}
          onClick={() => setMode("practice")}
          className={modeButtonClass("practice")}
        >
          練習モード
        </button>
        <button
          type="button"
          aria-pressed={mode === "exam"}
          onClick={() => setMode("exam")}
          className={modeButtonClass("exam")}
        >
          本番モード
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {mode === "practice"
          ? practiceFeedback
            ? "各設問で答え合わせができます。"
            : "このブックは即時採点が無効です。提出後に採点します。"
          : "答え合わせはできません。提出後にまとめて採点します。"}
      </p>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {busy
            ? "開始中…"
            : mode === "practice"
              ? "練習モードで受験する"
              : "本番モードで受験する"}
        </button>
        {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
      </span>
    </div>
  );
}

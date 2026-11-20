"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Version = {
  version: number;
  createdAt: string;
  title: string;
  questionCount: number;
};

/** 保存履歴の一覧と復元(§7.1 `/books/:id/versions/:version/restore`) */
export function VersionList({
  bookId,
  currentVersion,
  versions,
}: {
  bookId: string;
  currentVersion: number;
  versions: Version[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const restore = async (version: number) => {
    if (
      !window.confirm(
        `v${version} の内容を新しい版として復元します。現在の版(v${currentVersion})は履歴に残ります。よろしいですか?`,
      )
    ) {
      return;
    }
    setBusy(version);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/books/${bookId}/versions/${version}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: currentVersion }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        book?: { version: number };
        error?: { message?: string };
      };
      if (!res.ok || !data.book) {
        setError(data.error?.message ?? "復元できませんでした");
        return;
      }
      setDone(data.book.version);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          v{done} として復元しました。
        </p>
      )}
      <ul className="space-y-2">
        {versions.map((version) => (
          <li
            key={version.version}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
          >
            <span className="font-mono font-semibold">v{version.version}</span>
            {version.version === currentVersion && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                現在
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{version.title}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">設問 {version.questionCount} 件</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(version.createdAt).toLocaleString("ja-JP")}
            </span>
            <button
              type="button"
              onClick={() => void restore(version.version)}
              disabled={busy !== null || version.version === currentVersion}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {busy === version.version ? "復元中…" : "この版を復元"}
            </button>
          </li>
        ))}
      </ul>
      {versions.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">保存履歴がまだありません。</p>
      )}
    </div>
  );
}

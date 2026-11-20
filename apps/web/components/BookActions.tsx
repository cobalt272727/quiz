"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BookActions({
  bookId,
  version,
  visibility,
  allowFork: initialAllowFork = false,
}: {
  bookId: string;
  version: number;
  visibility: string;
  allowFork?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [allowFork, setAllowFork] = useState(initialAllowFork);
  const [mode, setMode] = useState<"practice" | "exam">("practice");

  const play = async () => {
    setBusy("play");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
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
      setBusy(null);
    }
  };

  const changeVisibility = async (next: string) => {
    const becomingPublic = (next === "public" || next === "link") && visibility === "private";
    if (becomingPublic) {
      const agreed = window.confirm(
        "公開すると誰でも閲覧・受験できます。他人の著作物や権利を侵害する内容を含んでいないことを確認してください。よろしいですか?",
      );
      if (!agreed) return;
    }
    setBusy("visibility");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/share`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visibility: next,
          // public / link へ変更するときは著作権確認を送る(§7.1)
          ...(becomingPublic ? { copyrightConsent: true } : {}),
          ...(next === "link" ? { regenerateToken: true } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "変更に失敗しました");
        return;
      }
      if (data.token) setShareUrl(`${window.location.origin}/s/${data.token}`);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  /** 既存の受験も中断する(§7.8) */
  const changeAllowFork = async (next: boolean) => {
    setBusy("fork");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/share`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowFork: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "変更に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/books/${bookId}/share`, { method: "POST" });
      const data = (await res.json()) as { path?: string; error?: { message?: string } };
      if (!res.ok || !data.path) {
        setError(data.error?.message ?? "共有リンクを発行できませんでした");
        return;
      }
      setShareUrl(`${window.location.origin}${data.path}`);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const revokeShare = async () => {
    setBusy("share");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/share`, { method: "DELETE" });
      if (!res.ok) {
        setError("共有リンクを失効できませんでした");
        return;
      }
      setShareUrl(null);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("このブックを削除しますか?(30 日後に完全削除されます)")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("削除に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={mode}
        onChange={(event) => setMode(event.target.value as "practice" | "exam")}
        disabled={busy !== null}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
        aria-label="受験モード"
      >
        <option value="practice">練習</option>
        <option value="exam">本番</option>
      </select>
      <button
        type="button"
        onClick={play}
        disabled={busy !== null}
        className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {busy === "play" ? "開始中…" : mode === "practice" ? "練習で受験" : "本番で受験"}
      </button>
      <a
        href={`/books/new?book=${bookId}`}
        className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        編集
      </a>
      <select
        value={visibility}
        onChange={(e) => void changeVisibility(e.target.value)}
        disabled={busy !== null}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
        aria-label="公開範囲"
      >
        <option value="private">非公開</option>
        <option value="link">リンク限定</option>
        <option value="public">公開</option>
        <option value="invite">招待のみ</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={allowFork}
          onChange={(event) => {
            setAllowFork(event.target.checked);
            void changeAllowFork(event.target.checked);
          }}
          disabled={busy !== null}
        />
        フォーク許可
      </label>
      <a
        href={`/books/${bookId}/history`}
        className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        履歴
      </a>
      <a
        href={`/books/${bookId}/members`}
        className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        共同編集
      </a>
      <a
        href={`/api/books/${bookId}/export?format=zip`}
        className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        ZIP
      </a>
      {visibility === "link" && (
        <button
          type="button"
          onClick={() => void share()}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {busy === "share" ? "発行中…" : "共有リンク"}
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={busy !== null}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
      >
        削除
      </button>
      {error && <span className="text-rose-700 dark:text-rose-300">{error}</span>}

      {shareUrl && (
        <div className="mt-2 w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-medium">共有リンク(この画面でのみ表示されます)</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all">{shareUrl}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(shareUrl);
                setCopied(true);
              }}
              className="rounded border border-amber-400 px-2 py-0.5"
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
            <button type="button" onClick={() => void revokeShare()} className="rounded border border-amber-400 px-2 py-0.5">
              失効
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

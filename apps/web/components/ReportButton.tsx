"use client";

import { useState } from "react";

/** 通報(§7.1)。ログイン中のユーザーのみ送信できる */
export function ReportButton({
  bookId,
  signedIn,
}: {
  bookId: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (res.status === 201) {
        setMessage("通報を受け付けました。ご協力ありがとうございます。");
        setReason("");
        setOpen(false);
      } else {
        setMessage(data.error?.message ?? `送信できませんでした (${res.status})`);
      }
    } catch {
      setMessage("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        通報するには <a href="/login" className="underline">ログイン</a> が必要です。
      </p>
    );
  }

  return (
    <div className="text-xs">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
        >
          このブックを通報する
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="権利侵害・不適切な内容など、通報の理由を書いてください"
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !reason.trim()}
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "送信中…" : "通報を送信"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
            >
              やめる
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-slate-600 dark:text-slate-300">{message}</p>}
    </div>
  );
}

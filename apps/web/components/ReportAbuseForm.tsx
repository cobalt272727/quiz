"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * 通報フォーム(§3.5, §8)。
 *
 * ブックの URL(`/b/<id>`)または ID を貼り付けて通報する。
 * 送信にはログインが必要(匿名の連投を避けるため)。
 */
export function ReportAbuseForm({ signedIn }: { signedIn: boolean }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const bookId = (() => {
    const value = target.trim();
    if (!value) return "";
    const match = /\/b\/([A-Za-z0-9_-]{6,64})/.exec(value);
    if (match) return match[1]!;
    return /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : "";
  })();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!bookId) {
      setError("ブックの URL(…/b/xxxx)またはブック ID を入力してください");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId, reason }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "通報を送信できませんでした");
        return;
      }
      setDone(true);
      setTarget("");
      setReason("");
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        通報の送信にはログインが必要です。
        <Link href="/login?next=/report-abuse" className="mx-1 underline">
          ログイン
        </Link>
        してください(通報者を他の利用者に知らせることはありません)。
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          通報を受け付けました。内容を確認のうえ対応します。
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        >
          続けて通報する
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">対象のブック</span>
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          required
          placeholder="https://example.com/b/xxxxxxxx または xxxxxxxx"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          公開ブックのページ URL をそのまま貼り付けられます。
        </span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">内容</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={1000}
          rows={6}
          placeholder="著作権侵害、わいせつ、なりすまし、誤りの多い問題など、確認に必要な情報を書いてください。"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {reason.length} / 1000
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
      >
        {busy ? "送信中…" : "通報を送信"}
      </button>
    </form>
  );
}

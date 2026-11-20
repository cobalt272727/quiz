"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** リカバリーコードによるパスワード再設定(§7.1) */
export function RecoverForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("新しいパスワードが一致しません");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, code, newPassword }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "再設定できませんでした");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        パスワードを再設定しました。すべての端末でログインし直してください。ログイン画面へ移動します…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">ログイン ID</span>
        <input
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          autoComplete="username"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">リカバリーコード</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          spellCheck={false}
          placeholder="ABCD-EFGH-IJKL"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono uppercase dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">新しいパスワード</span>
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">8 文字以上</span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">新しいパスワード(確認)</span>
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? "処理中…" : "パスワードを再設定"}
      </button>
    </form>
  );
}

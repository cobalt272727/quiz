"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecoveryCodes } from "./RecoveryCodes";

type Mode = "login" | "register";

export function AuthForm({ next = "/library" }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 登録直後はリカバリーコードを表示し、保存を確認してから先に進む(§3.4)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loginId,
          password,
          ...(mode === "register" && name.trim() ? { name: name.trim() } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        recoveryCodes?: string[];
      };
      if (!res.ok) {
        setError(data.error?.message ?? "失敗しました");
        return;
      }
      if (mode === "register" && data.recoveryCodes?.length) {
        setRecoveryCodes(data.recoveryCodes);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCodes) {
    return (
      <RecoveryCodes
        codes={recoveryCodes}
        doneLabel="保存してはじめる"
        onDone={() => {
          router.push(next);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
              mode === m
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {m === "login" ? "ログイン" : "新規登録"}
          </button>
        ))}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">ID</span>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          required
          minLength={3}
          maxLength={40}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          placeholder="半角英数字と _ . -"
        />
      </label>

      {mode === "register" && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">表示名(任意)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">パスワード</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          maxLength={200}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        {mode === "register" && (
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">8 文字以上</span>
        )}
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
        {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録してはじめる"}
      </button>

      {mode === "login" && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          パスワードを忘れた場合は{" "}
          <Link href="/recover" className="underline">
            リカバリーコードで再設定
          </Link>
        </p>
      )}
    </form>
  );
}

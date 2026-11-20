"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecoveryCodes } from "./RecoveryCodes";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const button =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60";
const subtleButton =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function SettingsClient({
  loginId,
  name,
  mustChangePassword,
  remainingCodes,
  totalCodes,
}: {
  loginId: string;
  name: string;
  mustChangePassword: boolean;
  remainingCodes: number;
  totalCodes: number;
}) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(name);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<Notice>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteNotice, setDeleteNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: displayName }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setProfileNotice({ kind: "error", text: data.error?.message ?? "保存できませんでした" });
        return;
      }
      setProfileNotice({ kind: "ok", text: "表示名を更新しました" });
      router.refresh();
    } catch {
      setProfileNotice({ kind: "error", text: "通信に失敗しました" });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ kind: "error", text: "新しいパスワードが一致しません" });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setPasswordNotice({ kind: "error", text: data.error?.message ?? "変更できませんでした" });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({
        kind: "ok",
        text: "パスワードを変更しました。他の端末のセッションは失効しました",
      });
      router.refresh();
    } catch {
      setPasswordNotice({ kind: "error", text: "通信に失敗しました" });
    } finally {
      setSavingPassword(false);
    }
  };

  const regenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryNotice(null);
    setRegenerating(true);
    try {
      const res = await fetch("/api/me/recovery-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: recoveryPassword }),
      });
      const data = (await res.json()) as { error?: { message?: string }; recoveryCodes?: string[] };
      if (!res.ok || !data.recoveryCodes) {
        setRecoveryNotice({ kind: "error", text: data.error?.message ?? "再発行できませんでした" });
        return;
      }
      setCodes(data.recoveryCodes);
      setRecoveryPassword("");
      setRecoveryNotice({ kind: "ok", text: "再発行しました。古いコードはすべて無効です" });
      router.refresh();
    } catch {
      setRecoveryNotice({ kind: "error", text: "通信に失敗しました" });
    } finally {
      setRegenerating(false);
    }
  };

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteNotice(null);
    if (deleteConfirm !== loginId) {
      setDeleteNotice({ kind: "error", text: "確認のためログイン ID を入力してください" });
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setDeleteNotice({ kind: "error", text: data.error?.message ?? "削除できませんでした" });
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setDeleteNotice({ kind: "error", text: "通信に失敗しました" });
    } finally {
      setDeleting(false);
    }
  };

  const NoticeLine = ({ notice }: { notice: Notice }) =>
    notice ? (
      <p
        className={`rounded-lg px-3 py-2 text-sm ${
          notice.kind === "ok"
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        }`}
      >
        {notice.text}
      </p>
    ) : null;

  return (
    <div className="space-y-8">
      {mustChangePassword && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          一時パスワードでログインしています。下の「パスワード変更」で新しいパスワードを設定してください。
          設定するまでブックの作成・保存はできません。
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">プロフィール</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">ログイン ID</span>
            <input value={loginId} readOnly disabled className={`${input} opacity-70`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">表示名</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={50}
              required
              className={input}
            />
          </label>
          <NoticeLine notice={profileNotice} />
          <button type="submit" disabled={savingProfile} className={button}>
            {savingProfile ? "保存中…" : "表示名を保存"}
          </button>
        </form>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-8 dark:border-slate-800">
        <h2 className="text-lg font-semibold">パスワード変更</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">現在のパスワード</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              className={input}
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
              className={input}
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">8 文字以上</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">
              新しいパスワード(確認)
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={200}
              className={input}
            />
          </label>
          <NoticeLine notice={passwordNotice} />
          <button type="submit" disabled={savingPassword} className={button}>
            {savingPassword ? "変更中…" : "パスワードを変更"}
          </button>
        </form>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-8 dark:border-slate-800">
        <h2 className="text-lg font-semibold">リカバリーコード</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          残り <span className="font-semibold tabular-nums">{remainingCodes}</span> / {totalCodes} 個。
          再発行すると、いまお持ちのコードはすべて使えなくなります。
        </p>
        {codes ? (
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} doneLabel="閉じる" />
        ) : (
          <form onSubmit={regenerate} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">
                確認のため現在のパスワードを入力
              </span>
              <input
                type="password"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
                autoComplete="current-password"
                required
                className={input}
              />
            </label>
            <NoticeLine notice={recoveryNotice} />
            <button type="submit" disabled={regenerating} className={subtleButton}>
              {regenerating ? "発行中…" : "リカバリーコードを再発行"}
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-8 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-rose-700 dark:text-rose-300">アカウント削除</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          作成したブックは削除され、受験結果は個人を特定できない形で統計にのみ残ります。
          この操作は取り消せません。
        </p>
        <form onSubmit={deleteAccount} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">パスワード</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              required
              className={input}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">
              確認のためログイン ID(<span className="font-mono">{loginId}</span>)を入力
            </span>
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              required
              className={input}
            />
          </label>
          <NoticeLine notice={deleteNotice} />
          <button
            type="submit"
            disabled={deleting}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {deleting ? "削除中…" : "アカウントを削除"}
          </button>
        </form>
      </section>
    </div>
  );
}

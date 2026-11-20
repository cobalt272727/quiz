"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  loginId: string;
  name: string;
  role: "editor" | "viewer";
  createdAt: string;
};

/** メンバー一覧・招待・権限変更(§7.1 `/books/:id/members`) */
export function MemberPanel({
  bookId,
  members,
  canManage,
}: {
  bookId: string;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (key: string, method: string, body: unknown) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/members`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? `失敗しました (${res.status})`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("通信に失敗しました");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!loginId.trim()) return;
    const ok = await send("invite", "POST", { loginId: loginId.trim(), role });
    if (ok) setLoginId("");
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">ログイン ID</span>
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="例: taro"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">権限</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "editor" | "viewer")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="editor">編集可</option>
              <option value="viewer">閲覧のみ</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void invite()}
            disabled={busy !== null || !loginId.trim()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy === "invite" ? "招待中…" : "招待する"}
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
          >
            <span className="font-medium">{member.name || member.loginId}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">@{member.loginId}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
              {member.role === "editor" ? "編集可" : "閲覧のみ"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(member.createdAt).toLocaleDateString("ja-JP")}
            </span>
            {canManage && (
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void send(`${member.userId}:role`, "PATCH", {
                      userId: member.userId,
                      role: member.role === "editor" ? "viewer" : "editor",
                    })
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {member.role === "editor" ? "閲覧のみにする" : "編集可にする"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send(`${member.userId}:remove`, "DELETE", { userId: member.userId })}
                  className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                >
                  解除
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {members.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">メンバーはまだいません。</p>
      )}
    </div>
  );
}

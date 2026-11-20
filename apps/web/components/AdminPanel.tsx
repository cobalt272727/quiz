"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAuditEntry, AdminReport } from "@/lib/admin";

const button =
  "rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";
const neutral = `${button} border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`;
const danger = `${button} border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950`;
const primary = `${button} border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950`;

const STATUS_LABEL: Record<AdminReport["status"], string> = {
  open: "未対応",
  reviewing: "対応中",
  resolved: "解決",
  rejected: "却下",
};

type Filter = "unresolved" | "closed" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "unresolved", label: "未処理" },
  { id: "closed", label: "解決・却下" },
  { id: "all", label: "すべて" },
];

const matches = (report: AdminReport, filter: Filter): boolean => {
  if (filter === "all") return true;
  const unresolved = report.status === "open" || report.status === "reviewing";
  return filter === "unresolved" ? unresolved : !unresolved;
};

/** 通報の処理・非公開化・ユーザー停止(§7.1 通報・管理) */
export function AdminPanel({
  reports,
  audit,
}: {
  reports: AdminReport[];
  audit: AdminAuditEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopAttempts, setStopAttempts] = useState(true);
  const [filter, setFilter] = useState<Filter>("unresolved");

  const send = async (key: string, path: string, method: string, body: unknown) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? `失敗しました (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (report: AdminReport, status: "reviewing" | "resolved" | "rejected") =>
    send(`${report.id}:${status}`, `/api/admin/reports/${report.id}`, "PATCH", { status });

  const setHidden = (report: AdminReport, hidden: boolean) =>
    send(`${report.book.id}:hide`, `/api/admin/books/${report.book.id}/hide`, "PATCH", {
      hiddenByAdmin: hidden,
      ...(hidden ? { stopExistingAttempts: stopAttempts } : {}),
    });

  const setSuspended = (report: AdminReport, suspended: boolean) =>
    send(`${report.owner.id}:suspend`, `/api/admin/users/${report.owner.id}/suspend`, "PATCH", {
      suspended,
    });

  const counts = {
    unresolved: reports.filter((r) => matches(r, "unresolved")).length,
    closed: reports.filter((r) => matches(r, "closed")).length,
    all: reports.length,
  };
  const visible = reports.filter((r) => matches(r, filter));

  return (
    <div className="space-y-8">
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={stopAttempts}
          onChange={(event) => setStopAttempts(event.target.checked)}
        />
        非公開化するとき、開始済みの受験も中断する
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">通報</h2>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={
                filter === f.id
                  ? "rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                  : "rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter === "unresolved"
              ? "未処理の通報はありません。"
              : "該当する通報はありません。"}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((report) => {
              const closed = report.status === "resolved" || report.status === "rejected";
              return (
                <li
                  key={report.id}
                  className={`rounded-xl border p-4 ${
                    closed
                      ? "border-slate-200 opacity-70 dark:border-slate-800"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                      {STATUS_LABEL[report.status]}
                    </span>
                    <span className="font-semibold">{report.book.title}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      作者 {report.owner.name || report.owner.loginId}
                      {report.owner.suspendedAt && " (停止中)"}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(report.createdAt).toLocaleString("ja-JP")}
                    </span>
                    {report.book.hiddenByAdmin && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        公開停止中
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                    {report.reason}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    通報者 {report.reporter.name || report.reporter.loginId}
                    {report.resolvedAt && ` / 処理 ${new Date(report.resolvedAt).toLocaleString("ja-JP")}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`/b/${report.book.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={neutral}
                    >
                      ブックを見る
                    </a>
                    {report.status !== "reviewing" && (
                      <button
                        type="button"
                        className={primary}
                        disabled={busy !== null}
                        onClick={() => setStatus(report, "reviewing")}
                      >
                        対応中にする
                      </button>
                    )}
                    {report.status !== "resolved" && (
                      <button
                        type="button"
                        className={neutral}
                        disabled={busy !== null}
                        onClick={() => setStatus(report, "resolved")}
                      >
                        解決
                      </button>
                    )}
                    {report.status !== "rejected" && (
                      <button
                        type="button"
                        className={neutral}
                        disabled={busy !== null}
                        onClick={() => setStatus(report, "rejected")}
                      >
                        却下
                      </button>
                    )}
                    <button
                      type="button"
                      className={danger}
                      disabled={busy !== null || report.book.hiddenByAdmin}
                      onClick={() => setHidden(report, true)}
                    >
                      非公開にする
                    </button>
                    {report.book.hiddenByAdmin && (
                      <button
                        type="button"
                        className={neutral}
                        disabled={busy !== null}
                        onClick={() => setHidden(report, false)}
                      >
                        非公開を解除
                      </button>
                    )}
                    <button
                      type="button"
                      className={report.owner.suspendedAt ? neutral : danger}
                      disabled={busy !== null}
                      onClick={() => setSuspended(report, !report.owner.suspendedAt)}
                    >
                      {report.owner.suspendedAt ? "停止を解除" : "作者を停止"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">操作ログ(最新 {audit.length} 件)</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">まだ操作はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">日時</th>
                  <th className="py-1 pr-3 font-medium">管理者</th>
                  <th className="py-1 pr-3 font-medium">操作</th>
                  <th className="py-1 pr-3 font-medium">対象</th>
                  <th className="py-1 font-medium">理由</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                      {new Date(entry.createdAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1 pr-3">{entry.admin.name || entry.admin.loginId}</td>
                    <td className="py-1 pr-3 font-mono">{entry.action}</td>
                    <td className="py-1 pr-3 font-mono">
                      {entry.targetType}:{entry.targetId.slice(0, 8)}
                    </td>
                    <td className="py-1">{entry.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

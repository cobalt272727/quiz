"use client";

import { useState } from "react";

/**
 * リカバリーコードの表示(§3.4)。
 *
 * 平文はこの画面でしか見られないため、保存したことの確認を必須にする。
 */
export function RecoveryCodes({
  codes,
  confirmRequired = true,
  onDone,
  doneLabel = "続ける",
}: {
  codes: string[];
  confirmRequired?: boolean;
  onDone?: () => void;
  doneLabel?: string;
}) {
  const [confirmed, setConfirmed] = useState(!confirmRequired);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-semibold">リカバリーコード(この画面でしか表示されません)</p>
        <p className="mt-1 text-xs">
          パスワードを忘れたときに使います。1 つにつき 1 回だけ有効です。人に見せない場所に保存してください。
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center dark:border-slate-700 dark:bg-slate-900"
          >
            {code}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {copied ? "コピーしました" : "すべてコピー"}
        </button>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([`リカバリーコード\n\n${codes.join("\n")}\n`], {
              type: "text/plain;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "recovery-codes.txt";
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          テキストで保存
        </button>
      </div>

      {confirmRequired && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>安全な場所に保存しました</span>
        </label>
      )}

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          disabled={!confirmed}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {doneLabel}
        </button>
      )}
    </div>
  );
}

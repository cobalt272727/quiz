"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Essay = { questionId: string; number: number };

/** essay の自己採点(終端状態の Attempt。§7.5) */
export function SelfGradeControls({
  attemptId,
  essays,
}: {
  attemptId: string;
  essays: Essay[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grade = async (questionId: string, selfGrade: "full" | "half" | "none") => {
    setBusy(`${questionId}:${selfGrade}`);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/self-grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, selfGrade }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "登録できませんでした");
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  if (essays.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
      <p className="mb-2 font-medium text-slate-600 dark:text-slate-300">記述式の自己採点</p>
      <ul className="space-y-1">
        {essays.map((essay) => (
          <li key={essay.questionId} className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">問 {essay.number}</span>
            {(
              [
                ["full", "◯ 正解"],
                ["half", "△ 部分点"],
                ["none", "✕ 不正解"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={busy !== null}
                onClick={() => void grade(essay.questionId, value)}
                className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {label}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { loadResult } from "@/lib/attempts";
import { currentActor } from "@/lib/guest";
import { AstView } from "@/components/AstView";
import { SelfGradeControls } from "@/components/SelfGradeControls";
import type { PublicBlock, PublicQuestion } from "@qb/parser";
import type { Reveal } from "@/lib/book";

export const dynamic = "force-dynamic";

export const metadata = { title: "結果・復習" };

/** 結果・復習画面(§7.9)。終端状態の Attempt のみ */
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  const loaded = await loadResult({ attemptId: id, actor });

  if (!loaded.ok) {
    if (loaded.reason === "not_finished") {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-16">
          <h1 className="text-2xl font-bold">まだ採点されていません</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            受験を提出すると、この画面で結果と解説を確認できます。
          </p>
          <Link href={`/attempt/${id}`} className="mt-6 inline-block text-blue-600 underline dark:text-blue-400">
            受験画面へ戻る
          </Link>
        </div>
      );
    }
    notFound();
  }

  const { result } = loaded;
  const questions = new Map<string, PublicQuestion>();
  for (const block of result.blocks) {
    if (block.type === "question") questions.set(block.id, block);
  }
  const ordered = result.order
    .map((questionId) => questions.get(questionId))
    .filter((q): q is PublicQuestion => Boolean(q));
  const reveals = new Map<string, Reveal>(
    result.reveals.map((r) => [
      r.questionId,
      {
        answers: r.answers,
        ...(r.explain ? { explain: r.explain } : {}),
        ...(r.model ? { model: r.model } : {}),
      },
    ]),
  );
  const results = new Map(result.grade.questions.map((q) => [q.questionId, q]));
  const reviewSet = new Set(result.grade.reviewQuestionIds);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">結果・復習</p>
        <h1 className="mt-1 text-2xl font-bold">{result.attempt.bookTitle}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {result.attempt.finishedAt ? new Date(result.attempt.finishedAt).toLocaleString("ja-JP") : ""}
          {result.attempt.status === "expired" ? "(期限切れ)" : ""}
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">得点</p>
            <p className="text-3xl font-bold tabular-nums">
              {result.attempt.score}
              <span className="ml-1 text-base font-normal text-slate-500 dark:text-slate-400">
                / {result.attempt.maxScore}
              </span>
            </p>
          </div>
          {result.attempt.scoreRate !== null && (
            <p className="text-sm text-slate-500 dark:text-slate-400">正答率 {result.attempt.scoreRate}%</p>
          )}
          <p className="ml-auto text-sm">
            復習対象 <strong>{result.grade.reviewQuestionIds.length}</strong> 問
          </p>
        </div>

        {reviewSet.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">復習する:</span>
            {ordered.map((question, index) =>
              reviewSet.has(question.id) ? (
                <a
                  key={question.id}
                  href={`#q-${question.id}`}
                  className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  問 {index + 1}
                </a>
              ) : null,
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {result.canSelfGrade.length > 0 && (
            <SelfGradeControls
              attemptId={id}
              essays={result.canSelfGrade.map((questionId) => ({
                questionId,
                number: ordered.findIndex((q) => q.id === questionId) + 1,
              }))}
            />
          )}
          <Link
            href={`/attempt/${id}`}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            受験画面
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            学習ダッシュボード
          </Link>
        </div>
      </div>

      <div className="qb-book mt-8">
        <AstView
          blocks={ordered as unknown as PublicBlock[]}
          mode="result"
          answers={result.answers}
          results={results}
          reveals={reveals}
          assetBase={`/api/attempts/${id}/assets`}
        />
      </div>
    </div>
  );
}

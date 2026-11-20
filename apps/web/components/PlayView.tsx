"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parse, collectQuestions, toPublic } from "@qb/parser";
import type { AttemptGrade, BookAst, PublicQuestion, SelfGrade } from "@qb/parser";
import { AstView } from "@/components/AstView";
import {
  buildReveals,
  gradeBook,
  newSeed,
  planPlay,
  resultMap,
  type PlayPlan,
  type QuestionAnswer,
} from "@/lib/book";
import {
  clearAttempt,
  loadAttempt,
  loadDraft,
  saveAttempt,
  type AttemptRecord,
} from "@/lib/storage";

type Ready = {
  status: "ready";
  ast: BookAst;
  publicBlocks: ReturnType<typeof toPublic>["blocks"];
  meta: BookAst["meta"];
  plan: PlayPlan;
  attempt: AttemptRecord;
};

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "invalid"; messages: string[] }
  | Ready;

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function PlayView() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [now, setNow] = useState(() => Date.now());
  const attemptRef = useRef<AttemptRecord | null>(null);

  useEffect(() => {
    const draft = loadDraft();
    if (!draft) {
      setState({ status: "empty" });
      return;
    }
    const parsed = parse(draft.source);
    if (parsed.hasErrors) {
      setState({
        status: "invalid",
        messages: parsed.diagnostics
          .filter((d) => d.severity === "error")
          .slice(0, 5)
          .map((d) => `${d.code} ${d.line}:${d.column} ${d.message}`),
      });
      return;
    }

    const questions = collectQuestions(parsed.ast.blocks);
    let attempt = loadAttempt();
    if (!attempt || attempt.source !== draft.source) {
      attempt = {
        version: 1,
        source: draft.source,
        seed: newSeed(),
        startedAt: Date.now(),
        answers: {},
      };
      saveAttempt(attempt);
    }
    attemptRef.current = attempt;
    const plan = planPlay(parsed.ast, attempt.seed);
    setAnswers(attempt.answers ?? {});
    setState({
      status: "ready",
      ast: parsed.ast,
      publicBlocks: toPublic(parsed.ast).blocks,
      meta: parsed.ast.meta,
      plan,
      attempt,
    });
    if (questions.length === 0) {
      // 設問が 0 件でも結果画面は出せるようにする
    }
  }, []);

  const ready = state.status === "ready" ? state : null;

  // 制限時間のカウントダウン
  useEffect(() => {
    if (!ready || ready.attempt.submittedAt || !ready.meta.timeLimit) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ready]);

  const deadline = ready?.meta.timeLimit ? ready.attempt.startedAt + ready.meta.timeLimit * 1000 : null;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const expired = remaining !== null && remaining <= 0 && !ready?.attempt.submittedAt;

  const persist = useCallback((nextAnswers: Record<string, QuestionAnswer>, patch?: Partial<AttemptRecord>) => {
    const base = attemptRef.current;
    if (!base) return;
    const next: AttemptRecord = { ...base, ...patch, answers: nextAnswers };
    attemptRef.current = next;
    saveAttempt(next);
    setState((prev) => (prev.status === "ready" ? { ...prev, attempt: next } : prev));
  }, []);

  const updateAnswer = useCallback(
    (questionId: string, answer: QuestionAnswer) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: answer };
        if (!attemptRef.current?.submittedAt) persist(next);
        return next;
      });
    },
    [persist],
  );

  const selfGrade = useCallback(
    (questionId: string, grade: SelfGrade) => {
      setAnswers((prev) => {
        const current = prev[questionId];
        const next: Record<string, QuestionAnswer> = {
          ...prev,
          [questionId]:
            current && current.kind === "essay"
              ? { ...current, selfGrade: grade }
              : { kind: "essay", text: "", selfGrade: grade },
        };
        // 終端状態後も自己採点は更新できる(§7.5)
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const submit = useCallback(() => {
    const base = attemptRef.current;
    if (!base || base.submittedAt) return;
    persist(answers, { submittedAt: Date.now() });
  }, [answers, persist]);

  // 期限到達で自動提出
  useEffect(() => {
    if (expired) submit();
  }, [expired, submit]);

  const submitted = Boolean(ready?.attempt.submittedAt);
  const grade: AttemptGrade | null = useMemo(() => {
    if (!ready || !submitted) return null;
    return gradeBook(ready.ast, ready.plan.questions, answers);
  }, [ready, submitted, answers]);

  const reveals = useMemo(() => (ready ? buildReveals(ready.ast) : new Map()), [ready]);
  const results = useMemo(() => (grade ? resultMap(grade) : new Map()), [grade]);

  const publicQuestions = useMemo(() => {
    if (!ready) return new Map<string, PublicQuestion>();
    const map = new Map<string, PublicQuestion>();
    const walk = (blocks: typeof ready.publicBlocks) => {
      for (const b of blocks) {
        if (b.type === "question") map.set(b.id, b);
      }
    };
    walk(ready.publicBlocks);
    return map;
  }, [ready]);

  const playBlocks = useMemo(() => {
    if (!ready) return [];
    return ready.plan.questions
      .map((q) => publicQuestions.get(q.id))
      .filter((q): q is PublicQuestion => Boolean(q));
  }, [ready, publicQuestions]);

  const blankOrder = useMemo(() => {
    // 選択肢空欄は選択肢シャッフルの対象(§5.3)。値は作者記述順のインデックス
    const map = new Map<string, number[]>();
    if (!ready) return map;
    const rnd = (() => {
      let a = (ready.attempt.seed ^ 0x9e3779b9) >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    if (!ready.meta.shuffle.choices) return map;
    const walkInlines = (inlines: unknown[]) => {
      for (const raw of inlines as Array<Record<string, unknown>>) {
        if (raw.t === "choiceBlank" && Array.isArray(raw.options)) {
          const n = raw.options.length;
          const indices = Array.from({ length: n }, (_, i) => i);
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
          }
          map.set(String(raw.id), indices);
        } else if (Array.isArray(raw.c)) walkInlines(raw.c);
      }
    };
    const walk = (blocks: typeof ready.publicBlocks) => {
      for (const b of blocks) {
        if (b.type === "paragraph") walkInlines(b.c);
        else if (b.type === "list") b.items.forEach(walk);
        else if (b.type === "table") b.rows.forEach((row) => row.forEach((cell) => walkInlines(cell)));
        else if (b.type === "question") walk(b.body);
      }
    };
    walk(ready.publicBlocks);
    return map;
  }, [ready]);

  const restart = () => {
    clearAttempt();
    const draft = loadDraft();
    if (!draft) {
      setState({ status: "empty" });
      return;
    }
    const parsed = parse(draft.source);
    const attempt: AttemptRecord = {
      version: 1,
      source: draft.source,
      seed: newSeed(),
      startedAt: Date.now(),
      answers: {},
    };
    saveAttempt(attempt);
    attemptRef.current = attempt;
    setAnswers({});
    setNow(Date.now());
    setState({
      status: "ready",
      ast: parsed.ast,
      publicBlocks: toPublic(parsed.ast).blocks,
      meta: parsed.ast.meta,
      plan: planPlay(parsed.ast, attempt.seed),
      attempt,
    });
  };

  if (state.status === "loading") {
    return <p className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">読み込み中…</p>;
  }

  if (state.status === "empty") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">受験するブックがありません</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          エディタでブックを作成し「このブックで受験する」を押してください。
        </p>
        <Link
          href="/books/new"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          エディタを開く
        </Link>
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-bold">ブックにエラーがあります</h1>
        <ul className="mt-4 space-y-1 text-sm text-rose-700 dark:text-rose-300">
          {state.messages.map((m, i) => (
            <li key={i} className="font-mono">
              {m}
            </li>
          ))}
        </ul>
        <Link href="/books/new" className="mt-6 inline-block text-blue-600 underline dark:text-blue-400">
          エディタで修正する
        </Link>
      </div>
    );
  }

  const unanswered = ready!.plan.questions.filter((q) => {
    const a = answers[q.id];
    if (!a) return true;
    if (a.kind === "blanks") return Object.values(a.values).every((v) => v.trim() === "");
    if (a.kind === "choice") return a.choiceIds.length === 0;
    if (a.kind === "essay") return a.text.trim() === "";
    return false;
  }).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-bold">{ready!.meta.title || "無題のブック"}</h1>
          {remaining !== null && !submitted && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                remaining <= 60
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
              role="timer"
              aria-live="off"
            >
              残り {formatSeconds(remaining)}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            全 {ready!.plan.questions.length} 問
          </span>
        </div>
        {ready!.meta.description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{ready!.meta.description}</p>
        )}
      </header>

      {submitted && grade && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">得点</p>
              <p className="text-3xl font-bold tabular-nums">
                {grade.score}
                <span className="ml-1 text-base font-normal text-slate-500 dark:text-slate-400">
                  / {grade.maxScore}
                </span>
              </p>
            </div>
            <div className="ml-auto text-right text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                復習対象 <strong>{grade.reviewQuestionIds.length}</strong> 問
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ready!.attempt.submittedAt
                  ? new Date(ready!.attempt.submittedAt).toLocaleString("ja-JP")
                  : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restart}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              もう一度受験する
            </button>
            <Link
              href="/books/new"
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              エディタへ戻る
            </Link>
            <button
              type="button"
              onClick={() => {
                const lines = [
                  `# ${ready!.meta.title}`,
                  `得点: ${grade.score} / ${grade.maxScore}`,
                  ...grade.questions.map((q, i) => {
                    const mark =
                      q.kind === "essay"
                        ? q.selfGraded
                          ? `自己採点 ${q.score}`
                          : "未自己採点"
                        : q.correct
                          ? "正解"
                          : "不正解";
                    return `${i + 1}. ${q.questionId}: ${q.score}/${q.maxScore} (${mark})`;
                  }),
                ];
                void navigator.clipboard?.writeText(lines.join("\n"));
              }}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              結果をコピー
            </button>
          </div>
        </div>
      )}

      <div className="qb-book">
        <AstView
          blocks={playBlocks}
          mode={submitted ? "result" : "play"}
          answers={answers}
          onChange={submitted ? undefined : updateAnswer}
          onSelfGrade={submitted ? selfGrade : undefined}
          results={results}
          reveals={reveals}
          choiceOrder={ready!.plan.choiceOrder}
          blankOrder={blankOrder}
        />
      </div>

      {!submitted && (
        <div className="sticky bottom-4 mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            未回答 {unanswered} 問 / {ready!.plan.questions.length} 問
          </span>
          <button
            type="button"
            onClick={submit}
            className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            提出する
          </button>
        </div>
      )}
    </div>
  );
}

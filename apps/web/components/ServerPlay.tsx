"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { arrangePlayBlocks } from "@qb/parser";
import type { AttemptGrade, PublicBlock, QuestionGrade, SelfGrade } from "@qb/parser";
import { AstView } from "@/components/AstView";
import { mulberry32, type QuestionAnswer, type Reveal } from "@/lib/book";
import type { PlayReveal, PlayState } from "@/lib/attempts";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PlayState };

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function answerRequests(
  answer: QuestionAnswer,
): Array<{ blankId: string | null; value: unknown }> {
  if (answer.kind === "blanks") {
    return Object.entries(answer.values).map(([blankId, text]) => ({
      blankId,
      value: { text },
    }));
  }
  if (answer.kind === "choice") {
    return [{ blankId: null, value: { choiceIds: answer.choiceIds } }];
  }
  if (answer.kind === "boolean") {
    return [{ blankId: null, value: { boolean: answer.value } }];
  }
  return [
    {
      blankId: null,
      value: { text: answer.text, ...(answer.selfGrade ? { selfGrade: answer.selfGrade } : {}) },
    },
  ];
}

export function ServerPlay({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [grade, setGrade] = useState<AttemptGrade | null>(null);
  const [reveals, setReveals] = useState<PlayReveal[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  /** 即時採点の結果(練習モードのみ) */
  const [checked, setChecked] = useState<Map<string, { grade: QuestionGrade; reveal: Reveal }>>(
    new Map(),
  );
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // 初期読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/attempts/${attemptId}`, { cache: "no-store" });
        const data = (await res.json()) as { state?: PlayState; error?: { message?: string } };
        if (cancelled) return;
        if (!res.ok || !data.state) {
          setState({ status: "error", message: data.error?.message ?? "受験を読み込めませんでした" });
          return;
        }
        setAnswers(data.state.answers);
        setGrade(data.state.result?.grade ?? null);
        setReveals(data.state.result?.reveals ?? []);
        setState({ status: "ready", data: data.state });
      } catch {
        if (!cancelled) setState({ status: "error", message: "通信に失敗しました" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const ready = state.status === "ready" ? state.data : null;
  const finished = Boolean(ready?.result);
  /** 中断済み(§7.4)。採点されないため結果画面はない */
  const abandoned = ready?.attempt.status === "abandoned";
  /** 中断後の戻り先(ゲストはトップ、ログイン済みは学習ダッシュボード) */
  const abandonedHref = ready?.attempt.guest ? "/" : "/dashboard";
  const abandonedLabel = ready?.attempt.guest ? "トップへ" : "学習ダッシュボードへ";
  const timeLimit = ready?.book.timeLimit ?? null;
  const startedAt = ready ? new Date(ready.attempt.startedAt).getTime() : 0;
  const deadline = timeLimit ? startedAt + timeLimit * 1000 : null;

  // 中断済みの受験を開いた/中断した場合は、そのまま表示せず戻り先へリダイレクトする
  useEffect(() => {
    if (!abandoned) return;
    router.replace(abandonedHref);
  }, [abandoned, abandonedHref, router]);

  useEffect(() => {
    if (!deadline || finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline, finished]);

  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const expired = remaining !== null && remaining <= 0 && !finished;

  /** 回答をサーバへ送る(設問単位でデバウンス) */
  const persist = useCallback(
    (questionId: string, answer: QuestionAnswer) => {
      const timersMap = timers.current;
      const existing = timersMap.get(questionId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersMap.delete(questionId);
        for (const req of answerRequests(answer)) {
          void fetch(`/api/attempts/${attemptId}/answers`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ questionId, blankId: req.blankId, value: req.value }),
          }).then((res) => {
            if (!res.ok && res.status !== 409) {
              void res.json().then((d: { error?: { message?: string } }) => {
                setError(d.error?.message ?? "回答を保存できませんでした");
              });
            }
          });
        }
      }, 400);
      timersMap.set(questionId, timer);
    },
    [attemptId],
  );

  /** 答え合わせの直前に、その設問の未保存回答を確定させる */
  const flushAnswer = useCallback(
    async (questionId: string): Promise<boolean> => {
      const timersMap = timers.current;
      const pending = timersMap.get(questionId);
      if (pending) {
        clearTimeout(pending);
        timersMap.delete(questionId);
      }

      const answer = answers[questionId];
      if (!answer) return true;

      try {
        const responses = await Promise.all(
          answerRequests(answer).map((req) =>
            fetch(`/api/attempts/${attemptId}/answers`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ questionId, blankId: req.blankId, value: req.value }),
            }),
          ),
        );
        for (const res of responses) {
          if (!res.ok && res.status !== 409) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            setError(data.error?.message ?? "回答を保存できませんでした");
            return false;
          }
        }
        return true;
      } catch {
        setError("通信に失敗しました");
        return false;
      }
    },
    [answers, attemptId],
  );

  const updateAnswer = useCallback(
    (questionId: string, answer: QuestionAnswer) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: answer };
        return next;
      });
      if (!finished) persist(questionId, answer);
    },
    [finished, persist],
  );

  const selfGrade = useCallback(
    (questionId: string, value: SelfGrade) => {
      const canSync = finished || checked.has(questionId);
      setAnswers((prev) => {
        const current = prev[questionId];
        const answer: QuestionAnswer =
          current && current.kind === "essay"
            ? { ...current, selfGrade: value }
            : { kind: "essay", text: "", selfGrade: value };
        if (canSync) {
          // 提出後・答え合わせ後も自己採点は更新できる(§7.5)。専用 API で再集計する
          void fetch(`/api/attempts/${attemptId}/self-grade`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ questionId, selfGrade: value }),
          })
            .then(async (res) => {
              const data = (await res.json()) as { grade?: AttemptGrade; error?: { message?: string } };
              if (!res.ok) {
                setError(data.error?.message ?? "自己採点を登録できませんでした");
                return;
              }
              if (data.grade) setGrade(data.grade);
            })
            .catch(() => setError("通信に失敗しました"));
        }
        return { ...prev, [questionId]: answer };
      });
    },
    [attemptId, checked, finished],
  );

  const submit = useCallback(
    async (keepQuiet = false) => {
      if (busy) return;
      if (!keepQuiet) setBusy(true);
      setError(null);
      try {
        const selfGrades: Record<string, SelfGrade> = {};
        for (const [questionId, answer] of Object.entries(answers)) {
          if (answer.kind === "essay" && answer.selfGrade) selfGrades[questionId] = answer.selfGrade;
        }
        const res = await fetch(`/api/attempts/${attemptId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selfGrades }),
        });
        const data = (await res.json()) as {
          grade?: AttemptGrade;
          reveals?: PlayReveal[];
          error?: { message?: string };
        };
        if (!res.ok || !data.grade) {
          setError(data.error?.message ?? "提出できませんでした");
          return;
        }
        setGrade(data.grade);
        setReveals(data.reveals ?? []);
        setState((prev) =>
          prev.status === "ready"
            ? {
                status: "ready",
                data: {
                  ...prev.data,
                  attempt: { ...prev.data.attempt, status: "submitted" },
                  result: {
                    grade: data.grade!,
                    reveals: data.reveals ?? [],
                    finishedAt: new Date().toISOString(),
                  },
                },
              }
            : prev,
        );
      } catch {
        setError("通信に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [answers, attemptId, busy],
  );

  // 期限到達で自動提出
  useEffect(() => {
    if (expired) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  /** 即時採点(練習モード + practiceFeedback。§7.7)。正解も取得して表示し、回答をロックする */
  const check = useCallback(
    async (questionId: string) => {
      setError(null);
      if (!(await flushAnswer(questionId))) return;
      try {
        const res = await fetch(`/api/attempts/${attemptId}/check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
        const data = (await res.json()) as {
          question?: QuestionGrade;
          reveal?: PlayReveal;
          error?: { message?: string };
        };
        const question = data.question;
        const reveal = data.reveal;
        if (!res.ok || !question || !reveal) {
          setError(data.error?.message ?? "答え合わせできませんでした");
          return;
        }
        setChecked((prev) => {
          const next = new Map(prev);
          next.set(questionId, {
            grade: question,
            reveal: {
              answers: reveal.answers,
              ...(reveal.explain ? { explain: reveal.explain } : {}),
              ...(reveal.model ? { model: reveal.model } : {}),
            },
          });
          return next;
        });
      } catch {
        setError("通信に失敗しました");
      }
    },
    [attemptId, flushAnswer],
  );

  /** 受験の中断(§7.4)。採点しない */
  const abandon = useCallback(async () => {
    if (!window.confirm("受験を中断しますか?中断した受験は採点されません。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/abandon`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "中断できませんでした");
        return;
      }
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", data: { ...prev.data, attempt: { ...prev.data.attempt, status: "abandoned" } } }
          : prev,
      );
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [attemptId]);

  /** 結果共有(点数のみ。§3.5) */
  const shareResult = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/share`, { method: "POST" });
      const data = (await res.json()) as { path?: string; error?: { message?: string } };
      if (!res.ok || !data.path) {
        setError(data.error?.message ?? "共有リンクを発行できませんでした");
        return;
      }
      setShareUrl(`${window.location.origin}${data.path}`);
    } catch {
      setError("通信に失敗しました");
    }
  };

  const restart = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/books/${ready.attempt.bookId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: ready.attempt.mode }),
      });
      const data = (await res.json()) as { attemptId?: string };
      if (res.ok && data.attemptId) {
        router.push(`/attempt/${data.attemptId}`);
        return;
      }
      setError("受験を開始できませんでした");
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const playBlocks = useMemo(() => {
    if (!ready) return [] as PublicBlock[];
    return arrangePlayBlocks(ready.book.blocks, ready.order);
  }, [ready]);

  const choiceOrder = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [questionId, ids] of Object.entries(ready?.choices ?? {})) map.set(questionId, ids);
    return map;
  }, [ready]);

  const blankOrder = useMemo(() => {
    const map = new Map<string, number[]>();
    if (!ready?.book.shuffleChoices) return map;
    const rnd = mulberry32(ready.attempt.seed ^ 0x9e3779b9);
    const walkInlines = (inlines: unknown[]) => {
      for (const raw of inlines as Array<Record<string, unknown>>) {
        if (raw.t === "choiceBlank" && Array.isArray(raw.options)) {
          const n = raw.options.length;
          const indices = Array.from({ length: n }, (_, i) => i);
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [indices[i], indices[j]] = [indices[j]!, indices[i]!];
          }
          map.set(String(raw.id), indices);
        } else if (Array.isArray(raw.c)) walkInlines(raw.c);
      }
    };
    const walk = (blocks: PublicBlock[]) => {
      for (const b of blocks) {
        if (b.type === "paragraph") walkInlines(b.c);
        else if (b.type === "list") b.items.forEach(walk);
        else if (b.type === "table") b.rows.forEach((row) => row.forEach((cell) => walkInlines(cell)));
        else if (b.type === "question") walk(b.body);
      }
    };
    walk(ready.book.blocks);
    return map;
  }, [ready]);

  const results = useMemo(() => {
    const map = new Map<string, QuestionGrade>();
    for (const [questionId, entry] of checked) map.set(questionId, entry.grade);
    for (const q of grade?.questions ?? []) map.set(q.questionId, q);
    return map;
  }, [checked, grade]);

  const revealMap = useMemo(() => {
    const map = new Map<string, Reveal>();
    for (const [questionId, entry] of checked) map.set(questionId, entry.reveal);
    for (const r of reveals) {
      map.set(r.questionId, {
        answers: r.answers,
        ...(r.explain ? { explain: r.explain } : {}),
        ...(r.model ? { model: r.model } : {}),
      });
    }
    return map;
  }, [checked, reveals]);

  if (state.status === "loading") {
    return <p className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">読み込み中…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-bold">受験を開けませんでした</h1>
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{state.message}</p>
        <Link href="/library" className="mt-6 inline-block text-blue-600 underline dark:text-blue-400">
          マイブックへ
        </Link>
      </div>
    );
  }
  if (abandoned) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-bold">受験を中断しました</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          中断した受験は採点されません。
        </p>
        <Link href={abandonedHref} className="mt-6 inline-block text-blue-600 underline dark:text-blue-400">
          {abandonedLabel}
        </Link>
      </div>
    );
  }

  const unanswered = ready!.order.filter((id) => {
    const a = answers[id];
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
          <h1 className="mr-auto text-xl font-bold">{ready!.book.title || "無題のブック"}</h1>
          {remaining !== null && !finished && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                remaining <= 60
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
              role="timer"
            >
              残り {formatSeconds(remaining)}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            全 {ready!.order.length} 問
          </span>
        </div>
        {ready!.book.description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{ready!.book.description}</p>
        )}
      </header>

      {finished && grade && (
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
                {ready!.result ? new Date(ready!.result.finishedAt).toLocaleString("ja-JP") : ""}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            採点結果はサーバに保存されています。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              もう一度受験する
            </button>
            <Link
              href={`/attempt/${attemptId}/result`}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              結果・復習ページ
            </Link>
            <Link
              href="/library"
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              マイブックへ
            </Link>
            <button
              type="button"
              onClick={() => {
                const lines = [
                  `# ${ready!.book.title}`,
                  `得点: ${grade.score} / ${grade.maxScore}`,
                  ...grade.questions.map(
                    (q, i) =>
                      `${i + 1}. ${q.questionId}: ${q.score}/${q.maxScore} (${
                        q.kind === "essay" ? (q.selfGraded ? `自己採点 ${q.score}` : "未自己採点") : q.correct ? "正解" : "不正解"
                      })`,
                  ),
                ];
                void navigator.clipboard?.writeText(lines.join("\n"));
              }}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              結果をコピー
            </button>
            <button
              type="button"
              onClick={() => void shareResult()}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              結果を共有
            </button>
          </div>
          {shareUrl && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="mb-1 font-medium">点数だけの共有リンク(30 日で失効)</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 break-all">{shareUrl}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(shareUrl)}
                  className="rounded border border-amber-400 px-2 py-0.5"
                >
                  コピー
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="qb-book">
        <AstView
          blocks={playBlocks}
          mode={finished ? "result" : "play"}
          answers={answers}
          onChange={finished ? undefined : updateAnswer}
          onSelfGrade={selfGrade}
          results={results}
          reveals={revealMap}
          choiceOrder={choiceOrder}
          blankOrder={blankOrder}
          assetUrl={(assetId) => `/api/attempts/${attemptId}/assets/${assetId}`}
          checkedIds={new Set(checked.keys())}
          {...(ready!.book.practiceFeedback && ready!.attempt.mode !== "exam" && !finished
            ? { onCheck: (questionId: string) => void check(questionId) }
            : {})}
        />
      </div>

      {!finished && (
        <div className="sticky bottom-4 mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            未回答 {unanswered} 問 / {ready!.order.length} 問
          </span>
          <button
            type="button"
            onClick={() => void abandon()}
            disabled={busy}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            中断する
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? "提出中…" : "提出する"}
          </button>
        </div>
      )}
    </div>
  );
}

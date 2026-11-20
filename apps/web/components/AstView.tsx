"use client";

import { toPublicBlock } from "@qb/parser";
import type {
  PublicBlock,
  PublicChoice,
  PublicInline,
  PublicQuestion,
  QuestionGrade,
  ResultAnswer,
  SelfGrade,
} from "@qb/parser";
import type { QuestionAnswer, Reveal } from "@/lib/book";
import { MathSpan } from "./Math";

export type AstViewMode = "preview" | "play" | "result";

type Ctx = {
  mode: AstViewMode;
  answers: Record<string, QuestionAnswer>;
  onChange?: (questionId: string, answer: QuestionAnswer) => void;
  onSelfGrade?: (questionId: string, grade: SelfGrade) => void;
  results: Map<string, QuestionGrade>;
  reveals: Map<string, Reveal>;
  choiceOrder: Map<string, string[]>;
  /** 選択肢空欄の表示順(作者記述順のインデックス) */
  blankOrder: Map<string, number[]>;
  /** 設問 ID → 通し番号(事前に純粋に計算する) */
  numbering: Map<string, number>;
  /** アセット ID → 画像 URL(文脈ごとに配信経路が変わる。§7.8) */
  assetUrl?: (assetId: string) => string;
  /** サーバコンポーネントから渡すときの画像 URL 前置き(`${assetBase}/${assetId}`) */
  assetBase?: string;
  /** 即時採点(練習モード + practiceFeedback)。§7.7 */
  onCheck?: (questionId: string) => void;
  /** 採点済みの設問(即時採点の結果を表示する) */
  checkedIds?: Set<string>;
  questionId?: string;
};

export type AstViewProps = {
  blocks: PublicBlock[];
  mode: AstViewMode;
  answers?: Record<string, QuestionAnswer>;
  onChange?: (questionId: string, answer: QuestionAnswer) => void;
  onSelfGrade?: (questionId: string, grade: SelfGrade) => void;
  results?: Map<string, QuestionGrade>;
  reveals?: Map<string, Reveal>;
  choiceOrder?: Map<string, string[]>;
  blankOrder?: Map<string, number[]>;
  assetUrl?: (assetId: string) => string;
  assetBase?: string;
  onCheck?: (questionId: string) => void;
  checkedIds?: Set<string>;
};

/** 設問の通し番号を決める(レンダー中に状態を書き換えない) */
function numberQuestions(blocks: PublicBlock[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  const walk = (bs: PublicBlock[]) => {
    for (const b of bs) {
      if (b.type === "question") {
        n += 1;
        map.set(b.id, n);
      } else if (b.type === "list") {
        b.items.forEach(walk);
      }
    }
  };
  walk(blocks);
  return map;
}

export function AstView(props: AstViewProps) {
  const ctx: Ctx = {
    mode: props.mode,
    answers: props.answers ?? {},
    onChange: props.onChange,
    onSelfGrade: props.onSelfGrade,
    results: props.results ?? new Map<string, QuestionGrade>(),
    reveals: props.reveals ?? new Map<string, Reveal>(),
    choiceOrder: props.choiceOrder ?? new Map<string, string[]>(),
    blankOrder: props.blankOrder ?? new Map<string, number[]>(),
    numbering: numberQuestions(props.blocks),
    ...(props.assetUrl
      ? { assetUrl: props.assetUrl }
      : props.assetBase
        ? { assetUrl: (assetId: string) => `${props.assetBase}/${assetId}` }
        : {}),
    ...(props.onCheck ? { onCheck: props.onCheck } : {}),
    ...(props.checkedIds ? { checkedIds: props.checkedIds } : {}),
  };
  return <BlockList blocks={props.blocks} ctx={ctx} />;
}

function BlockList({ blocks, ctx }: { blocks: PublicBlock[]; ctx: Ctx }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockView key={blockKey(block, index)} block={block} ctx={ctx} />
      ))}
    </>
  );
}

function blockKey(block: PublicBlock, index: number): string {
  if (block.type === "heading") return `h-${block.id}-${index}`;
  if (block.type === "question") return `q-${block.id}`;
  return `${block.type}-${index}`;
}

function BlockView({ block, ctx }: { block: PublicBlock; ctx: Ctx }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}` as unknown as "h1") as "h1" | "h2" | "h3";
      return <Tag id={block.id}>{block.text}</Tag>;
    }
    case "paragraph":
      return (
        <p>
          <InlineList inlines={block.c} ctx={ctx} />
        </p>
      );
    case "text":
      // 表示専用ブロック(§4.2)。設問を作らず、受験画面にもそのまま出す
      return (
        <section className="qb-text">
          <BlockList blocks={block.body} ctx={ctx} />
        </section>
      );
    case "code":
      return (
        <pre>
          <code>{block.v}</code>
        </pre>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>
              <BlockList blocks={item} ctx={ctx} />
            </li>
          ))}
        </Tag>
      );
    }
    case "math":
      return <MathSpan tex={block.v} display />;
    case "image":
      return <BookImage block={block} ctx={ctx} />;
    case "table":
      return (
        <div className="my-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>
                    <InlineList inlines={cell} ctx={ctx} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <InlineList inlines={cell} ctx={ctx} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "question":
      return <QuestionView question={block} ctx={ctx} />;
  }
}

function BookImage({
  block,
  ctx,
}: {
  block: Extract<PublicBlock, { type: "image" }>;
  ctx: Ctx;
}) {
  // アセットは認可付き API 経由で配信する(§9)。文脈に応じた URL を組み立てる
  const assetSrc = block.assetId && ctx.assetUrl ? ctx.assetUrl(block.assetId) : null;
  if (assetSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetSrc}
        alt={block.alt}
        width={block.width}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-4 max-w-full rounded-lg border border-slate-200 dark:border-slate-800"
      />
    );
  }
  if (block.src && /^https?:\/\//i.test(block.src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={block.src}
        alt={block.alt}
        width={block.width}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  const name = block.src?.startsWith("img:") ? block.src.slice(4) : (block.assetId ?? block.alt);
  return (
    <div className="my-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-100 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      <span aria-hidden>🖼</span>
      <span>画像: {name || block.alt}</span>
    </div>
  );
}

function InlineList({ inlines, ctx }: { inlines: PublicInline[]; ctx: Ctx }) {
  return (
    <>
      {inlines.map((inline, i) => (
        <InlineView key={i} inline={inline} ctx={ctx} />
      ))}
    </>
  );
}

function InlineView({ inline, ctx }: { inline: PublicInline; ctx: Ctx }) {
  switch (inline.t) {
    case "text":
      return <>{inline.v}</>;
    case "strong":
      return (
        <strong>
          <InlineList inlines={inline.c} ctx={ctx} />
        </strong>
      );
    case "em":
      return (
        <em>
          <InlineList inlines={inline.c} ctx={ctx} />
        </em>
      );
    case "code":
      return <code>{inline.v}</code>;
    case "math":
      return <MathSpan tex={inline.v} />;
    case "link": {
      const external = /^https?:/i.test(inline.href);
      return (
        <a
          href={inline.href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          <InlineList inlines={inline.c} ctx={ctx} />
        </a>
      );
    }
    case "blank":
      return <BlankView id={inline.id} input={inline.input} ctx={ctx} />;
    case "choiceBlank":
      return <ChoiceBlankView inline={inline} ctx={ctx} />;
  }
}

function currentBlanks(ctx: Ctx): Record<string, string> {
  if (!ctx.questionId) return {};
  const a = ctx.answers[ctx.questionId];
  return a && a.kind === "blanks" ? a.values : {};
}

function setBlank(ctx: Ctx, blankId: string, value: string) {
  if (!ctx.questionId || !ctx.onChange) return;
  const values = { ...currentBlanks(ctx), [blankId]: value };
  ctx.onChange(ctx.questionId, { kind: "blanks", values });
}

function answerFor(ctx: Ctx, blankId: string): ResultAnswer | null {
  if (!ctx.questionId) return null;
  const reveal = ctx.reveals.get(ctx.questionId);
  if (!reveal) return null;
  return reveal.answers.find((a) => "blankId" in a && a.blankId === blankId) ?? null;
}

function blankState(ctx: Ctx, blankId: string): "correct" | "incorrect" | undefined {
  if (ctx.mode !== "result" || !ctx.questionId) return undefined;
  const grade = ctx.results.get(ctx.questionId);
  const b = grade?.blanks?.find((x) => x.blankId === blankId);
  if (!b) return undefined;
  return b.correct ? "correct" : "incorrect";
}

function focusNext(current: HTMLElement) {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-qb-focusable]"));
  const index = nodes.indexOf(current);
  const next = nodes[index + 1];
  if (next) next.focus();
}

function BlankView({
  id,
  input,
  ctx,
}: {
  id: string;
  input: "text" | "number";
  ctx: Ctx;
}) {
  const value = currentBlanks(ctx)[id] ?? "";

  if (ctx.mode === "preview") {
    return <span className="qb-blank-placeholder">{input === "number" ? "数値" : "空欄"}</span>;
  }

  if (ctx.mode === "result") {
    const state = blankState(ctx, id);
    const answer = answerFor(ctx, id);
    const display = answer && "display" in answer ? answer.display : [];
    return (
      <span className="inline-flex flex-wrap items-baseline gap-1">
        <span className="qb-blank" data-state={state}>
          {value.trim() === "" ? <span className="text-slate-400">未回答</span> : value}
        </span>
        {state !== "correct" && display.length > 0 && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">
            正解: {display.join(" / ")}
          </span>
        )}
      </span>
    );
  }

  return (
    <input
      className="qb-blank"
      data-qb-focusable
      value={value}
      inputMode={input === "number" ? "decimal" : "text"}
      autoComplete="off"
      spellCheck={false}
      aria-label="解答欄"
      onChange={(e) => setBlank(ctx, id, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focusNext(e.currentTarget);
        }
      }}
    />
  );
}

function ChoiceBlankView({
  inline,
  ctx,
}: {
  inline: Extract<PublicInline, { t: "choiceBlank" }>;
  ctx: Ctx;
}) {
  const value = currentBlanks(ctx)[inline.id] ?? "";
  const order = ctx.blankOrder.get(inline.id) ?? inline.options.map((_, i) => i);

  if (ctx.mode === "preview") {
    return (
      <span className="qb-blank-placeholder">
        {inline.options.join(" / ")}
      </span>
    );
  }

  if (ctx.mode === "result") {
    const state = blankState(ctx, inline.id);
    const answer = answerFor(ctx, inline.id);
    const display = answer && "display" in answer ? answer.display : [];
    const selected = value === "" ? null : inline.options[Number(value)];
    return (
      <span className="inline-flex flex-wrap items-baseline gap-1">
        <span className="qb-blank" data-state={state}>
          {selected ?? <span className="text-slate-400">未回答</span>}
        </span>
        {state !== "correct" && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">
            正解: {display.join(" / ")}
          </span>
        )}
      </span>
    );
  }

  return (
    <select
      className="qb-choice-blank"
      data-qb-focusable
      aria-label="選択肢"
      value={value}
      onChange={(e) => setBlank(ctx, inline.id, e.target.value)}
    >
      <option value="">選択してください</option>
      {order.map((optionIndex) => (
        <option key={optionIndex} value={String(optionIndex)}>
          {inline.options[optionIndex]}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* 設問                                                                */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<PublicQuestion["kind"], string> = {
  blank: "穴埋め",
  single: "単一選択",
  multi: "複数選択",
  essay: "記述",
  truefalse: "正誤",
};

function QuestionView({ question, ctx }: { question: PublicQuestion; ctx: Ctx }) {
  const number = ctx.numbering.get(question.id) ?? 0;
  const grade = ctx.results.get(question.id);
  const reveal = ctx.reveals.get(question.id);
  const answer = ctx.answers[question.id];
  const qctx: Ctx = { ...ctx, questionId: question.id };
  const checked = ctx.checkedIds?.has(question.id) ?? false;
  const state =
    (ctx.mode === "result" || checked) && grade
      ? grade.kind === "essay"
        ? grade.selfGraded
          ? "graded"
          : undefined
        : grade.correct
          ? "correct"
          : "incorrect"
      : undefined;

  return (
    <section
      className="qb-question"
      id={`q-${question.id}`}
      data-state={state === "correct" || state === "incorrect" ? state : undefined}
      aria-label={`問 ${number}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="grid size-7 place-items-center rounded-full bg-slate-900 text-[13px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">
          {number}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {KIND_LABEL[question.kind]}
        </span>
        <span className="text-slate-500 dark:text-slate-400">{question.points} 点</span>
        {question.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-500 dark:border-slate-700 dark:text-slate-400"
          >
            #{tag}
          </span>
        ))}
        {ctx.onCheck && ctx.mode === "play" && !checked && (
          <button
            type="button"
            onClick={() => ctx.onCheck?.(question.id)}
            className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            答え合わせ
          </button>
        )}
        {grade && (ctx.mode === "result" || checked) && (
          <span className={`${ctx.onCheck && ctx.mode === "play" && !checked ? "" : "ml-auto"} font-semibold`}>
            {grade.kind === "essay" && !grade.selfGraded ? (
              <span className="text-amber-600 dark:text-amber-400">未自己採点</span>
            ) : (
              <span
                className={
                  grade.correct || (grade.kind === "essay" && grade.selfGraded)
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {grade.score} / {grade.maxScore}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="qb-book">
        <BlockList blocks={question.body} ctx={qctx} />
      </div>

      {(question.kind === "single" || question.kind === "multi") && (
        <ChoiceQuestion question={question} ctx={qctx} />
      )}
      {question.kind === "truefalse" && <TrueFalseQuestion question={question} ctx={qctx} />}
      {question.kind === "essay" && <EssayQuestion question={question} ctx={qctx} />}

      {question.hint && question.hint.length > 0 && ctx.mode !== "result" && (
        <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-300">ヒント</summary>
          <div className="qb-book mt-2">
            <BlockList blocks={question.hint} ctx={qctx} />
          </div>
        </details>
      )}

      {reveal && (ctx.mode === "result" || ctx.mode === "preview" || checked) && (
        <RevealPanel question={question} reveal={reveal} ctx={qctx} grade={grade} />
      )}
    </section>
  );
}

function ChoiceQuestion({ question, ctx }: { question: PublicQuestion; ctx: Ctx }) {
  const answer = ctx.answers[question.id];
  const selected = answer && answer.kind === "choice" ? answer.choiceIds : [];
  const order = ctx.choiceOrder.get(question.id) ?? (question.choices ?? []).map((c) => c.id);
  const byId = new Map((question.choices ?? []).map((c) => [c.id, c] as const));
  const reveal = ctx.reveals.get(question.id);
  const correctIds = new Set(
    (reveal?.answers ?? [])
      .filter((a): a is Extract<ResultAnswer, { kind: "choice" }> => a.kind === "choice")
      .flatMap((a) => a.display),
  );
  const disabled = ctx.mode !== "play";

  const toggle = (id: string) => {
    if (!ctx.onChange) return;
    if (question.kind === "single") {
      ctx.onChange(question.id, { kind: "choice", choiceIds: [id] });
      return;
    }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    ctx.onChange(question.id, { kind: "choice", choiceIds: next });
  };

  return (
    <fieldset className="mt-3 space-y-2">
      <legend className="sr-only">選択肢</legend>
      {order.map((id) => {
        const choice = byId.get(id) as PublicChoice | undefined;
        if (!choice) return null;
        const isSelected = selected.includes(id);
        const isCorrect = ctx.mode === "result" && correctIds.has(id);
        return (
          <label
            key={id}
            className="qb-choice"
            data-selected={isSelected}
            data-correct={isCorrect || undefined}
          >
            <input
              type={question.kind === "single" ? "radio" : "checkbox"}
              name={`q-${question.id}`}
              className="mt-1.5 accent-blue-600"
              checked={isSelected}
              disabled={disabled}
              onChange={() => toggle(id)}
              data-qb-focusable={ctx.mode === "play" ? true : undefined}
            />
            <span className="qb-book flex-1">
              <InlineList inlines={choice.label} ctx={ctx} />
            </span>
            {isCorrect && <span className="text-sm text-emerald-600 dark:text-emerald-400">正解</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

function TrueFalseQuestion({ question, ctx }: { question: PublicQuestion; ctx: Ctx }) {
  const answer = ctx.answers[question.id];
  const value = answer && answer.kind === "boolean" ? answer.value : null;
  const reveal = ctx.reveals.get(question.id);
  const correct = reveal?.answers.find((a) => a.kind === "boolean");

  const set = (v: boolean) => {
    if (ctx.mode !== "play" || !ctx.onChange) return;
    ctx.onChange(question.id, { kind: "boolean", value: v });
  };

  return (
    <div className="mt-3 flex gap-2">
      {[true, false].map((v) => {
        const selected = value === v;
        const isCorrect =
          ctx.mode === "result" &&
          correct !== undefined &&
          (correct as { display: string[] }).display[0] === String(v);
        return (
          <button
            key={String(v)}
            type="button"
            disabled={ctx.mode !== "play"}
            onClick={() => set(v)}
            data-qb-focusable={ctx.mode === "play" ? true : undefined}
            className="qb-choice flex-1 justify-center disabled:cursor-default"
            data-selected={selected}
            data-correct={isCorrect || undefined}
          >
            <span className="qb-book">{v ? "正" : "誤"}</span>
          </button>
        );
      })}
    </div>
  );
}

function EssayQuestion({ question, ctx }: { question: PublicQuestion; ctx: Ctx }) {
  const answer = ctx.answers[question.id];
  const text = answer && answer.kind === "essay" ? answer.text : "";
  const selfGrade = answer && answer.kind === "essay" ? answer.selfGrade : undefined;

  if (ctx.mode === "play") {
    return (
      <textarea
        className="mt-3 min-h-32 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-900"
        placeholder="解答を入力(提出後に模範解答を見て自己採点します)"
        maxLength={10000}
        value={text}
        data-qb-focusable
        onChange={(e) =>
          ctx.onChange?.(question.id, {
            kind: "essay",
            text: e.target.value,
            ...(selfGrade ? { selfGrade } : {}),
          })
        }
      />
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">あなたの解答</p>
      <p className="qb-book whitespace-pre-wrap">
        {text.trim() === "" ? <span className="text-slate-400">未回答</span> : text}
      </p>
      {ctx.mode === "result" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400">自己採点:</span>
          {(
            [
              ["full", "◯ 満点"],
              ["half", "△ 半分"],
              ["none", "✕ 0 点"],
            ] as const
          ).map(([grade, label]) => (
            <button
              key={grade}
              type="button"
              onClick={() => ctx.onSelfGrade?.(question.id, grade)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              data-selected={selfGrade === grade}
              aria-pressed={selfGrade === grade}
              style={selfGrade === grade ? { borderColor: "#2563eb", color: "#2563eb" } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RevealPanel({
  question,
  reveal,
  ctx,
  grade,
}: {
  question: PublicQuestion;
  reveal: Reveal;
  ctx: Ctx;
  grade?: QuestionGrade;
}) {
  const isPreview = ctx.mode === "preview";
  const choiceAnswers = reveal.answers.filter(
    (a): a is Extract<ResultAnswer, { kind: "choice" }> => a.kind === "choice",
  );
  const booleanAnswer = reveal.answers.find(
    (a): a is Extract<ResultAnswer, { kind: "boolean" }> => a.kind === "boolean",
  );
  const labelById = new Map((question.choices ?? []).map((c) => [c.id, c.label] as const));

  return (
    <div
      className={`mt-4 rounded-lg border p-4 text-sm ${
        isPreview
          ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
          : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>{isPreview ? "解答(プレビュー)" : "解答・解説"}</span>
        {grade && (
          <span className="font-normal text-slate-500 dark:text-slate-400">
            {grade.score} / {grade.maxScore} 点
          </span>
        )}
      </div>

      {choiceAnswers.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">正解の選択肢: </span>
          {choiceAnswers.flatMap((a) =>
            a.display.map((id) => (
              <span
                key={`${a.kind}-${id}`}
                className="mr-1 inline-flex items-center rounded bg-white px-2 py-0.5 text-xs dark:bg-slate-900"
              >
                <span className="qb-book">
                  {labelById.get(id) ? <InlineList inlines={labelById.get(id)!} ctx={ctx} /> : id}
                </span>
              </span>
            )),
          )}
        </div>
      )}

      {booleanAnswer && (
        <p className="mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">正解: </span>
          {booleanAnswer.display[0] === "true" ? "正" : "誤"}
        </p>
      )}

      {(() => {
        const blankAnswers = reveal.answers.filter(
          (a) =>
            a.kind === "exact" ||
            a.kind === "number" ||
            a.kind === "regex",
        );
        if (blankAnswers.length === 0) return null;
        return (
          <div className="mb-2 space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">空欄の正解</p>
            <ul className="list-disc pl-5">
              {blankAnswers.map((a, i) => (
                <li key={i}>
                  <span className="qb-book">
                    {"display" in a ? a.display.join(" / ") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {reveal.model && reveal.model.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">模範解答</p>
          <div className="qb-book">
            <BlockList blocks={reveal.model} ctx={ctx} />
          </div>
        </div>
      )}

      {reveal.explain && reveal.explain.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">解説</p>
          <div className="qb-book">
            <BlockList blocks={reveal.explain} ctx={ctx} />
          </div>
        </div>
      )}
    </div>
  );
}

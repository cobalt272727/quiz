import Link from "next/link";
import type { ReactNode } from "react";
import { SampleStartButton } from "@/components/SampleStartButton";

type Feature = {
  title: string;
  body: string;
  tone: string;
  icon: ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Markdown 風の記法",
    body: "見出し・表・数式・画像に加えて、空欄 [[603]]、選択肢 [[?603 | 593]]、正規表現、数値の許容誤差まで 1 ファイルに書けます。",
    tone: "from-blue-500 to-sky-400",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden
      >
        <path d="M4 5h16M4 12h10M4 19h7" />
        <path d="m16 15 2 2 3-3" />
      </svg>
    ),
  },
  {
    title: "書いた瞬間にプレビュー",
    body: "右ペインで即時プレビュー。診断は行番号付きで表示され、CodeMirror 上にも波線が出ます。",
    tone: "from-fuchsia-500 to-rose-400",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden
      >
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    ),
  },
  {
    title: "採点から復習まで",
    body: "穴埋め・単一選択・複数選択・正誤・記述(自己採点)に対応。得点・復習対象・履歴・統計まで一画面で確認できます。",
    tone: "from-emerald-500 to-teal-400",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden
      >
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 3-4 3 2 4-6" />
      </svg>
    ),
  },
];

const TICKER = [
  "[[603]]",
  "[[?正解 | 誤答]]",
  "@q … @end",
  "@text … @end",
  "$$x^2$$",
  "Markdown 表",
  "img:図.png",
  "自己採点",
  "復習",
  "共有リンク",
];

const STEPS = [
  {
    title: "書く",
    body: "エディタに記法で書く。右ペインでその場でプレビュー。",
  },
  {
    title: "保存する",
    body: "ID 自動付与と検証。画像もアップロードできます。",
  },
  {
    title: "解いて、振り返る",
    body: "受験・採点・復習。ログインすれば履歴と統計も残ります。",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* ヒーロー */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="qb-grid absolute inset-0" />
          <div className="qb-drift absolute -top-40 left-1/2 -ml-[19rem] h-[38rem] w-[38rem] rounded-full bg-linear-to-br from-blue-300/45 via-sky-300/30 to-emerald-200/30 blur-3xl dark:from-blue-600/25 dark:via-sky-500/15 dark:to-emerald-500/10" />
          <div className="qb-float-slow absolute -right-40 top-48 h-96 w-96 rounded-full bg-linear-to-br from-fuchsia-300/35 to-amber-200/30 blur-3xl dark:from-fuchsia-600/15 dark:to-amber-500/10" />
          <div className="qb-float absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-linear-to-br from-emerald-300/30 to-sky-200/30 blur-3xl dark:from-emerald-600/15 dark:to-sky-500/10" />
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pt-20 lg:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="qb-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur dark:border-blue-900 dark:bg-slate-900/70 dark:text-blue-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-2 animate-ping rounded-full bg-blue-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                </span>
                問題ブック作成サイト
              </p>

              <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                書いて、すぐ解ける。
                <br />
                <span className="qb-gradient-text">問題ブック</span>をテキストで。
              </h1>

              <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 dark:text-slate-300">
                Markdown 風の記法でブックを書き、そのままブラウザで受験・採点・復習。
                画像・数式・表・選択肢まで 1 つのファイルに。
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/books/new"
                  className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                >
                  ブックを作成する
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
                <SampleStartButton className="rounded-xl border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950" />
                <Link
                  href="/docs/syntax"
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:text-white dark:focus-visible:ring-offset-slate-950"
                >
                  記法を見る
                </Link>
              </div>

              <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
                登録なしでサンプル受験できます · 画像・数式・表に対応
              </p>
            </div>

            {/* ヒーローのデモカード */}
            <div
              className="qb-fade-up relative mx-auto w-full max-w-md"
              style={{ animationDelay: "120ms" }}
            >
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2.5rem] bg-linear-to-tr from-blue-500/20 via-sky-400/10 to-emerald-400/20 blur-2xl"
              />
              <div className="relative rounded-3xl border border-white/70 bg-white/85 p-5 shadow-2xl shadow-blue-900/10 backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:shadow-blue-900/20 dark:border-slate-700/70 dark:bg-slate-900/85">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    練習モード
                  </span>
                  <span className="tabular-nums text-slate-400">問 1 / 5</span>
                </div>

                <p className="mt-5 text-sm font-medium leading-7">
                  聖徳太子が制定した憲法を答えよ。
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border-2 border-blue-500 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100">
                    十七条憲法
                  </span>
                  <span className="qb-pulse inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
                    <span aria-hidden>✓</span> 正解
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs leading-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <strong>◎ 正解</strong> — 604 年に制定された。
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="qb-progress h-full w-1/5 rounded-full bg-linear-to-r from-blue-500 to-emerald-400" />
                  </div>
                  <span className="text-[11px] tabular-nums text-slate-400">20%</span>
                </div>
              </div>

              <div
                aria-hidden
                className="qb-float absolute -left-8 top-16 hidden rounded-xl border border-white/70 bg-white/90 px-3 py-1.5 font-mono text-xs text-slate-600 shadow-lg backdrop-blur sm:block dark:border-slate-700/70 dark:bg-slate-900/90 dark:text-slate-300"
              >
                [[603]]
              </div>
              <div
                aria-hidden
                className="qb-float-slow absolute -right-6 bottom-20 hidden rounded-xl border border-white/70 bg-white/90 px-3 py-1.5 font-mono text-xs text-fuchsia-600 shadow-lg backdrop-blur sm:block dark:border-slate-700/70 dark:bg-slate-900/90 dark:text-fuchsia-300"
              >
                @q … @end
              </div>
              <div
                aria-hidden
                className="qb-float absolute -right-10 top-8 hidden rounded-xl border border-white/70 bg-white/90 px-3 py-1.5 font-mono text-xs text-sky-600 shadow-lg backdrop-blur md:block dark:border-slate-700/70 dark:bg-slate-900/90 dark:text-sky-300"
                style={{ animationDelay: "1.2s" }}
              >
                $$x^2$$
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 記法のティッカー */}
      <section
        aria-label="対応している記法"
        className="qb-marquee-wrap relative overflow-hidden border-y border-slate-200 bg-white/60 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/40"
      >
        <div className="qb-marquee flex w-max">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
              className="flex min-w-[100vw] items-center justify-around"
            >
              {TICKER.map((item) => (
                <li
                  key={item}
                  className="whitespace-nowrap px-4 font-mono text-xs text-slate-500 dark:text-slate-400"
                >
                  {item}
                </li>
              ))}
            </ul>
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-slate-50 dark:from-slate-950"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-slate-50 dark:from-slate-950"
        />
      </section>

      {/* 機能 */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            Features
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
            書く・解く・振り返るを、ひとつに。
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            問題集づくりに必要なものを、1 つのファイルと 1 つの画面にまとめました。
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="qb-fade-up"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <article className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900">
                <div
                  className={`inline-flex size-10 items-center justify-center rounded-xl bg-linear-to-br ${feature.tone} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                >
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {feature.body}
                </p>
              </article>
            </div>
          ))}
        </div>
      </section>

      {/* 書く → 解く */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
        <div className="qb-fade-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            Write &amp; Play
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">書いたら、その場で解ける。</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
            空欄は段落・リスト項目・表の行ごとに 1 問として自動生成。
            まとめたいときは{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] dark:bg-slate-800">
              @q … @end
            </code>{" "}
            で囲みます。
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="qb-fade-up">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-900/20">
              <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-rose-400/80" />
                <span className="size-2.5 rounded-full bg-amber-300/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-500">sample.qb</span>
                <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  QB Markup
                </span>
              </div>
              <pre className="overflow-x-auto p-5 text-[12.5px] leading-7 text-slate-200">
                <code>
                  <span className="text-sky-300"># 第1章 古代</span>
                  {"\n\n"}
                  {"聖徳太子は "}
                  <span className="text-emerald-300">[[603]]</span>
                  {" 年に冠位十二階を制定した。\n\n"}
                  <span className="text-fuchsia-300">@q type=single points=2</span>
                  {"\n"}
                  {"冠位十二階が定められたのは？\n"}
                  <span className="text-amber-300">- [x]</span>
                  {" 603 年\n"}
                  <span className="text-slate-400">- [ ]</span>
                  {" 593 年\n"}
                  <span className="text-fuchsia-300">@end</span>
                  <span className="qb-caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-slate-300" />
                </code>
              </pre>
            </div>
          </div>

          <div className="qb-fade-up" style={{ animationDelay: "120ms" }}>
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  第 2 問 / 全 2 問
                </span>
                <span className="text-xs text-slate-400">2 点</span>
              </div>

              <p className="mt-4 text-sm font-medium">冠位十二階が定められたのは？</p>

              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-[11px] text-white">
                    ✓
                  </span>
                  603 年
                </li>
                <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span className="size-5 rounded-full border border-slate-300 dark:border-slate-600" />
                  593 年
                </li>
              </ul>

              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <strong>◎ 正解</strong> — 603 年に制定された。
              </div>

              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                提出後は得点・正解・解説・復習対象がまとめて表示されます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 ステップ */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
        <div className="qb-fade-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            How it works
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">3 ステップで、公開まで。</h2>
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="qb-fade-up relative rounded-2xl border border-slate-200 bg-white/70 p-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-600 to-sky-400 text-sm font-bold text-white shadow-md shadow-blue-600/20">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* 最後の CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center shadow-2xl shadow-slate-900/30">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="qb-drift absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
            <div className="qb-float-slow absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="qb-grid absolute inset-0 opacity-40" />
          </div>

          <h2 className="relative text-2xl font-bold text-white sm:text-3xl">
            まずはサンプルを解いてみる。
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-300">
            登録は不要です。気に入ったら、自分のブックを作って公開してみてください。
            サンプルの回答はこの端末内にのみ保存されます。
          </p>

          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/books/new"
              className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              ブックを作成する
            </Link>
            <SampleStartButton className="rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900" />
          </div>
        </div>
      </section>
    </div>
  );
}

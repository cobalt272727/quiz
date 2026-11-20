import Link from "next/link";
import { SampleStartButton } from "@/components/SampleStartButton";

const FEATURES = [
  {
    title: "Markdown 風の記法",
    body: "見出し・表・数式・画像に加えて、空欄 [[603]]、選択肢 [[?603 | 593]]、正規表現、数値の許容誤差まで 1 ファイルに書けます。",
  },
  {
    title: "書いた瞬間にプレビュー",
    body: "右ペインで即時プレビュー。エラーは行番号付きで表示され、CodeMirror 上にも波線が出ます。",
  },
  {
    title: "採点・復習まで一画面",
    body: "穴埋め・単一選択・複数選択・正誤・記述(自己採点)に対応。得点と復習対象をその場で確認できます。",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          問題ブック作成サイト
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          書いて、すぐ解ける。
          <br className="sm:hidden" />
          問題ブックをテキストで。
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
          Markdown 風の記法でブックを書き、そのままブラウザで受験・採点・復習できます。
          画像・数式・表・選択肢まで 1 つのファイルに。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/books/new"
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            ブックを作成する
          </Link>
          <SampleStartButton className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" />
          <Link
            href="/docs/syntax"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 underline-offset-4 hover:underline dark:text-slate-300"
          >
            記法を見る
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-sm font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">30 秒でわかる記法</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
          <code>{`聖徳太子は [[603]] 年に冠位十二階を制定した。

@q type=single points=2
冠位十二階が定められたのは？
- [x] 603 年
- [ ] 593 年
@end`}</code>
        </pre>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          空欄は段落・リスト項目・表の行ごとに 1 問として自動生成されます。まとめたいときは
          <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">@q … @end</code>
          で囲みます。
        </p>
      </section>

      <section className="mt-10 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold">現在の実装範囲</h3>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            パーサ・採点・公開射影・エディタ・受験(端末内保存のローカルモード)まで。
            アカウント・共有・画像アップロードは次のフェーズです。
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold">データの扱い</h3>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            ローカルモードでは下書きと回答をこの端末内(localStorage)にのみ保存します。
            サーバ送信は行いません。
          </p>
        </div>
      </section>
    </div>
  );
}

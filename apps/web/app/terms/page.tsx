import type { Metadata } from "next";
import Link from "next/link";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "利用規約",
  description: "問題ブックの利用条件、投稿コンテンツの扱い、禁止事項、アカウント削除について。",
};

const updated = "2026 年 11 月 20 日";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">利用規約</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">最終更新: {updated}</p>
      <p className="mt-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
        この規約は、{serverEnv.operatorName}(以下「運営者」)が提供する「問題ブック」(以下「本サービス」)の
        利用条件を定めるものです。利用者は、本サービスを利用した時点でこの規約に同意したものとみなします。
      </p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">1. アカウント</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>本サービスはログイン ID とパスワードのみで登録します。メールアドレスの登録はありません。</li>
            <li>
              パスワードの管理は利用者の責任で行ってください。忘れた場合の再設定には、登録時に発行される
              リカバリーコードが必要です。コードを失った場合は、運営者が本人確認のうえ一時パスワードを発行することがあります。
            </li>
            <li>アカウントを削除するとログイン ID は解放され、同じ ID を第三者が取得できます。</li>
            <li>利用者は、自己のアカウントを第三者に利用させてはいけません。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">2. 投稿コンテンツ</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>利用者が作成した問題ブック(本文・画像を含む)の著作権は、利用者または正当な権利者に帰属します。</li>
            <li>
              利用者は運営者に対し、本サービスの提供・改善・宣伝に必要な範囲で、投稿コンテンツを
              複製・公開・配信する権利を無償で許諾するものとします。この許諾は、利用者がコンテンツを削除し、
              またはアカウントを削除した時点で、バックアップの保持期間を除いて終了します。
            </li>
            <li>
              第三者の著作物を利用する場合は、利用者自身の責任で権利処理を行ってください。
              公開範囲を「公開」に設定したブックは、誰でも閲覧・受験できます。
            </li>
            <li>
              他の利用者のブックを複製(フォーク)できるのは、作成者が許可した場合に限ります。
              複製したブックの扱いは、複製した利用者の責任となります。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3. 禁止事項</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>法令または公序良俗に違反する行為、違法なコンテンツの投稿</li>
            <li>第三者の著作権・商標権・プライバシー・名誉を侵害する行為</li>
            <li>他の利用者へのなりすまし、アカウントの共有・売買</li>
            <li>
              本サービスの運営を妨害する行為(過度な負荷をかける自動アクセス、脆弱性の探索・悪用、不正アクセス)
            </li>
            <li>本サービスの採点・共有の仕組みを回避する目的での利用</li>
          </ul>
          <p className="mt-2">
            運営者は、違反があったと判断した場合、事前の通知なくブックの非公開化・削除、
            アカウントの停止を行うことがあります。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">4. 受験結果の扱い</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>利用者の個別の回答がブックの作成者に公開されることはありません。作成者が見られるのは匿名の集計値のみです。</li>
            <li>共有リンクを知っている人は、ログインせずに受験できます。共有リンクは作成者がいつでも失効できます。</li>
            <li>
              アカウントを削除した場合、受験結果は個人を特定できない形に匿名化され、
              統計のために保持されます。詳細は
              <Link href="/privacy" className="mx-1 underline">
                プライバシー
              </Link>
              をご覧ください。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">5. サービスの変更・停止</h2>
          <p className="mt-2">
            運営者は、事前の告知なく本サービスの内容を変更し、または提供を停止・終了することがあります。
            保守や障害対応のため、予告なく利用できない時間が生じることがあります。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">6. 免責</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>本サービスの採点結果の正確性、学習効果、データの完全性について、運営者は保証しません。</li>
            <li>運営者は、本サービスの利用により生じた損害について、故意または重過失による場合を除き責任を負いません。</li>
            <li>利用者は、必要なデータを自身でも保管してください。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">7. 規約の変更</h2>
          <p className="mt-2">
            運営者は、必要と判断した場合にこの規約を変更できます。変更後の規約は本ページに掲載した時点から
            効力を生じるものとし、重要な変更は本サービス上で告知します。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">8. お問い合わせ・通報</h2>
          <p className="mt-2">
            権利侵害や規約違反の投稿を見つけた場合は、
            <Link href="/report-abuse" className="mx-1 underline">
              通報ページ
            </Link>
            からご連絡ください。
          </p>
        </section>
      </div>
    </div>
  );
}

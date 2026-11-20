import type { Metadata } from "next";
import Link from "next/link";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "プライバシー",
  description: "問題ブックが取得する情報、利用目的、保存期間、削除の扱いについて。",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">プライバシーについて</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {serverEnv.operatorName} が運営する「問題ブック」の情報の取り扱いをまとめています。
      </p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">1. 取得する情報</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>ログイン ID、パスワードのハッシュ(平文は保存しません)、表示名</li>
            <li>作成したブックの本文・画像・公開範囲・更新履歴</li>
            <li>受験の記録(解答、得点、所要時間、受験日時)。ゲスト受験の場合は端末に保存される資格情報</li>
            <li>通報の内容と対応履歴、管理者の操作ログ</li>
            <li>不正利用の防止のための IP アドレス・ユーザーエージェント(試行制限の判定にのみ使用)</li>
          </ul>
          <p className="mt-2">メールアドレスや電話番号は取得しません。広告・アクセス解析用の外部トラッカーも使用しません。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">2. 利用目的</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>ログイン状態の維持、ブックの保存・共有・受験・採点の提供</li>
            <li>試行制限や通報対応など、サービスの安全な運用</li>
            <li>匿名化した統計(ブックごとの受験者数・平均点など)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3. 回答の公開範囲</h2>
          <p className="mt-2">
            利用者の個別の解答がブックの作成者に公開されることはありません。作成者が参照できるのは、
            受験者数を丸めた匿名の集計値だけです。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">4. 保存期間と削除</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>削除したブックは、誤操作からの復旧のため一定期間(既定 30 日)保持した後に物理削除します。</li>
            <li>
              アカウントを削除すると、パスワード・セッション・リカバリーコード・メンバー関係・ブックマークを削除し、
              所有するブックは削除扱いにします。受験結果は個人を特定できない形に匿名化して保持します。
            </li>
            <li>バックアップに残るデータは、バックアップの保持期間の経過に伴って消滅します。</li>
            <li>通報対応や法令上の要請がある場合は、必要な範囲で記録を保持することがあります。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">5. 安全管理</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>パスワードは scrypt でハッシュ化し、セッション・共有トークン・ゲスト資格情報はハッシュのみを保存します。</li>
            <li>通信は本番環境で HTTPS を用います。</li>
            <li>アップロード画像は再エンコードして保存し、実行可能な形式は受け付けません。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">6. お問い合わせ</h2>
          <p className="mt-2">
            開示・削除等のご相談は
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

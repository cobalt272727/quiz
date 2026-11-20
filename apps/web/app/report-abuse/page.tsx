import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ReportAbuseForm } from "@/components/ReportAbuseForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "通報・お問い合わせ",
  description: "著作権侵害や規約違反の投稿を通報できます。",
};

export default async function ReportAbusePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">通報・お問い合わせ</h1>
      <p className="mt-1 mb-8 text-sm text-slate-500 dark:text-slate-400">
        権利侵害、公序良俗に反する内容、なりすまし、明らかな誤りなどを見つけた場合はお知らせください。
      </p>

      <section className="mb-8 space-y-2 text-sm leading-7 text-slate-700 dark:text-slate-300">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">通報の前に</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            公開ブックのページに「通報」ボタンがあります。対象のブックを開いている場合はそちらからも送信できます。
          </li>
          <li>通報者の情報が、ブックの作成者や他の利用者に伝わることはありません。</li>
          <li>
            対応の結果は個別にお知らせできない場合があります。あらかじめご了承ください。判断の基準は
            <Link href="/terms" className="mx-1 underline">
              利用規約
            </Link>
            をご覧ください。
          </li>
        </ul>
      </section>

      <ReportAbuseForm signedIn={Boolean(user)} />
    </div>
  );
}

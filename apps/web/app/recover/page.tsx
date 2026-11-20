import Link from "next/link";
import { RecoverForm } from "@/components/RecoverForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "パスワードの再設定", robots: { index: false } };

export default function RecoverPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">
        このサービスはメールアドレスを使わないため、登録時に発行したリカバリーコードで再設定します。
        コードを失った場合は、管理者に一時パスワードの発行を依頼してください。
      </p>
      <RecoverForm />
      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </p>
    </div>
  );
}

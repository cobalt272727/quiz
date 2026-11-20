import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/library");
  const { next } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">
        ログインするとブックを保存し、いつでも続きから編集できます。ログインしなくても受験はできます。
      </p>
      <AuthForm next={next && next.startsWith("/") ? next : "/library"} />
      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        <Link href="/" className="underline">
          トップへ戻る
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listAuditLog, listReports } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "管理" };

/** 通報・ユーザー管理(admin のみ) */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">権限がありません</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          このページは管理者のみ利用できます。
        </p>
        <p className="mt-6 text-sm">
          <Link href="/" className="underline">
            トップへ戻る
          </Link>
        </p>
      </div>
    );
  }

  // 未処理と処理済みを切り替えて見られるよう、最近の通報をまとめて渡す
  const [reports, audit] = await Promise.all([
    listReports({ status: "all", limit: 200 }),
    listAuditLog(50),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">管理</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">
        通報の処理・ブックの非公開化・ユーザー停止を行います。すべての操作は操作ログに残ります。
      </p>
      <AdminPanel reports={reports} audit={audit} />
    </div>
  );
}

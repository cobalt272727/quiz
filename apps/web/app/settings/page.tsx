import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { unusedRecoveryCodeCount, RECOVERY_CODE_COUNT } from "@/lib/account";
import { SettingsClient } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "設定", robots: { index: false } };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");

  const remainingCodes = await unusedRecoveryCodeCount(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">設定</h1>
      <p className="mt-1 mb-8 text-sm text-slate-500 dark:text-slate-400">
        アカウントの情報とパスワード、リカバリーコードを管理します。
      </p>
      <SettingsClient
        loginId={user.loginId ?? ""}
        name={user.name}
        mustChangePassword={user.mustChangePassword}
        remainingCodes={remainingCodes}
        totalCodes={RECOVERY_CODE_COUNT}
      />
    </div>
  );
}

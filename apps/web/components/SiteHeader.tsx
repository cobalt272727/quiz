import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SiteNav } from "./SiteNav";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
          問題ブック
        </Link>
        <SiteNav
          user={user ? { name: user.name, loginId: user.loginId, role: user.role } : null}
        />
      </div>
    </header>
  );
}

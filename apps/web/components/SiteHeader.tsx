import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";

const navLink =
  "rounded-lg px-3 py-1.5 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
          問題ブック
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/browse" className={navLink}>
            公開
          </Link>
          <Link href="/library" className={navLink}>
            マイブック
          </Link>
          {user && (
            <Link href="/dashboard" className={navLink}>
              学習
            </Link>
          )}
          <Link href="/docs/syntax" className={navLink}>
            記法
          </Link>
          {user?.role === "admin" && (
            <Link href="/admin" className={navLink}>
              管理
            </Link>
          )}
          {user ? (
            <span className="flex items-center gap-1">
              <Link href="/settings" className={navLink}>
                設定
              </Link>
              <span className="ml-1 max-w-32 truncate text-xs text-slate-500 dark:text-slate-400">
                {user.name || user.loginId}
              </span>
              <LogoutButton />
            </span>
          ) : (
            <Link href="/login" className={navLink}>
              ログイン
            </Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

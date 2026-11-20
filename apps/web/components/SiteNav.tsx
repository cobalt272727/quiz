"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";

type NavUser = {
  name: string | null;
  loginId: string | null;
  role: string;
};

const navLink =
  "rounded-lg px-3 py-1.5 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
const mobileLink =
  "block rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

export function SiteNav({ user }: { user: NavUser | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ページ移動でメニューを閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // デスクトップ幅になったら閉じる
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Escape / 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const items = [
    { href: "/browse", label: "公開", show: true },
    { href: "/library", label: "マイブック", show: true },
    { href: "/dashboard", label: "学習", show: Boolean(user) },
    { href: "/docs/syntax", label: "記法", show: true },
    { href: "/admin", label: "管理", show: user?.role === "admin" },
  ];

  return (
    <>
      <nav
        className="ml-auto hidden items-center gap-1 text-sm md:flex"
        aria-label="メインナビゲーション"
      >
        {items
          .filter((item) => item.show)
          .map((item) => (
            <Link key={item.href} href={item.href} className={navLink}>
              {item.label}
            </Link>
          ))}
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

      <div ref={menuRef} className="relative ml-auto md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          className="rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="size-5"
            aria-hidden="true"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>

        {open && (
          <div
            id="mobile-menu"
            className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-950"
          >
            <nav className="flex flex-col gap-0.5 text-sm" aria-label="モバイルナビゲーション">
              {items
                .filter((item) => item.show)
                .map((item) => (
                  <Link key={item.href} href={item.href} className={mobileLink}>
                    {item.label}
                  </Link>
                ))}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              {user ? (
                <>
                  <Link href="/settings" className={mobileLink}>
                    設定
                  </Link>
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                      {user.name || user.loginId}
                    </span>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <Link href="/login" className={mobileLink}>
                  ログイン
                </Link>
              )}
              <div className="px-3 py-1">
                <ThemeToggle />
              </div>
            </nav>
          </div>
        )}
      </div>
    </>
  );
}

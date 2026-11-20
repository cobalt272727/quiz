"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "qb:theme";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !(dark ?? false);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage が使えない環境ではクラス切り替えのみ
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {dark === null ? "◐" : dark ? "☀" : "☾"}
    </button>
  );
}

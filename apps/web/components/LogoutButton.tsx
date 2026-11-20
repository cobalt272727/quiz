"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg px-3 py-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {busy ? "…" : "ログアウト"}
    </button>
  );
}

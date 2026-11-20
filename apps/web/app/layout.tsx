import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = {
  // OGP の絶対 URL はこの基準から作られる(§8)。本番では APP_URL を必ず設定する
  metadataBase: new URL(serverEnv.appUrl),
  title: {
    default: "問題ブック",
    template: "%s | 問題ブック",
  },
  description:
    "Markdown 風の記法で問題ブックを書いて、そのまま受験・採点・復習できるサービスです。",
  openGraph: {
    type: "website",
    siteName: "問題ブック",
    locale: "ja_JP",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "問題ブック" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          // 初期表示のちらつきを避けるため、描画前にテーマを確定する
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("qb:theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(s==="dark"||(!s&&d)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a className="underline" href="/docs/syntax">
              記法リファレンス
            </a>
            <a className="underline" href="/terms">
              利用規約
            </a>
            <a className="underline" href="/privacy">
              プライバシー
            </a>
            <a className="underline" href="/report-abuse">
              通報
            </a>
          </nav>
          <p className="mt-2">問題ブック</p>
        </footer>
      </body>
    </html>
  );
}

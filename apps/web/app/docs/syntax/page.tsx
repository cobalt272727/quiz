import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, toPublic } from "@qb/parser";
import { AstView } from "@/components/AstView";

export const metadata: Metadata = {
  title: "記法リファレンス",
  description: "問題ブック記法(QB Markup)のリファレンスです。",
};

export default function SyntaxPage() {
  // リポジトリの docs/syntax.md をビルド時に読み、同じ記法パーサで描画する
  const path = join(process.cwd(), "../../docs/syntax.md");
  const raw = readFileSync(path, "utf8");
  const source = raw.startsWith("---")
    ? raw
    : `---\ntitle: QB Markup 記法リファレンス\n---\n\n${raw}`;
  const assetNames = new Set(
    Array.from(source.matchAll(/\(img:([^)\s]+)\)/g)).map((m) => m[1]),
  );
  const parsed = parse(source, { assetNames, allowExternalImages: true });
  const book = toPublic(parsed.ast);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="qb-book">
        <AstView blocks={book.blocks} mode="preview" />
      </div>
      {parsed.hasErrors && (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          参考: このページのソースには記法の例として未解決の画像参照が含まれるため、診断が{" "}
          {parsed.diagnostics.length} 件出ています。
        </p>
      )}
    </div>
  );
}

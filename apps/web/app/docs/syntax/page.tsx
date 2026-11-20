import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, toPublic } from "@qb/parser";
import type { PublicBlock } from "@qb/parser";
import { AstView } from "@/components/AstView";

export const metadata: Metadata = {
  title: "記法リファレンス",
  description: "問題ブック記法(QB Markup)のリファレンスです。",
};

type Heading = Extract<PublicBlock, { type: "heading" }>;

/** 見出しから目次を組み立てる(h2 を大項目、h3 を小項目) */
function TableOfContents({ headings }: { headings: Heading[] }) {
  const groups: Array<{ parent: Heading; children: Heading[] }> = [];
  for (const heading of headings) {
    if (heading.level === 1) continue;
    if (heading.level === 2 || groups.length === 0) {
      groups.push({ parent: heading, children: [] });
      continue;
    }
    groups[groups.length - 1]!.children.push(heading);
  }
  if (groups.length === 0) return null;

  return (
    <nav
      aria-label="目次"
      className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <p className="text-sm font-semibold">目次</p>
      <ul className="mt-2 space-y-1 text-sm">
        {groups.map(({ parent, children }) => (
          <li key={parent.id}>
            <a
              href={`#${parent.id}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {parent.text}
            </a>
            {children.length > 0 && (
              <ul className="mt-1 space-y-1 pl-4">
                {children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={`#${child.id}`}
                      className="text-slate-600 hover:underline dark:text-slate-300"
                    >
                      {child.text}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

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

  const title =
    book.blocks.find((b): b is Heading => b.type === "heading" && b.level === 1) ?? null;
  const content = title ? book.blocks.filter((b) => b !== title) : book.blocks;
  const headings = book.blocks.filter((b): b is Heading => b.type === "heading");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {title && (
        <div className="qb-book">
          <AstView blocks={[title]} mode="preview" />
        </div>
      )}
      <TableOfContents headings={headings} />
      <div className={title ? "qb-book mt-8" : "qb-book"}>
        <AstView blocks={content} mode="preview" />
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

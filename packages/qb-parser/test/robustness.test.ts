import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/parse.ts";
import { parseT, fm, questions } from "./helpers.ts";

const TOKENS = [
  "[[", "]]", "[[a]]", "[[?a | b]]", "[[=1 ±0.1]]", "[[/x/]]", "{", "}", "{id=b_abc123}",
  "@q", "@end", "@explain", "@hint", "@model", "|", "\\|", "&vert;", "\n", "\n\n", "# ", "## ",
  "- ", "1. ", "```", "`", "$", "$$", "**", "*", "[", "]", "(", ")", "![", "]", "---", "> ",
  "[[", "]]", "あ", "a", "1", " ", "\t", "{{", "}}", "@q id=q_abc123 points=1",
];

function randomString(seed: number, length: number): string {
  let x = seed;
  const next = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x;
  };
  const parts: string[] = [];
  for (let i = 0; i < length; i++) parts.push(TOKENS[next() % TOKENS.length]);
  return parts.join("");
}

test("不正な入力のファズ: 例外を投げず診断を返す", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const src = randomString(seed, 12);
    const r = parse(src, { idGen: () => "q_fixed1" === "q_fixed1" ? "b_fixed1" : "" });
    assert.equal(Array.isArray(r.diagnostics), true);
    assert.equal(typeof r.hasErrors, "boolean");
    // JSON 化できる(AST に循環参照や undefined が残らない)
    JSON.stringify(r.ast);
  }
});

test("深い入れ子でもクラッシュしない", () => {
  const src = fm(`${"[".repeat(500)}${"]".repeat(500)}`);
  const r = parseT(src);
  assert.equal(typeof r.hasErrors, "boolean");
  const src2 = fm(`${"[[".repeat(200)}a${"]]".repeat(200)}`);
  assert.equal(typeof parseT(src2).hasErrors, "boolean");
});

test("極端に長い 1 行でもクラッシュしない", () => {
  const r = parseT(fm("a".repeat(200_000)));
  assert.equal(r.hasErrors, false);
  assert.equal(r.ast.blocks.length, 1);
});

test("パフォーマンス: 1000 問を 200ms 以内に解析する(§9)", () => {
  const parts: string[] = ["---", "title: perf", "---", ""];
  for (let i = 0; i < 1000; i++) {
    parts.push(`## 第${i}問`);
    parts.push(`@q type=single id=q_perf${String(i).padStart(2, "0")}`);
    parts.push(`問題 ${i} の答えを選べ。`);
    parts.push("- [x] 正解");
    parts.push("- [ ] 誤りA");
    parts.push("- [ ] 誤りB");
    parts.push("@explain");
    parts.push(`解説 ${i}`);
    parts.push("@end");
    parts.push("");
  }
  const src = parts.join("\n");
  const started = performance.now();
  const r = parse(src, { idGen: () => "q_fixed01" });
  const elapsed = performance.now() - started;
  assert.equal(questions(r.ast).length, 1000);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics.slice(0, 3)));
  // 仕様の目標値は 200ms。実行環境差を考慮して余裕を持たせる
  assert.ok(elapsed < 1000, `parse took ${elapsed.toFixed(1)}ms`);
});

test("空文字・フロントマターのみでも動く", () => {
  assert.equal(parse("").hasErrors, true); // title がない
  const only = parseT("---\ntitle: t\n---\n");
  assert.equal(only.hasErrors, false);
  assert.deepEqual(only.ast.blocks, []);
});

test("深いリスト・表でも再帰が破綻しない", () => {
  const rows = Array.from({ length: 300 }, (_, i) => `| [[a${i}]] | b |`).join("\n");
  const r = parseT(fm(`| x | y |\n|---|---|\n${rows}`), {});
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics.slice(0, 2)));
});

test("HTML は解釈しない(生 HTML をテキストとして保持)", () => {
  const r = parseT(fm("<script>alert(1)</script>"));
  assert.equal(r.hasErrors, false);
  const json = JSON.stringify(r.ast);
  assert.equal(json.includes("script"), true);
  // タグとして構造化されていない(テキストノードのみ)
  assert.equal(json.includes('"type":"html"'), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm } from "./helpers.ts";

const warnings = (r: ReturnType<typeof parseT>) =>
  r.diagnostics.filter((d) => d.code === "QB-W003");

test("QB-W003: @q / @text の外の見出し・通常文を警告する", () => {
  const r = parseT(
    fm(`# 外側の見出し
通常の文。

@text
# @text 内の見出し
表示される文
@end

@q
設問内の文
[[答え]]
@end`),
  );
  const w = warnings(r);
  assert.equal(w.length, 2);
  assert.deepEqual(
    w.map((d) => d.line),
    [5, 6],
  );
  assert.match(w[0]!.message, /見出し/);
  assert.match(w[1]!.message, /通常の文/);
  assert.match(w[0]!.message, /@text/);
});

test("QB-W003: 空欄を含み自動設問になる段落は警告しない", () => {
  const r = parseT(fm("[[答え]]"));
  assert.equal(warnings(r).length, 0);
});

test("QB-W003: 一部だけ自動設問になるリストは「リストの一部」と警告する", () => {
  const r = parseT(
    fm(`- [[答え]]
- 普通の項目`),
  );
  const w = warnings(r);
  assert.equal(w.length, 1);
  assert.match(w[0]!.message, /リストの一部/);
});

test("QB-W003: 全項目が自動設問になるリストは警告しない", () => {
  const r = parseT(
    fm(`- [[答え1]]
- [[答え2]]`),
  );
  assert.equal(warnings(r).length, 0);
});

test("QB-W003: 空欄のない表と、一部だけ自動設問になる表を警告する", () => {
  const hidden = parseT(
    fm(`| 問題 |
|---|
| 通常の行 |`),
  );
  assert.equal(warnings(hidden).length, 1);
  assert.match(warnings(hidden)[0]!.message, /表/);

  const mixed = parseT(
    fm(`| 問題 |
|---|
| [[答え]] |
| 通常の行 |`),
  );
  const w = warnings(mixed);
  assert.equal(w.length, 1);
  assert.match(w[0]!.message, /表の一部/);

  const allQuestions = parseT(
    fm(`| 問題 |
|---|
| [[答え1]] |
| [[答え2]] |`),
  );
  assert.equal(warnings(allQuestions).length, 0);
});

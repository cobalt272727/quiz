import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, codes, fm, hasCode } from "./helpers.ts";

test("既定値: title 以外は spec の既定に従う", () => {
  const r = parseT(fm("# 章\n\n本文", "title: ブック"));
  assert.equal(r.hasErrors, false);
  assert.deepEqual(r.ast.meta, {
    title: "ブック",
    tags: [],
    lang: "ja",
    shuffle: { questions: false, choices: false },
    normalize: { kana: false },
    practiceFeedback: false,
  });
});

test("フロントマターの全項目を読む", () => {
  const src = `---
title: 日本史 基礎
description: 古代〜中世
tags: [history, japan]
lang: en
timeLimit: 600          # 秒
practiceFeedback: true  # 練習モードの即時採点
shuffle: { questions: true, choices: true }
normalize: { kana: true }
---

本文
`;
  const r = parseT(src);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(r.ast.meta.title, "日本史 基礎");
  assert.equal(r.ast.meta.description, "古代〜中世");
  assert.deepEqual(r.ast.meta.tags, ["history", "japan"]);
  assert.equal(r.ast.meta.lang, "en");
  assert.equal(r.ast.meta.timeLimit, 600);
  assert.equal(r.ast.meta.practiceFeedback, true);
  assert.deepEqual(r.ast.meta.shuffle, { questions: true, choices: true });
  assert.deepEqual(r.ast.meta.normalize, { kana: true });
});

test("ブロック形式の tags / shuffle", () => {
  const src = `---
title: t
tags:
  - a
  - b
shuffle:
  questions: true
---
本文
`;
  const r = parseT(src);
  assert.deepEqual(r.ast.meta.tags, ["a", "b"]);
  assert.deepEqual(r.ast.meta.shuffle, { questions: true, choices: false });
});

test("title 欠落はエラー", () => {
  const r = parseT("---\ndescription: x\n---\n本文");
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("未知のフロントマター項目はエラー", () => {
  const r = parseT("---\ntitle: t\nfoo: 1\n---\n本文");
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("timeLimit は正の整数のみ", () => {
  assert.equal(hasCode(parseT("---\ntitle: t\ntimeLimit: 0\n---\nx"), "QB-E010"), true);
  assert.equal(hasCode(parseT("---\ntitle: t\ntimeLimit: 1.5\n---\nx"), "QB-E010"), true);
  assert.equal(hasCode(parseT("---\ntitle: t\ntimeLimit: 600\n---\nx"), "QB-E010"), false);
});

test("本文はフロントマターの後ろから解析される(行番号がずれない)", () => {
  const r = parseT("---\ntitle: t\n---\n\n[[a]]\n");
  assert.equal(r.diagnostics.length > 0, true);
  const w = r.diagnostics.find((d) => d.code === "QB-W001")!;
  assert.equal(w.line, 5);
});

test("CRLF は LF に正規化される(書き戻しは正規化後ソースに対して行う)", () => {
  const r = parseT("---\r\ntitle: t\r\n---\r\n\r\n[[a]]\r\n");
  assert.equal(r.source.includes("\r"), false);
  assert.equal(codes(r).includes("QB-W001"), true);
});

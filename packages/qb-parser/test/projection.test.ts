import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm } from "./helpers.ts";
import { toPublic, toResult } from "../src/project.ts";

const SRC = `---
title: 公開射影テスト
practiceFeedback: true
---

# 章

@q id=q_pub0001 points=2
次の文の空欄を埋めよ。
[[a | b]]{id=b_pub001} [[=3.14 ±0.01]]{id=b_pub002}

| 時代 | 出来事 |
|------|--------|
| 奈良 | [[?大仏造立 \\| 平安遷都]]{id=b_pub003} |
@hint
ヒントです
@explain
解説です
@end

@q type=multi id=q_pub0002
- [x] a
- [ ] b
@end`;

const parse = () => {
  const r = parseT(SRC);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  return r;
};

test("toPublic は正解・解説・模範解答・Matcher を含まない", () => {
  const r = parse();
  const json = JSON.stringify(toPublic(r.ast));
  assert.equal(json.includes('"answers"'), false);
  assert.equal(json.includes('"correct"'), false);
  assert.equal(json.includes('"answer"'), false);
  assert.equal(json.includes('"model"'), false);
  assert.equal(json.includes('"explain"'), false);
});

test("toPublic はヒントと入力種別を残す", () => {
  const r = parse();
  const pub = toPublic(r.ast);
  const json = JSON.stringify(pub);
  assert.equal(json.includes('"hint"'), true);
  assert.equal(json.includes('"input":"text"'), true);
  assert.equal(json.includes('"input":"number"'), true);
});

test("toPublic の選択肢空欄は options を残し correct を落とす", () => {
  const r = parse();
  const json = JSON.stringify(toPublic(r.ast));
  assert.equal(json.includes('"choiceBlank"'), true);
  assert.equal(json.includes('"options":["大仏造立","平安遷都"]'), true);
});

test("toPublic は設問の選択肢から正誤を落とす", () => {
  const r = parse();
  const pub = toPublic(r.ast);
  const q = (pub.blocks.find((b) => b.type === "question" && b.id === "q_pub0002") ?? null) as
    | { choices?: Array<{ id: string }> }
    | null;
  assert.ok(q);
  assert.deepEqual(q!.choices!.map((c) => c.id), ["c1", "c2"]);
  assert.equal("correct" in q!.choices![0], false);
});

test("toPublic は元の AST を変更しない", () => {
  const r = parse();
  const before = JSON.stringify(r.ast);
  toPublic(r.ast);
  assert.equal(JSON.stringify(r.ast), before);
});

test("toResult: exact は許容解答すべて、number は 値 ± 誤差、regex はパターン", () => {
  const r = parseT(fm(`@q id=q_res0001
[[a | b]]{id=b_res001} [[=3.14 ±0.01]]{id=b_res002} [[/^x+$/i]]{id=b_res003}
@end`));
  const result = toResult(r.ast);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].answers, [
    { kind: "exact", blankId: "b_res001", display: ["a", "b"] },
    { kind: "number", blankId: "b_res002", display: ["3.14 ± 0.01"] },
    { kind: "regex", blankId: "b_res003", display: ["/^x+$/i"] },
  ]);
});

test("toResult: 選択肢空欄・single/multi・truefalse・essay", () => {
  const r = parseT(fm(`@q type=multi id=q_res0002
- [x] a
- [ ] b
- [x] c
@end

@q type=truefalse answer=true id=q_res0003
本文
@end

@q type=essay id=q_res0004
説明せよ。
@model
模範解答
@end`));
  const result = toResult(r.ast);
  const multi = result.find((x) => x.questionId === "q_res0002")!;
  assert.deepEqual(multi.answers, [{ kind: "choice", questionId: "q_res0002", display: ["c1", "c3"] }]);
  const tf = result.find((x) => x.questionId === "q_res0003")!;
  assert.deepEqual(tf.answers, [{ kind: "boolean", display: ["true"] }]);
  const essay = result.find((x) => x.questionId === "q_res0004")!;
  assert.deepEqual(essay.answers, [{ kind: "model", display: ["__model__"] }]);
});

test("toResult は Matcher オブジェクトをそのまま返さない", () => {
  const r = parse();
  const json = JSON.stringify(toResult(r.ast));
  assert.equal(json.includes('"kind":"exact","v"'), false);
  assert.equal(json.includes('"pattern"'), false);
});

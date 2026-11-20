import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm, questions } from "./helpers.ts";
import { gradeAttempt, type AnswerInput } from "../src/grade.ts";
import { withinTolerance, centsToString } from "../src/decimal.ts";

function grade(
  src: string,
  answers: Record<string, AnswerInput>,
  opts?: { retiredBlankIds?: string[] },
) {
  const r = parseT(src.startsWith("---") ? src : fm(src), opts);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const qs = questions(r.ast);
  const map = new Map(Object.entries(answers));
  return { result: gradeAttempt(r.ast, qs, map), qs };
}

const blankQ = (inner: string, points = 1) => `@q id=q_grade01 points=${points}\n${inner}\n@end`;

test("自由記述: 前後空白・NFKC・英字大小を無視する", () => {
  const q = blankQ("[[Tokyo]]{id=b_g00001}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00001: "  tokyo  " } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00001: "ＴＯＫＹＯ" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00001: "Tokyo!" } } }).result.score, "0.00");
});

test("内部空白は圧縮しない", () => {
  const q = blankQ("[[New York]]{id=b_g00002}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00002: "New  York" } } }).result.score, "0.00");
});

test("normalize.kana でひらがな/カタカナを同一視する", () => {
  const src = `---
title: t
normalize: { kana: true }
---

${blankQ("[[カタカナ]]{id=b_g00003}")}`;
  assert.equal(grade(src, { "q_grade01": { blanks: { b_g00003: "かたかな" } } }).result.score, "1.00");
  const off = blankQ("[[カタカナ]]{id=b_g00004}");
  assert.equal(grade(off, { "q_grade01": { blanks: { b_g00004: "かたかな" } } }).result.score, "0.00");
});

test("正規表現: 大文字を含むパターンが i フラグで一致する", () => {
  const q = blankQ("[[/^T[oO]kyo$/i]]{id=b_g00005}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00005: "tokyo" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00005: "TOKYO" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00005: "tokyo!" } } }).result.score, "0.00");
});

test("正規表現: 入力長 500 超は不正解(エラーにしない)", () => {
  const q = blankQ("[[/a+/]]{id=b_g00006}");
  const r = grade(q, { "q_grade01": { blanks: { b_g00006: "a".repeat(501) } } });
  assert.equal(r.result.score, "0.00");
});

test("数値: 負数・指数・境界値", () => {
  const q = blankQ("[[=-1.25 ±0.01]]{id=b_g00007}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00007: "-1.25" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00007: "-1.240" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00007: "-1.26" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00007: "-1.261" } } }).result.score, "0.00");

  const exp = blankQ("[[=1.2e-3]]{id=b_g00008}");
  assert.equal(grade(exp, { "q_grade01": { blanks: { b_g00008: "0.0012" } } }).result.score, "1.00");
});

test("数値: 負号の異体字を統一する", () => {
  const q = blankQ("[[=-5]]{id=b_g00009}");
  for (const v of ["−5", "－5", "‐5", "–5"]) {
    assert.equal(grade(q, { "q_grade01": { blanks: { b_g00009: v } } }).result.score, "1.00", v);
  }
});

test("数値: 3 桁区切りカンマのみ許可", () => {
  const q = blankQ("[[=1234.5]]{id=b_g00010}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00010: "1,234.5" } } }).result.score, "1.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00010: "1,5" } } }).result.score, "0.00");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00010: "12,34.5" } } }).result.score, "0.00");
});

test("数値: NaN / Infinity / 単位付き / 空文字は不正解", () => {
  const q = blankQ("[[=10]]{id=b_g00011}");
  for (const v of ["NaN", "Infinity", "-Infinity", "10cm", "", " "]) {
    assert.equal(grade(q, { "q_grade01": { blanks: { b_g00011: v } } }).result.score, "0.00", v);
  }
});

test("配点の按分: 3 空欄均等で全問正解なら満点", () => {
  const q = blankQ("[[a]]{id=b_g00012} [[b]]{id=b_g00013} [[c]]{id=b_g00014}");
  const r = grade(q, { "q_grade01": { blanks: { b_g00012: "a", b_g00013: "b", b_g00014: "c" } } });
  assert.equal(r.result.score, "1.00");
  const blanks = r.result.questions[0].blanks!;
  const sum = blanks.reduce((acc, b) => acc + Math.round(Number(b.points) * 100), 0);
  assert.equal(sum, 100);
});

test("配点の按分: 1/3 正解は 0.33、2/3 は 0.67", () => {
  const q = blankQ("[[a]]{id=b_g00015} [[b]]{id=b_g00016} [[c]]{id=b_g00017}");
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00015: "a" } } }).result.score, "0.33");
  assert.equal(
    grade(q, { "q_grade01": { blanks: { b_g00015: "a", b_g00016: "b" } } }).result.score,
    "0.67",
  );
});

test("配点の按分: 重み w の比で按分する", () => {
  const q = blankQ("[[a]]{id=b_g00018 w=2} [[b]]{id=b_g00019 w=1}", 3);
  // w=2 のみ正解 → 3 * 2/3 = 2.00
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00018: "a" } } }).result.score, "2.00");
  // w=1 のみ正解 → 3 * 1/3 = 1.00
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00019: "b" } } }).result.score, "1.00");
});

test("小数 points の丸めは設問単位で 1 回だけ", () => {
  const q = blankQ("[[a]]{id=b_g00020} [[b]]{id=b_g00021} [[c]]{id=b_g00022}", 0.5);
  // 0.5 * 2/3 = 0.3333… → 0.33
  assert.equal(grade(q, { "q_grade01": { blanks: { b_g00020: "a", b_g00021: "b" } } }).result.score, "0.33");
});

test("single: 正解で満点", () => {
  const src = `@q type=single points=2 id=q_sg0001
- [x] a
- [ ] b
@end`;
  const r = grade(src, { "q_sg0001": { choiceIds: ["c1"] } });
  assert.equal(r.result.score, "2.00");
  assert.equal(r.result.questions[0].correct, true);
  assert.equal(grade(src, { "q_sg0001": { choiceIds: ["c2"] } }).result.score, "0.00");
  assert.equal(grade(src, { "q_sg0001": { choiceIds: ["c1", "c2"] } }).result.score, "0.00");
});

test("multi: 完全一致のみ正解(既定)", () => {
  const src = `@q type=multi points=2 id=q_mg0001
- [x] a
- [x] b
- [ ] c
@end`;
  assert.equal(grade(src, { "q_mg0001": { choiceIds: ["c1", "c2"] } }).result.score, "2.00");
  assert.equal(grade(src, { "q_mg0001": { choiceIds: ["c1"] } }).result.score, "0.00");
  assert.equal(grade(src, { "q_mg0001": { choiceIds: ["c1", "c2", "c3"] } }).result.score, "0.00");
});

test("multi: scoring=partial の部分点(負は 0 に下限)", () => {
  const src = `@q type=multi scoring=partial points=3 id=q_mg0002
- [x] a
- [x] b
- [ ] c
@end`;
  // 2 正解選択 → 2/2 * 3 = 3
  assert.equal(grade(src, { "q_mg0002": { choiceIds: ["c1", "c2"] } }).result.score, "3.00");
  // 1 正解 + 1 誤り → (1-1)/2 * 3 = 0
  assert.equal(grade(src, { "q_mg0002": { choiceIds: ["c1", "c3"] } }).result.score, "0.00");
  // 1 正解のみ → 1/2 * 3 = 1.50
  assert.equal(grade(src, { "q_mg0002": { choiceIds: ["c1"] } }).result.score, "1.50");
});

test("truefalse", () => {
  const src = `@q type=truefalse answer=false id=q_tg0001
冠位十二階は 604 年に制定された。
@end`;
  assert.equal(grade(src, { "q_tg0001": { boolean: false } }).result.score, "1.00");
  assert.equal(grade(src, { "q_tg0001": { boolean: true } }).result.score, "0.00");
  assert.equal(grade(src, {}).result.questions[0].answered, false);
});

test("essay: 自己採点なしは 0 点・未自己採点", () => {
  const src = `@q type=essay points=4 id=q_eg0001
説明せよ。
@model
模範解答
@end`;
  const r = grade(src, { "q_eg0001": { text: "回答" } });
  assert.equal(r.result.score, "0.00");
  assert.equal(r.result.questions[0].selfGraded, false);
  assert.equal(r.result.questions[0].correct, null);
});

test("essay: ◯/△/✕ の自己採点", () => {
  const src = `@q type=essay points=4 id=q_eg0002
説明せよ。
@end`;
  assert.equal(grade(src, { "q_eg0002": { text: "a", selfGrade: "full" } }).result.score, "4.00");
  assert.equal(grade(src, { "q_eg0002": { text: "a", selfGrade: "half" } }).result.score, "2.00");
  assert.equal(grade(src, { "q_eg0002": { text: "a", selfGrade: "none" } }).result.score, "0.00");
});

test("未回答は不正解として扱い、復習対象にする", () => {
  const q = blankQ("[[a]]{id=b_g00023}");
  const r = grade(q, {});
  assert.equal(r.result.score, "0.00");
  assert.equal(r.result.questions[0].answered, false);
  assert.deepEqual(r.result.reviewQuestionIds, ["q_grade01"]);
});

test("部分点の設問も復習対象", () => {
  const q = blankQ("[[a]]{id=b_g00024} [[b]]{id=b_g00025}");
  const r = grade(q, { "q_grade01": { blanks: { b_g00024: "a" } } });
  assert.deepEqual(r.result.reviewQuestionIds, ["q_grade01"]);
});

test("満点なら復習対象ではない", () => {
  const q = blankQ("[[a]]{id=b_g00026}");
  const r = grade(q, { "q_grade01": { blanks: { b_g00026: "a" } } });
  assert.deepEqual(r.result.reviewQuestionIds, []);
});

test("essay は △/✕ のみ復習対象", () => {
  const src = `@q type=essay id=q_eg0003
説明
@end`;
  const full = grade(src, { "q_eg0003": { text: "a", selfGrade: "full" } });
  assert.deepEqual(full.result.reviewQuestionIds, []);
  const half = grade(src, { "q_eg0003": { text: "a", selfGrade: "half" } });
  assert.deepEqual(half.result.reviewQuestionIds, ["q_eg0003"]);
});

test("合計得点と満点の集計", () => {
  const src = `@q points=2 id=q_sum0001
[[a]]{id=b_g00027}
@end

@q type=single points=3 id=q_sum0002
- [x] x
- [ ] y
@end`;
  const r = grade(src, {
    "q_sum0001": { blanks: { b_g00027: "a" } },
    "q_sum0002": { choiceIds: ["c2"] },
  });
  assert.equal(r.result.score, "2.00");
  assert.equal(r.result.maxScore, "5.00");
});

test("数値の許容誤差は境界を含む(decimal の厳密比較)", () => {
  assert.equal(withinTolerance("0.3", "0.1", "0.2"), true);
  // 2 進浮動小数点では誤差が出る比較も、10 進では厳密に判定する
  assert.equal(withinTolerance("0.30000000000000004", "0.1", "0.2"), false);
  assert.equal(withinTolerance("0.30000000000000004", "0.3", "0.0000000000000001"), true);
  assert.equal(withinTolerance("1e309", "1e309", "0"), true);
  assert.equal(centsToString(200n), "2.00");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, questions } from "./helpers.ts";
import { buildGradingSnapshot, gradingKey, needsNewRevision } from "../src/revision.ts";

const Q = `---
title: t
---
@q points=2
日本の首都はどこか。
[[東京 | とうきょう]]
@end
`;

test("採点に影響しない変更ではリビジョンが増えない", () => {
  const a = questions(parseT(Q).ast)[0];
  const b = questions(parseT(Q.replace("日本の首都はどこか。", "日本の首都を答えよ。")).ast)[0];
  assert.equal(gradingKey(a, false), gradingKey(b, false));
});

test("正解を変えるとリビジョンが増える", () => {
  const a = questions(parseT(Q).ast)[0];
  const b = questions(parseT(Q.replace("東京 | とうきょう", "大阪 | おおさか")).ast)[0];
  assert.notEqual(gradingKey(a, false), gradingKey(b, false));
  assert.ok(needsNewRevision(buildGradingSnapshot(a, false), buildGradingSnapshot(b, false)));
});

test("配点・normalize の変更もリビジョン対象", () => {
  const a = questions(parseT(Q).ast)[0];
  assert.notEqual(gradingKey(a, false), gradingKey(a, true));
  const c = questions(parseT(Q.replace("points=2", "points=3")).ast)[0];
  assert.notEqual(gradingKey(a, false), gradingKey(c, false));
});

test("選択肢の正誤と順序の変更を検出する", () => {
  const src = `---
title: t
---
@q type=single
問い
- [x] あ
- [ ] い
@end
`;
  const a = questions(parseT(src).ast)[0];
  const b = questions(parseT(src.replace("- [x] あ", "- [ ] あ").replace("- [ ] い", "- [x] い")).ast)[0];
  assert.notEqual(gradingKey(a, false), gradingKey(b, false));
  // 選択肢の並び替えは本文の変更だが、正解の対応が変わるのでリビジョン対象
  const swapped = `---
title: t
---
@q type=single
問い
- [ ] い
- [x] あ
@end
`;
  const c = questions(parseT(swapped).ast)[0];
  assert.notEqual(gradingKey(a, false), gradingKey(c, false));
});

test("スナップショットは保存できる形(JSON)である", () => {
  const q = questions(parseT(Q).ast)[0];
  const snap = buildGradingSnapshot(q, false);
  assert.equal(snap.kind, "blank");
  assert.equal(snap.points, 2);
  assert.equal(snap.blanks.length, 1);
  assert.deepEqual(snap.blanks[0].matchers.map((m) => m.kind), ["exact", "exact"]);
  assert.ok(JSON.stringify(snap).length > 0);
});

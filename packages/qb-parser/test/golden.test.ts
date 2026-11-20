import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseT, questions } from "./helpers.ts";
import { applyWriteback } from "../src/ids.ts";
import { toPublic } from "../src/project.ts";
import { gradeAttempt } from "../src/grade.ts";
import { saveSource } from "../src/parse.ts";
import { collectBlanks, type Choice, type QuestionBlock, type TableBlock } from "../src/types.ts";

/** SPEC_v4 §4.1 の例(保存前後が混在した形) */
const SPEC_EXAMPLE = `---
title: 日本史 基礎
description: 古代〜中世
tags: [history, japan]
lang: ja
timeLimit: 600
practiceFeedback: true
shuffle: { questions: true, choices: true }
normalize: { kana: false }
---

# 第1章 古代

## 1-1 飛鳥時代

聖徳太子は **[[603]]{id=b_a1c9x2}** 年に冠位十二階を制定した。 {qid=q_m2x7a4}

@q id=q_k3m9p1 points=2
聖徳太子が制定した憲法を答えよ。
[[十七条憲法 | 十七条の憲法 | 17条憲法]]
@explain
604年に制定された。
@end

@q id=q_t7w2d5
冠位十二階が定められたのは [[?603 | 593 | 645 | 701]] 年である。
@end

![法隆寺](img:horyuji.jpg){width=400}

| 時代 | 人物 | 出来事 |
|------|------|--------|
| 飛鳥 | [[蘇我馬子]] | 仏教導入 |
| 奈良 | [[聖武天皇]] | [[?大仏造立 \\| 平安遷都 \\| 承久の乱]] |

@q type=multi id=q_h4n8c3
次のうち室町時代のものをすべて選べ。
- [x] 勘合貿易
- [ ] 墾田永年私財法
- [x] 応仁の乱
@explain
墾田永年私財法は奈良時代。
@end

@q type=truefalse answer=false id=q_r2v6f8
冠位十二階は 604 年に制定された。
@explain
冠位十二階は 603 年。604 年は十七条憲法。
@end
`;

test("仕様書の例: エラーなく解析でき、設問が 7 問になる", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics, null, 2));
  assert.equal(r.ast.meta.title, "日本史 基礎");
  assert.equal(r.ast.meta.tags.length, 2);
  assert.equal(r.ast.meta.timeLimit, 600);
  assert.equal(r.ast.meta.practiceFeedback, true);
  assert.deepEqual(r.ast.meta.shuffle, { questions: true, choices: true });
  assert.equal(questions(r.ast).length, 7);
});

test("仕様書の例: 明示 ID は維持され、未指定 ID だけが書き戻される", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const ids = questions(r.ast).map((q) => q.id);
  for (const id of ["q_m2x7a4", "q_k3m9p1", "q_t7w2d5", "q_h4n8c3", "q_r2v6f8"]) {
    assert.equal(ids.includes(id), true, id);
  }
  // 表の 2 行は qid 未指定なので書き戻し対象
  assert.equal(r.writes.filter((w) => w.text.includes("{qid=")).length, 2);

  const written = applyWriteback(r.source, r.writes);
  const again = parseT(written, { assetNames: ["horyuji.jpg"] });
  assert.equal(again.writes.length, 0);
  assert.deepEqual(questions(again.ast).map((q) => q.id), ids.map((id) => id));
  assert.equal(again.source, written);
});

test("仕様書の例: 自動設問と明示設問の種類", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const list = questions(r.ast);
  const byId = (id: string) => list.find((q) => q.id === id)!;
  assert.equal(byId("q_m2x7a4").auto, true);
  assert.equal(byId("q_k3m9p1").auto, false);
  assert.equal(byId("q_k3m9p1").points, 2);
  assert.equal(byId("q_t7w2d5").kind, "blank");
  assert.equal(byId("q_h4n8c3").kind, "multi");
  assert.equal(byId("q_r2v6f8").kind, "truefalse");
  assert.equal(byId("q_r2v6f8").answer, false);
  assert.equal(byId("q_k3m9p1").explain!.length > 0, true);
});

test("仕様書の例: 表の行が設問になり、ヘッダーを保持する", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const tableQuestions = questions(r.ast).filter((q) => q.body.some((b) => b.type === "table"));
  assert.equal(tableQuestions.length, 2);
  for (const q of tableQuestions) {
    const table = q.body.find((b) => b.type === "table") as TableBlock;
    assert.equal(table.header.length, 3);
    assert.equal(table.rows.length, 1);
  }
  const json = JSON.stringify(tableQuestions);
  assert.equal(json.includes('"t":"choiceBlank"'), true);
});

test("仕様書の例: 選択肢の正解と選択肢空欄の正解", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const multi = questions(r.ast).find((q) => q.id === "q_h4n8c3")!;
  assert.deepEqual(
    multi.choices!.map((c: Choice) => [c.id, c.correct]),
    [
      ["c1", true],
      ["c2", false],
      ["c3", true],
    ],
  );

  const choiceBlank = collectBlanks(questions(r.ast).find((q) => q.id === "q_t7w2d5")!.body)[0];
  assert.equal(choiceBlank.t, "choiceBlank");
  if (choiceBlank.t === "choiceBlank") {
    assert.deepEqual(choiceBlank.options, ["603", "593", "645", "701"]);
    assert.deepEqual(choiceBlank.correct, [0]);
  }
});

test("仕様書の例: 採点できる", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const list = questions(r.ast);
  const answers = new Map([
    [
      "q_m2x7a4",
      { blanks: { b_a1c9x2: "603" } },
    ],
    ["q_k3m9p1", { blanks: { [collectBlanks(list.find((q) => q.id === "q_k3m9p1")!.body)[0].id]: "十七条の憲法" } }],
    ["q_t7w2d5", { blanks: { [collectBlanks(list.find((q) => q.id === "q_t7w2d5")!.body)[0].id]: "0" } }],
    ["q_h4n8c3", { choiceIds: ["c1", "c3"] }],
    ["q_r2v6f8", { boolean: false }],
  ]);
  const result = gradeAttempt(r.ast, list, answers);
  assert.equal(result.maxScore, "8.00"); // 1+2+1+1+1+1+1
  assert.equal(result.score, "6.00");
  assert.equal(result.reviewQuestionIds.length, 2); // 表の 2 行が未回答
});

test("仕様書の例: toPublic に正解が混入しない", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const json = JSON.stringify(toPublic(r.ast));
  assert.equal(json.includes('"answers"'), false);
  assert.equal(json.includes('"correct"'), false);
  assert.equal(json.includes("十七条憲法"), false);
  assert.equal(json.includes("墾田永年私財法は奈良時代"), false);
});

test("仕様書の例: 画像は width を保持する", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const image = r.ast.blocks.find((b) => b.type === "image") as
    | { src?: string; alt: string; width?: number }
    | undefined;
  assert.ok(image);
  assert.equal(image!.alt, "法隆寺");
  assert.equal(image!.width, 400);
  assert.equal(image!.src, "img:horyuji.jpg");
});

test("設問タイプの型が union に正しく収まる(コンパイル時チェック用)", () => {
  const r = parseT(SPEC_EXAMPLE, { assetNames: ["horyuji.jpg"] });
  const q: QuestionBlock = questions(r.ast)[0];
  assert.equal(typeof q.id, "string");
});

test("docs/samples のサンプルブックはすべてエラーなく解析・保存できる", () => {
  const dir = fileURLToPath(new URL("../../../docs/samples/", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".qb"));
  assert.ok(files.length > 0, "サンプルがありません");
  for (const file of files) {
    const source = readFileSync(join(dir, file), "utf8");
    const saved = saveSource(source);
    assert.equal(saved.result.hasErrors, false, `${file}: ${JSON.stringify(saved.result.diagnostics)}`);
    assert.ok(questions(saved.result.ast).length > 0, `${file}: 設問がありません`);
    // 書き戻し後のソースは再保存で変化しない(冪等)
    const again = saveSource(saved.source);
    assert.equal(again.wroteBack, false, `${file}: 書き戻しが冪等ではありません`);
    assert.equal(again.source, saved.source, file);
  }
});

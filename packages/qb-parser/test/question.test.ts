import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm, onlyQuestion, hasCode, questions } from "./helpers.ts";
import type { ListBlock, QuestionBlock, TableBlock } from "../src/types.ts";

const q = (body: string, meta = "title: t") => parseT(fm(body, meta));

test("multi: 選択肢 ID は出現順 c1, c2, …", () => {
  const r = q(`@q type=multi id=q_multi01
次のうち室町時代のものをすべて選べ。
- [x] 勘合貿易
- [ ] 墾田永年私財法
- [x] 応仁の乱
@end`);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const question = onlyQuestion(r);
  assert.equal(question.kind, "multi");
  assert.deepEqual(
    question.choices!.map((c) => [c.id, c.correct]),
    [
      ["c1", true],
      ["c2", false],
      ["c3", true],
    ],
  );
  // 選択肢リストは body から取り除かれる
  assert.equal(question.body.some((b) => b.type === "list"), false);
});

test("single: 正解が 1 つでないと QB-E008", () => {
  const r = q(`@q type=single id=q_single1
- [x] a
- [x] b
@end`);
  assert.equal(hasCode(r, "QB-E008"), true);
});

test("multi: 正解 0 は QB-E008", () => {
  const r = q(`@q type=multi id=q_multi02
- [ ] a
- [ ] b
@end`);
  assert.equal(hasCode(r, "QB-E008"), true);
});

test("single/multi: 選択肢リストがないと QB-E008", () => {
  const r = q(`@q type=single id=q_single2
本文だけ
@end`);
  assert.equal(hasCode(r, "QB-E008"), true);
});

test("truefalse: answer 必須", () => {
  const ok = q(`@q type=truefalse answer=false id=q_tf00001
冠位十二階は 604 年に制定された。
@end`);
  assert.equal(ok.hasErrors, false, JSON.stringify(ok.diagnostics));
  const question = onlyQuestion(ok);
  assert.equal(question.kind, "truefalse");
  assert.equal(question.answer, false);

  assert.equal(hasCode(q(`@q type=truefalse id=q_tf00002\n本文\n@end`), "QB-E008"), true);
  assert.equal(hasCode(q(`@q type=truefalse answer=yes id=q_tf00003\n本文\n@end`), "QB-E010"), true);
});

test("essay: @model / @explain / @hint を読む", () => {
  const r = q(`@q type=essay points=5 tags=a,b id=q_essay01
説明せよ。
@model
模範解答です。
@end`);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const question = onlyQuestion(r);
  assert.equal(question.kind, "essay");
  assert.equal(question.points, 5);
  assert.deepEqual(question.tags, ["a", "b"]);
  assert.equal(question.model![0].type, "paragraph");
});

test("@explain / @hint はそれぞれ独立したセクション", () => {
  const r = q(`@q id=q_secs001
本文 [[a]]
@hint
ヒント
@explain
解説
@end`);
  const question = onlyQuestion(r);
  assert.equal(question.hint!.length, 1);
  assert.equal(question.explain!.length, 1);
});

test("scoring は multi のみ", () => {
  const ok = q(`@q type=multi scoring=partial id=q_multi03
- [x] a
- [ ] b
@end`);
  assert.equal(ok.hasErrors, false, JSON.stringify(ok.diagnostics));
  assert.equal(onlyQuestion(ok).scoring, "partial");
  assert.equal(
    hasCode(q(`@q type=single scoring=partial id=q_single3\n- [x] a\n- [ ] b\n@end`), "QB-E010"),
    true,
  );
  assert.equal(hasCode(q(`@q type=multi scoring=half id=q_multi04\n- [x] a\n@end`), "QB-E010"), true);
});

test("points の範囲は QB-E007", () => {
  assert.equal(hasCode(q(`@q points=0 id=q_p000001\n[[a]]\n@end`), "QB-E007"), true);
  assert.equal(hasCode(q(`@q points=1001 id=q_p000002\n[[a]]\n@end`), "QB-E007"), true);
  assert.equal(hasCode(q(`@q points=abc id=q_p000003\n[[a]]\n@end`), "QB-E007"), true);
});

test("未知の @q 属性・型は QB-E010", () => {
  assert.equal(hasCode(q(`@q foo=1 id=q_x000001\n[[a]]\n@end`), "QB-E010"), true);
  assert.equal(hasCode(q(`@q type=unknown id=q_x000002\n[[a]]\n@end`), "QB-E010"), true);
});

test("@q の入れ子は QB-E010", () => {
  const r = q(`@q id=q_outer01
[[a]]
@q id=q_inner01
[[b]]
@end
@end`);
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("@q の外の @explain は QB-E010", () => {
  assert.equal(hasCode(q("@explain\n解説のみ"), "QB-E010"), true);
});

test("閉じていない @q は QB-E002", () => {
  assert.equal(hasCode(q("@q\n[[a]]"), "QB-E002"), true);
});

test("対応する @q がない @end は QB-E010", () => {
  assert.equal(hasCode(q("@end"), "QB-E010"), true);
});

test("空欄のない type=blank は QB-E008", () => {
  assert.equal(hasCode(q(`@q id=q_blank01\n空欄なし\n@end`), "QB-E008"), true);
});

test("@q で囲んだ表は 1 問のまま", () => {
  const r = q(`@q id=q_tab0001
| a | b |
|---|---|
| [[x]] | [[y]] |
@end`);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const question = onlyQuestion(r);
  const table = question.body[0] as TableBlock;
  assert.equal(table.type, "table");
  assert.equal(table.rows.length, 1);
});

test("見出しは h1〜h3 とアンカー ID", () => {
  const r = parseT(fm("# 章\n## 節\n### 小節\n#### 深い"));
  const headings = r.ast.blocks.filter((b) => b.type === "heading");
  assert.deepEqual(
    headings.map((h) => (h as { level: number }).level),
    [1, 2, 3, 3],
  );
});

test("リスト(番号付き・記号)と継続行", () => {
  const r = parseT(fm("1. 一つ目\n2. 二つ目\n\n- a\n- b"));
  const lists = r.ast.blocks.filter((b) => b.type === "list") as ListBlock[];
  assert.equal(lists.length, 2);
  assert.equal(lists[0].ordered, true);
  assert.equal(lists[1].ordered, false);
  assert.equal(lists[1].items.length, 2);
});

test("画像: img: 参照と width", () => {
  const r = parseT(fm("![法隆寺](img:horyuji.jpg){width=400}"), {
    assetNames: ["horyuji.jpg"],
  });
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const img = r.ast.blocks[0];
  assert.equal(img.type, "image");
  assert.equal((img as { src: string }).src, "img:horyuji.jpg");
  assert.equal((img as { width: number }).width, 400);
});

test("画像: アセット名に空白や括弧を含んでも解析できる", () => {
  const r = parseT(fm("![logo (2)](img:logo (2)){width=120}"), {
    assetNames: ["logo (2)"],
    assetIds: new Map([["logo (2)", "as_1"]]),
  });
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const img = r.ast.blocks[0] as { type: string; assetId?: string; src?: string; width?: number };
  assert.equal(img.type, "image");
  // 解決できた参照は assetId に置き換わる(src は残さない)
  assert.equal(img.assetId, "as_1");
  assert.equal(img.src, undefined);
  assert.equal(img.width, 120);
});

test("画像: 行末に余分な文字があれば画像として扱わない", () => {
  const r = parseT(fm("![x](img:a.png) 追加の文字"), { assetNames: ["a.png"] });
  assert.notEqual(r.ast.blocks[0].type, "image");
});

test("画像: 解決できないアセットは QB-E005", () => {
  const r = parseT(fm("![x](img:missing.png)"), { assetNames: [] });
  assert.equal(hasCode(r, "QB-E005"), true);
});

test("画像: 外部 URL は既定で禁止、許可時は QB-W002", () => {
  const src = fm("![x](https://example.com/a.png)");
  assert.equal(hasCode(parseT(src), "QB-E005"), true);
  const allowed = parseT(src, { allowExternalImages: true });
  assert.equal(hasCode(allowed, "QB-W002"), true);
  assert.equal(allowed.hasErrors, false);
});

test("数式ブロックとコードブロック", () => {
  const r = parseT(fm("$$\nx^2\n$$\n\n```ts\nconst a = 1;\n```"));
  assert.equal(r.ast.blocks[0].type, "math");
  assert.equal((r.ast.blocks[0] as { v: string }).v, "x^2");
  assert.equal(r.ast.blocks[1].type, "code");
  assert.equal((r.ast.blocks[1] as { lang: string }).lang, "ts");
});

test("見出しの下の本文が段落として分かれる", () => {
  const r = parseT(fm("# 章\n\n段落1\n\n段落2"));
  assert.deepEqual(
    r.ast.blocks.map((b) => b.type),
    ["heading", "paragraph", "paragraph"],
  );
});

test("表のセル数不一致は QB-E003", () => {
  const r = parseT(fm("| a | b |\n|---|---|\n| [[x | y]] | z |"));
  assert.equal(hasCode(r, "QB-E003"), true);
});

test("表内の空欄は \\| 区切りで複数の許容解答になる", () => {
  const r = parseT(
    fm("| 時代 | 人物 |\n|------|------|\n| 奈良 | [[聖武天皇 \\| 聖武]] |"),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const question = questions(r.ast)[0];
  const blank = JSON.stringify(question);
  assert.equal(blank.includes('"v":"聖武天皇"'), true);
  assert.equal(blank.includes('"v":"聖武"'), true);
});

test("表内の選択肢空欄", () => {
  const r = parseT(
    fm("| 時代 | 出来事 |\n|------|--------|\n| 奈良 | [[?大仏造立 \\| 平安遷都 \\| 承久の乱]] |"),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(JSON.stringify(r.ast).includes('"t":"choiceBlank"'), true);
});

test("設問の body には段落・表・画像などを含められる", () => {
  const r = q(`@q id=q_body001 points=2
リード文

| x | y |
|---|---|
| [[a]] | b |

![図](img:fig.png){width=200}
@end`, "title: t");
  const question: QuestionBlock = onlyQuestion(parseT(r.source, { assetNames: ["fig.png"] }));
  assert.equal(question.body.some((b) => b.type === "table"), true);
  assert.equal(question.body.some((b) => b.type === "image"), true);
});

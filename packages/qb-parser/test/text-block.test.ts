import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm, questions, hasCode } from "./helpers.ts";
import { collectBlanks } from "../src/types.ts";
import type { Block, TextBlock } from "../src/types.ts";
import { arrangePlayBlocks, toPublic } from "../src/project.ts";

const textBlocks = (blocks: Block[]): TextBlock[] =>
  blocks.filter((b): b is TextBlock => b.type === "text");

test("@text: 中の記法を解釈しつつ空欄・設問を作らない", () => {
  const r = parseT(
    fm(`@text
聖徳太子は **603** 年に [[冠位十二階]]{id=b_abc123} を制定した。 {qid=q_abc123}
- リストも表示される
@end`),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(questions(r.ast).length, 0);
  assert.equal(collectBlanks(r.ast.blocks).length, 0);
  assert.equal(r.writes.length, 0);

  const blocks = textBlocks(r.ast.blocks);
  assert.equal(blocks.length, 1);
  const paragraph = blocks[0]!.body[0]!;
  assert.equal(paragraph.type, "paragraph");
  if (paragraph.type !== "paragraph") return;
  // 太字は解釈される
  assert.equal(paragraph.c.some((i) => i.t === "strong"), true);
  // 空欄・属性は文字として残る
  const text = JSON.stringify(paragraph.c);
  assert.match(text, /\[\[冠位十二階\]\]/);
  assert.match(text, /\{id=b_abc123\}/);
  assert.match(text, /\{qid=q_abc123\}/);
  // リストも本文として残る
  assert.equal(blocks[0]!.body.some((b) => b.type === "list"), true);
});

test("@text: コードブロック内の @end では閉じない", () => {
  const r = parseT(
    fm(`@text
\`\`\`
@end
\`\`\`
本文
@end`),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const blocks = textBlocks(r.ast.blocks);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.body[0]!.type, "code");
  assert.equal(blocks[0]!.body[1]!.type, "paragraph");
});

test("@text: @end がないと QB-E002", () => {
  const r = parseT(fm("@text\n閉じていない\n"));
  assert.equal(hasCode(r, "QB-E002"), true);
});

test("@text: 属性を書くと QB-E010", () => {
  const r = parseT(fm("@text id=x\n本文\n@end"));
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("@text: 中の @q は QB-E010", () => {
  const r = parseT(
    fm(`@text
@q
本文 [[答え]]
@end
@end`),
  );
  assert.equal(hasCode(r, "QB-E010"), true);
  // 表示専用ブロック内の設問は採点対象にしない
  assert.equal(questions(r.ast).length, 0);
});

test("@text: 画像参照をアセット参照として収集する", () => {
  const r = parseT(
    fm(`@text
![図](img:pic.png)
@end`),
    { assetNames: ["pic.png"] },
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.assetRefs, ["pic.png"]);
});

test("arrangePlayBlocks: @text を残し、設問は出題順にスロットへ入る", () => {
  const r = parseT(
    fm(`@text
前書き
@end

@q id=q_first1
[[1]]
@end

@text
中間の本文
@end

@q id=q_second
[[2]]
@end`),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const publicBook = toPublic(r.ast);
  const ids = publicBook.blocks.map((b) => (b.type === "question" ? b.id : b.type));
  assert.deepEqual(ids, ["text", "q_first1", "text", "q_second"]);

  // シャッフルされても @text は位置を保ち、設問だけが入れ替わる
  const arranged = arrangePlayBlocks(publicBook.blocks, ["q_second", "q_first1"]);
  assert.deepEqual(
    arranged.map((b) => (b.type === "question" ? b.id : b.type)),
    ["text", "q_second", "text", "q_first1"],
  );
});

test("arrangePlayBlocks: 出題対象が減っても @text は残る", () => {
  const r = parseT(
    fm(`@text
前書き
@end

@q id=q_first1
[[1]]
@end

@q id=q_second
[[2]]
@end`),
  );
  const publicBook = toPublic(r.ast);
  const arranged = arrangePlayBlocks(publicBook.blocks, ["q_second"]);
  assert.deepEqual(
    arranged.map((b) => (b.type === "question" ? b.id : b.type)),
    ["text", "q_second"],
  );
});

test("@text の外の空欄は従来どおり自動設問になる", () => {
  const r = parseT(fm("外の [[答え]]\n\n@text\n中の [[答え]]\n@end"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(questions(r.ast).length, 1);
  assert.equal(collectBlanks(r.ast.blocks).length, 1);
});

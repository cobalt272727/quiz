import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, fm, questions, hasCode } from "./helpers.ts";
import { parse, saveSource } from "../src/parse.ts";
import { collectBlanks } from "../src/types.ts";
import { applyWriteback } from "../src/ids.ts";

const ids = (r: ReturnType<typeof parseT>) => questions(r.ast).map((q) => q.id);

test("段落の空欄と設問に ID が書き戻される", () => {
  const r = parseT(fm("聖徳太子は [[603]] 年に冠位十二階を制定した。"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const q = questions(r.ast)[0];
  const blank = collectBlanks(q.body)[0];
  const written = applyWriteback(r.source, r.writes);
  assert.equal(written.includes(`{id=${blank.id}}`), true);
  assert.equal(written.includes(`{qid=${q.id}}`), true);
});

test("書き戻しは冪等(2 回目以降は変化しない)", () => {
  const src = fm("[[a]] と [[b]]\n\n@q\n[[c]]\n@end");
  const first = saveSource(src);
  const second = saveSource(first.source);
  assert.equal(second.wroteBack, false);
  assert.equal(second.source, first.source);
  assert.equal(second.result.writes.length, 0);
  assert.deepEqual(ids(second.result), ids(first.result));
});

test("段落の書き戻し位置は段落末尾(末尾の空白の手前)", () => {
  const r = parseT(fm("本文 [[a]]   \n\n次の段落"));
  const written = applyWriteback(r.source, r.writes);
  assert.match(written, /本文 \[\[a\]\]\{id=b_\w+\}\s*\{qid=q_\w+\}   \n/);
});

test("リスト項目は項目ごとに 1 問", () => {
  const r = parseT(fm("- [[a]]\n- [[b]]\n- 空欄なし"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(questions(r.ast).length, 2);
  const written = applyWriteback(r.source, r.writes);
  assert.match(written, /- \[\[a\]\]\{id=b_\w+\} \{qid=q_\w+\}\n/);
});

test("表の行は行ごとに 1 問で、最終セルの末尾に {qid} が入る", () => {
  const src = fm("| 時代 | 人物 |\n|------|------|\n| 飛鳥 | [[蘇我馬子]] |\n| 奈良 | [[聖武天皇]] |");
  const r = parseT(src);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(questions(r.ast).length, 2);
  const written = applyWriteback(r.source, r.writes);
  const line = written.split("\n").find((l) => l.includes("蘇我馬子"))!;
  assert.match(line, /\[\[蘇我馬子\]\]\{id=b_\w+\} \{qid=q_\w+\} \|$/);
});

test("表の見出し行は設問にならず、各行がヘッダーを保持する", () => {
  const r = parseT(fm("| a | b |\n|---|---|\n| [[x]] | y |"));
  const q = questions(r.ast)[0];
  const table = q.body[0];
  assert.equal(table.type, "table");
  if (table.type !== "table") throw new Error("table");
  assert.equal(table.header.length, 2);
  assert.equal(table.rows.length, 1);
});

test("@q に id がない場合は @q の直後に書き戻す", () => {
  const r = parseT(fm("@q points=2\n[[a]]\n@end"));
  const written = applyWriteback(r.source, r.writes);
  assert.match(written, /@q id=q_\w+ points=2/);
});

test("空欄属性がある場合は { } の内側に id を追加する", () => {
  const r = parseT(fm("[[a]]{w=2}"));
  const written = applyWriteback(r.source, r.writes);
  assert.match(written, /\[\[a\]\]\{id=b_\w+ w=2\}/);
  const again = parse(written, { idGen: () => "b_fixed1" });
  assert.equal(again.writes.length, 0);
});

test("退役済み ID の再利用は QB-E011", () => {
  const r = parseT(fm("[[a]]{id=b_retire1}"), { retiredBlankIds: ["b_retire1"] });
  assert.equal(hasCode(r, "QB-E011"), true);
});

test("退役済み設問 ID の再利用は QB-E011", () => {
  const r = parseT(fm("@q id=q_retire1\n[[a]]\n@end"), { retiredQuestionIds: ["q_retire1"] });
  assert.equal(hasCode(r, "QB-E011"), true);
});

test("設問 ID の重複は QB-E001", () => {
  const r = parseT(fm("@q id=q_dupdup1\n[[a]]\n@end\n\n@q id=q_dupdup1\n[[b]]\n@end"));
  assert.equal(hasCode(r, "QB-E001"), true);
});

test("空欄を含まない段落の {qid} は QB-E010", () => {
  const r = parseT(fm("空欄なしの段落 {qid=q_abc123}"));
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("設問ブロック内の {qid} は QB-E010", () => {
  const r = parseT(fm("@q id=q_abc123\n[[a]] {qid=q_xyz789}\n@end"));
  assert.equal(hasCode(r, "QB-E010"), true);
});

test("ID は 6〜16 文字の小文字英数字", () => {
  const r = parseT(fm("[[a]]\n\n[[b]]"));
  const all = questions(r.ast).flatMap((q) => [q.id, ...collectBlanks(q.body).map((b) => b.id)]);
  assert.equal(all.length, 4);
  for (const id of all) assert.match(id, /^[qb]_[a-z0-9]{6,16}$/);
});

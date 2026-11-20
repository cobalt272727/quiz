import { test } from "node:test";
import assert from "node:assert/strict";
import { parseT, firstBlank, hasCode, fm, onlyQuestion } from "./helpers.ts";

const blankOf = (src: string) => {
  const r = parseT(fm(src));
  const b = firstBlank(r.ast);
  return { r, b };
};

test("自由記述空欄: 複数の許容解答", () => {
  const { r, b } = blankOf("[[十七条憲法 | 十七条の憲法 | 17条憲法]]");
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(b!.kind, "blank");
  assert.deepEqual(
    (b!.value as Array<{ kind: string; v: string }>).map((m) => m.v),
    ["十七条憲法", "十七条の憲法", "17条憲法"],
  );
});

test("数値空欄: 値と許容誤差", () => {
  const { r, b } = blankOf("[[=3.14 ±0.01]]");
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.deepEqual(b!.value, [{ kind: "number", v: "3.14", tol: "0.01" }]);
});

test("数値空欄: 許容誤差なし", () => {
  const { b } = blankOf("[[=1.2e-3]]");
  assert.deepEqual(b!.value, [{ kind: "number", v: "1.2e-3" }]);
});

test("数値空欄の構文不正は QB-E009", () => {
  assert.equal(blankOf("[[=abc]]").r.diagnostics.some((d) => d.code === "QB-E009"), true);
  assert.equal(blankOf("[[=1 ±-2]]").r.diagnostics.some((d) => d.code === "QB-E009"), true);
  assert.equal(blankOf("[[=1 ±1 ±2]]").r.diagnostics.some((d) => d.code === "QB-E009"), true);
});

test("正規表現空欄とフラグ", () => {
  const { r, b } = blankOf("[[/^T[oO]kyo$/i]]");
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.deepEqual(b!.value, [{ kind: "regex", pattern: "^T[oO]kyo$", flags: "i" }]);
});

test("RE2 非互換(先読み・後方参照)は QB-E004", () => {
  assert.equal(blankOf("[[/a(?=b)/]]").r.diagnostics.some((d) => d.code === "QB-E004"), true);
  assert.equal(blankOf("[[/(a)\\1/]]").r.diagnostics.some((d) => d.code === "QB-E004"), true);
  assert.equal(blankOf(`[[/${"a".repeat(201)}/]]`).r.diagnostics.some((d) => d.code === "QB-E004"), true);
});

test("選択肢空欄: ? 付きが正解(複数可)", () => {
  const { r, b } = blankOf("[[?603 | ?六〇三 | 593]]");
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const cb = b!.value as { options: string[]; correct: number[] };
  assert.deepEqual(cb.options, ["603", "六〇三", "593"]);
  assert.deepEqual(cb.correct, [0, 1]);
});

test("選択肢空欄: ? 付きが 0 なら自由記述", () => {
  const { b } = blankOf("[[603 | 六〇三 | 593]]");
  assert.equal(b!.kind, "blank");
  assert.deepEqual((b!.value as Array<{ v: string }>).map((m) => m.v), ["603", "六〇三", "593"]);
});

test("選択肢空欄: 先頭の ? を文字として使うには \\? と書く", () => {
  const { b } = blankOf("[[\\?603 | ?593]]");
  const cb = b!.value as { options: string[]; correct: number[] };
  assert.deepEqual(cb.options, ["?603", "593"]);
  assert.deepEqual(cb.correct, [1]);
});

test("&vert; は解答文字列中の | そのもの", () => {
  const { b } = blankOf("[[a&vert;b | c]]");
  assert.deepEqual((b!.value as Array<{ v: string }>).map((m) => m.v), ["a|b", "c"]);
});

test("\\[[ は空欄開始記号のエスケープ(通常テキスト)", () => {
  const r = parseT(fm("これは \\[[603]] という文字列です。"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
  assert.equal(JSON.stringify(r.ast).includes("[[603]]"), true);
});

test("インラインコード内の [[ ]] は解釈しない", () => {
  const r = parseT(fm("コード `[[a]]` と `@q` です。"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
  const p = r.ast.blocks[0];
  assert.equal(p.type, "paragraph");
});

test("フェンスコードブロック内の QB記法は解釈しない", () => {
  const src = fm("```\n[[a]]\n@q\n@end\n```");
  const r = parseT(src);
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
  const block = r.ast.blocks[0];
  assert.equal(block.type, "code");
  assert.equal((block as { v: string }).v, "[[a]]\n@q\n@end");
});

test("数式内の [[ ]] は解釈しない", () => {
  const r = parseT(fm("式 $[[x]]$ と $$[[y]]$$"));
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
});

test("リンクの URL 内の QB記法は解釈しない", () => {
  const r = parseT(fm("[テキスト](https://example.com/[[b]])"));
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
});

test("リンクの表示テキスト内の QB記法は解釈しない", () => {
  const r = parseT(fm("[x [[a]] y](https://example.com)"));
  assert.equal(JSON.stringify(r.ast).includes('"t":"blank"'), false);
});

test("太字・斜体の内部では QB記法を解釈する", () => {
  const { r, b } = blankOf("**[[603]]** と *[[604]]*");
  assert.equal(b !== null, true);
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const json = JSON.stringify(r.ast);
  assert.equal((json.match(/"t":"blank"/g) ?? []).length, 2);
  assert.equal(json.includes('"t":"strong"'), true);
  assert.equal(json.includes('"t":"em"'), true);
});

test("{{ }} は QB-E006", () => {
  const r = parseT(fm("廃止 {{603}} 記法"));
  assert.equal(hasCode(r, "QB-E006"), true);
});

test("閉じていない [[ は QB-E002", () => {
  const r = parseT(fm("ここで [[603 が閉じない"));
  assert.equal(hasCode(r, "QB-E002"), true);
});

test("空欄 ID と重みの属性", () => {
  const r = parseT(fm("[[a]]{id=b_abc123 w=2}"));
  const b = firstBlank(r.ast)!;
  assert.equal(b.id, "b_abc123");
  assert.equal(b.weight, 2);
  // 空欄 ID は確定済み。書き戻しは設問 ID の 1 件のみ
  assert.equal(r.writes.length, 1);
  assert.match(r.writes[0].text, /^\s*\{qid=/);
});

test("ID 形式違反・重み範囲外", () => {
  assert.equal(hasCode(parseT(fm("[[a]]{id=x}")), "QB-E010"), true);
  assert.equal(hasCode(parseT(fm("[[a]]{id=b_abc123 w=0}")), "QB-E007"), true);
  assert.equal(hasCode(parseT(fm("[[a]]{id=b_abc123 w=1001}")), "QB-E007"), true);
  assert.equal(hasCode(parseT(fm("[[a]]{id=b_abc123 z=1}")), "QB-E010"), true);
});

test("ID の重複は QB-E001", () => {
  const r = parseT(fm("[[a]]{id=b_dupdup1}\n\n[[b]]{id=b_dupdup1}"));
  assert.equal(hasCode(r, "QB-E001"), true);
});

test("リンク URL のスキーム検証", () => {
  assert.equal(hasCode(parseT(fm("[x](javascript:alert(1))")), "QB-E012"), true);
  assert.equal(hasCode(parseT(fm("[x](data:text/html,1)")), "QB-E012"), true);
  assert.equal(hasCode(parseT(fm("[x](https://example.com)")), "QB-E012"), false);
  assert.equal(hasCode(parseT(fm("[x](mailto:a@example.com)")), "QB-E012"), false);
  assert.equal(hasCode(parseT(fm("[x](/docs/syntax)")), "QB-E012"), false);
});

test("@q ブロック内の空欄は 1 問にまとまる", () => {
  const r = parseT(
    fm(`@q id=q_aaaaaa
[[a]] と [[b]]
@end`),
  );
  assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
  const q = onlyQuestion(r);
  assert.equal(q.auto, false);
  assert.equal(q.points, 1);
});

test("@q の外の段落で空欄が複数でも 1 問(部分点)", () => {
  const r = parseT(fm("[[a]] と [[b]] と [[c]]"));
  const q = onlyQuestion(r);
  assert.equal(q.auto, true);
});

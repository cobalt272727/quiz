#!/usr/bin/env node
/**
 * QB ファイルの検証 CLI(保存時のサーバ検証と同じ手順をローカルで実行する)
 *
 *   node tools/qb-check.ts docs/samples/nihonshi.qb
 *   node tools/qb-check.ts --writeback docs/samples/nihonshi.qb > out.qb
 *
 * 終了コード: 0 = エラーなし / 1 = エラーあり / 2 = 使い方の誤り
 */

import { readFileSync } from "node:fs";
import { parse, saveSource } from "../packages/qb-parser/src/parse.ts";
import { toPublic } from "../packages/qb-parser/src/project.ts";
import { collectQuestions, collectBlanks } from "../packages/qb-parser/src/types.ts";

const args = process.argv.slice(2);
const writeback = args.includes("--writeback");
const json = args.includes("--json");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("使い方: node tools/qb-check.ts [--writeback] [--json] <file.qb>");
  process.exit(2);
}

const source = readFileSync(file, "utf8");
const saved = writeback ? saveSource(source) : null;
const result = saved ? saved.result : parse(source);

if (json) {
  console.log(
    JSON.stringify(
      {
        hasErrors: result.hasErrors,
        diagnostics: result.diagnostics,
        questions: collectQuestions(result.ast.blocks).length,
        blanks: collectQuestions(result.ast.blocks).reduce((n, q) => n + collectBlanks(q.body).length, 0),
        writes: result.writes.length,
        publicBook: toPublic(result.ast),
      },
      null,
      2,
    ),
  );
} else {
  // 書き戻し結果を stdout に出す場合は、診断と要約を stderr に分離する
  const log = writeback ? console.error : console.log;
  for (const d of result.diagnostics) {
    log(`${d.severity === "error" ? "error" : "warn"} ${d.code} ${d.line}:${d.column} ${d.message}`);
  }
  const qs = collectQuestions(result.ast.blocks);
  const blanks = qs.reduce((n, q) => n + collectBlanks(q.body).length, 0);
  log(
    `${writeback ? "" : "\n"}${file}: 設問 ${qs.length} 件 / 空欄 ${blanks} 件 / 診断 ${result.diagnostics.length} 件` +
      ` / 未確定 ID ${result.writes.length} 件`,
  );
  if (writeback) process.stdout.write(saved!.source);
}

process.exit(result.hasErrors ? 1 : 0);

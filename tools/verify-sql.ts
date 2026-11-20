#!/usr/bin/env node
/**
 * マイグレーション SQL の検証(PGlite = WASM 版 PostgreSQL で実行する)
 *
 *   node tools/verify-sql.ts
 *
 * Docker / 実 PostgreSQL なしで、制約・部分索引・式インデックスの構文と
 * 制約の効き方(重複拒否・NULL の扱い)を確認する。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = "prisma/migrations";

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => {
      const path = join(migrationsDir, name);
      return statSync(path).isDirectory();
    })
    .sort();
}

async function main() {
  const db = new PGlite();
  const files = migrationFiles();
  let failed = false;

  for (const name of files) {
    const sql = readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
    // PGlite には pg_trgm が同梱されていないため、検証時のみ拡張と関連索引を読み飛ばす
    const withoutTrgm = sql
      .replace(/CREATE EXTENSION IF NOT EXISTS pg_trgm;/g, "")
      .replace(/CREATE INDEX "Book_search_trgm_idx"[\s\S]*?;/g, "-- (pg_trgm index skipped in PGlite)");
    try {
      await db.exec(withoutTrgm);
      console.log(`ok   ${name}`);
    } catch (error) {
      failed = true;
      console.error(`fail ${name}`);
      console.error(error instanceof Error ? error.message : error);
    }
  }

  if (failed) process.exit(1);

  // 制約の効き方を確認する(§6.2, §6.3)
  const checks: Array<{ name: string; sql: string; expectError?: boolean }> = [
    {
      name: "lower(loginId) は大文字小文字を区別せず一意",
      sql: `INSERT INTO "User" (id, "loginId", "passwordHash", name, "updatedAt") VALUES ('u1','Alice','h','a', now());`,
    },
    {
      name: "同じ lower(loginId) の重複は拒否",
      sql: `INSERT INTO "User" (id, "loginId", "passwordHash", name, "updatedAt") VALUES ('u2','alice','h','b', now());`,
      expectError: true,
    },
    {
      name: "削除済み(loginId = NULL)は重複できる",
      sql: `INSERT INTO "User" (id, "loginId", "passwordHash", name, "deletedAt", "updatedAt") VALUES ('u3', NULL, 'h', 'c', now(), now()), ('u4', NULL, 'h', 'd', now(), now());`,
    },
  ];

  for (const check of checks) {
    try {
      await db.exec(check.sql);
      if (check.expectError) {
        console.error(`fail ${check.name}(エラーになるはずが成功した)`);
        failed = true;
      } else {
        console.log(`ok   ${check.name}`);
      }
    } catch (error) {
      if (check.expectError) console.log(`ok   ${check.name}`);
      else {
        console.error(`fail ${check.name}: ${error instanceof Error ? error.message : error}`);
        failed = true;
      }
    }
  }

  // Answer の NULLS NOT DISTINCT(blankId IS NULL 同士の重複を拒否)
  await db.exec(`INSERT INTO "Book"(id, "ownerId", title, source, "parserVersion", ast, "updatedAt") VALUES ('b1','u1','t','src','0.1','{}'::jsonb, now());`);
  await db.exec(`INSERT INTO "Attempt"(id, "bookId", "bookVersion", mode, settings, "updatedAt") VALUES ('a1','b1',1,'practice','{}'::jsonb, now());`);
  try {
    await db.exec(`INSERT INTO "Answer"(id, "attemptId", "questionId", "questionRevision", "blankId", value, "updatedAt") VALUES ('an1','a1','q_1',1,NULL,'{}'::jsonb, now()), ('an2','a1','q_1',1,NULL,'{}'::jsonb, now());`);
    console.error("fail Answer の NULLS NOT DISTINCT(重複が通ってしまった)");
    failed = true;
  } catch {
    console.log("ok   Answer の NULLS NOT DISTINCT( blankId = NULL の重複を拒否)");
  }

  await db.close();
  if (failed) process.exit(1);
  console.log("\nSQL 検証: すべて成功");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

/**
 * サーバ採点の正規表現エンジン(RE2)と放置受験の確定を確認する(§4.5, §7.6)
 *
 *   pnpm dev            # 別ターミナル
 *   node --env-file=.env tools/e2e-regex.ts
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const jar = new Map<string, string>();
const guestJar = new Map<string, string>();
const ok = (m: string) => console.log("ok  ", m);
const fail = (m: string) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};

async function call(
  path: string,
  init: RequestInit = {},
  jarRef: Map<string, string> = jar,
) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  headers.set("x-real-ip", FAKE_IP);
  if (jarRef.size) headers.set("cookie", [...jarRef].map(([k, v]) => `${k}=${v}`).join("; "));
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0]!;
    const i = pair.indexOf("=");
    jarRef.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* noop */
  }
  return { status: res.status, json, text };
}

const loginId = `rx_${Date.now().toString(36)}`;
let r = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ loginId, password: "regex-password-123", name: "正規表現" }),
});
if (r.status !== 200) {
  fail(`register ${r.status} ${r.text.slice(0, 120)}`);
  process.exit(1);
}
const userId = r.json.user.id as string;

// バックトラック爆発を起こすパターン(RE2 サブセットとしては合法)
const source = `---
title: 正規表現テスト
timeLimit: 60
---

@q points=2
(a+)+ に一致するか。
[[/(a+)+$/]]
@end

@q points=1
英単語か。
[[/[A-Z][a-z]+/]]
@end
`;
r = await call("/api/books", { method: "POST", body: JSON.stringify({ source, visibility: "public" }) });
if (r.status !== 201) {
  fail(`book 作成 ${r.status} ${r.text.slice(0, 200)}`);
  process.exit(1);
}
const book = r.json.book as { id: string; source: string };
ok("危険なパターンを含むブックを保存できた(サブセット検証を通る)");

r = await call(`/api/books/${book.id}/attempts`, { method: "POST", body: JSON.stringify({}) }, guestJar);
const attemptId = r.json.attemptId as string;

// 空欄 ID はサーバ保存済みソースから取る
const blankIds = [...book.source.matchAll(/\[\[\/(?:[^\]]*)\/\]\]/g)].map((m) => m[0]);
const ids = [...book.source.matchAll(/qb_[a-z0-9]{6,16}|b_[a-z0-9]{6,16}/g)].map((m) => m[0]);
ok(`確定 ID ${ids.length} 件 / 空欄 ${blankIds.length} 件`);

const state = (await call(`/api/attempts/${attemptId}`, {}, guestJar)).json.state as {
  book: { blocks: Array<Record<string, any>> };
  order: string[];
};
const questions = state.book.blocks.filter((b) => b.type === "question") as Array<Record<string, any>>;
if (questions.length !== 2) fail(`設問数が想定と違う: ${questions.length}`);

/** 設問内の空欄 ID を集める */
function blankIdsOf(question: Record<string, any>): string[] {
  const found: string[] = [];
  const inlines = (list: unknown[]) => {
    for (const raw of list as Array<Record<string, any>>) {
      if (raw.t === "blank" || raw.t === "choiceBlank") found.push(String(raw.id));
      else if (Array.isArray(raw.c)) inlines(raw.c);
    }
  };
  const walk = (blocks: unknown[]) => {
    for (const raw of blocks as Array<Record<string, any>>) {
      if (raw.type === "paragraph") inlines(raw.c);
      else if (raw.type === "list") for (const item of raw.items) walk(item);
      else if (raw.type === "table") {
        for (const cell of raw.header) inlines(cell);
        for (const row of raw.rows) for (const cell of row) inlines(cell);
      }
    }
  };
  walk(question.body ?? []);
  return found;
}

const firstBlank = blankIdsOf(questions[0]!)[0];
const secondBlank = blankIdsOf(questions[1]!)[0];
if (!firstBlank || !secondBlank) fail("空欄 ID を取得できない");

// 爆発する入力(40 文字の a + 不一致文字)
const evil = "a".repeat(40) + "!";
let started = Date.now();
r = await call(
  `/api/attempts/${attemptId}/answers`,
  { method: "PUT", body: JSON.stringify({ questionId: questions[0]!.id, blankId: firstBlank, value: { text: evil } }) },
  guestJar,
);
const saveMs = Date.now() - started;
if (r.status !== 200) fail(`回答保存 ${r.status} ${r.text.slice(0, 150)}`);

// 一致する入力(RE2 経由で正解になること)
r = await call(
  `/api/attempts/${attemptId}/answers`,
  { method: "PUT", body: JSON.stringify({ questionId: questions[1]!.id, blankId: secondBlank, value: { text: "Abc" } }) },
  guestJar,
);
if (r.status !== 200) fail(`2 問目の回答保存 ${r.status} ${r.text.slice(0, 150)}`);

started = Date.now();
r = await call(`/api/attempts/${attemptId}`, { method: "POST", body: JSON.stringify({}) }, guestJar);
const submitMs = Date.now() - started;
if (r.status !== 200) {
  fail(`提出 ${r.status} ${r.text.slice(0, 200)}`);
} else {
  const grade = r.json.grade as { questions: Array<{ kind: string; correct: boolean | null }> };
  if (submitMs < 2000) ok(`ReDoS パターンでも採点が ${submitMs}ms で完了(保存 ${saveMs}ms)`);
  else fail(`採点に ${submitMs}ms かかった(RE2 が効いていない可能性)`);
  if (grade.questions[0]?.correct === false) ok("不一致の回答は不正解になる");
  else fail(`採点結果が不正: ${JSON.stringify(grade.questions[0])}`);
  if (grade.questions[1]?.correct === true) ok("一致する回答は正解になる(RE2 経由)");
  else fail(`2 問目が正解にならない: ${JSON.stringify(grade.questions[1])}`);
}

// 放置受験の確定: 期限切れの Attempt を直接作って開く
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const book2 = await prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  const stale = await prisma.attempt.create({
    data: {
      bookId: book2.id,
      bookVersion: book2.version,
      guestTokenHash: null,
      userId,
      mode: "exam",
      settings: { seed: 1, questionIds: [], practiceFeedback: false },
      startedAt: new Date(Date.now() - 3600_000),
      deadlineAt: new Date(Date.now() - 1800_000),
    },
  });
  const res = await call(`/api/attempts/${stale.id}`);
  const after = await prisma.attempt.findUniqueOrThrow({ where: { id: stale.id } });
  if (res.status === 200 && after.status === "expired") {
    ok(`期限切れの放置受験は開いた時点で確定する(status=${after.status})`);
  } else {
    fail(`放置受験が確定しない: http=${res.status} status=${after.status}`);
  }
  if (after.finishedAt) ok("finishedAt が記録される");
  await prisma.attempt.deleteMany({ where: { id: stale.id } });
  await prisma.$disconnect();
}

// 後片付け
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.book.deleteMany({ where: { id: book.id } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

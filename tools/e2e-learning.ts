/**
 * 学習機能(受験履歴・統計・ブックマーク・即時採点・中断・自己採点・結果)の E2E(§7.4-§7.9)
 *
 *   pnpm dev
 *   node --env-file=.env tools/e2e-learning.ts
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const FAKE_IP = `198.18.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
const ok = (m: string) => console.log("ok  ", m);
const fail = (m: string) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};

type Jar = Map<string, string>;

async function call(path: string, init: RequestInit = {}, jar: Jar = new Map()) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  headers.set("x-real-ip", FAKE_IP);
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0]!;
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
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

const stamp = Date.now().toString(36);
const learnerJar: Jar = new Map();
const otherJar: Jar = new Map();

const register = async (jar: Jar, loginId: string, name: string) => {
  const res = await call(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ loginId, password: "learning-password-1", name }) },
    jar,
  );
  if (res.status !== 200) throw new Error(`register ${loginId}: ${res.status} ${res.text.slice(0, 120)}`);
  return res.json.user.id as string;
};

const learnerId = await register(learnerJar, `ln_${stamp}`, "学習者");
const otherId = await register(otherJar, `ot_${stamp}`, "他人");

const source = `---
title: 学習機能テスト
timeLimit: 900
practiceFeedback: true
---

@q points=2
1 + 1 は?
[[2]]
@end

@q type=single points=2
日本の首都は?
- [x] 東京
- [ ] 大阪
@end

@q type=essay points=3
日本の首都の魅力を述べよ。
@model
政治・経済の中心であること。
@end
`;

let r = await call("/api/books", { method: "POST", body: JSON.stringify({ source, visibility: "public" }) }, learnerJar);
if (r.status !== 201) {
  fail(`ブック作成 ${r.status} ${r.text.slice(0, 150)}`);
  process.exit(1);
}
const bookId = r.json.book.id as string;

// --- 練習モードの受験を開始 ---
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({ mode: "practice" }) }, learnerJar);
const attemptId = r.json.attemptId as string;
if (!attemptId) {
  fail(`受験開始 ${r.status} ${r.text.slice(0, 150)}`);
  process.exit(1);
}

const state = (await call(`/api/attempts/${attemptId}`, {}, learnerJar)).json.state;
const blocks = state.book.blocks as Array<Record<string, any>>;
const questions = blocks.filter((b) => b.type === "question");
const blankIdOf = (q: Record<string, any>) => {
  const found: string[] = [];
  const walk = (inlines: any[]) => {
    for (const raw of inlines) {
      if (raw.t === "blank" || raw.t === "choiceBlank") found.push(String(raw.id));
      else if (Array.isArray(raw.c)) walk(raw.c);
    }
  };
  for (const b of q.body ?? []) if (b.type === "paragraph") walk(b.c);
  return found[0]!;
};
const choiceQuestion = questions.find((q) => q.kind === "single");
const essayQuestion = questions.find((q) => q.kind === "essay");
const blankQuestion = questions.find((q) => q.kind === "blank");

// 正解で回答する
await call(
  `/api/attempts/${attemptId}/answers`,
  { method: "PUT", body: JSON.stringify({ questionId: blankQuestion!.id, blankId: blankIdOf(blankQuestion!), value: { text: "2" } }) },
  learnerJar,
);
await call(
  `/api/attempts/${attemptId}/answers`,
  { method: "PUT", body: JSON.stringify({ questionId: choiceQuestion!.id, blankId: null, value: { choiceIds: [choiceQuestion!.choices[0].id] } }) },
  learnerJar,
);
await call(
  `/api/attempts/${attemptId}/answers`,
  { method: "PUT", body: JSON.stringify({ questionId: essayQuestion!.id, blankId: null, value: { text: "政治の中心" } }) },
  learnerJar,
);

// --- 即時採点(§7.7) ---
r = await call(`/api/attempts/${attemptId}/check`, { method: "POST", body: JSON.stringify({ questionId: blankQuestion!.id }) }, learnerJar);
if (r.status === 200 && r.json.question?.correct === true) ok("練習モードで即時採点できる(正解)");
else fail(`check ${r.status} ${r.text.slice(0, 150)}`);
if (Array.isArray(r.json.reveal?.answers) && r.json.reveal.answers.length > 0) ok("check の応答に正解が含まれる");
else fail("check の応答に正解が含まれない");

r = await call(`/api/attempts/${attemptId}/check`, { method: "POST", body: JSON.stringify({ questionId: essayQuestion!.id }) }, learnerJar);
if (r.status === 200 && r.json.reveal?.model) ok("記述式の check で模範解答が返る");
else fail(`essay check ${r.status}`);

// --- 中断(§7.4) ---
r = await call(`/api/attempts/${attemptId}/abandon`, { method: "POST" }, learnerJar);
if (r.status === 200 && r.json.status === "abandoned") ok("受験を中断できる");
else fail(`abandon ${r.status} ${r.text.slice(0, 150)}`);
r = await call(`/api/attempts/${attemptId}/result`, {}, learnerJar);
if (r.status === 409) ok("中断した受験の結果は 409");
else fail(`abandoned の result が 409 にならない: ${r.status}`);
r = await call(`/api/attempts/${attemptId}/check`, { method: "POST", body: JSON.stringify({ questionId: blankQuestion!.id }) }, learnerJar);
if (r.status === 409) ok("中断後の check は 409");
else fail(`abandoned の check が 409 にならない: ${r.status}`);

// --- 本番モード: check は 403 ---
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({ mode: "exam" }) }, learnerJar);
const examAttemptId = r.json.attemptId as string;
r = await call(`/api/attempts/${examAttemptId}/check`, { method: "POST", body: JSON.stringify({ questionId: blankQuestion!.id }) }, learnerJar);
if (r.status === 403) ok("本番モードの check は 403");
else fail(`exam check が 403 にならない: ${r.status}`);

// --- 提出 → 結果 → 自己採点(§7.5, §7.9) ---
for (const [questionId, blankId, value] of [
  [blankQuestion!.id, blankIdOf(blankQuestion!), { text: "2" }],
  [choiceQuestion!.id, null, { choiceIds: [choiceQuestion!.choices[0].id] }],
  [essayQuestion!.id, null, { text: "政治の中心" }],
] as const) {
  await call(
    `/api/attempts/${examAttemptId}/answers`,
    { method: "PUT", body: JSON.stringify({ questionId, blankId, value }) },
    learnerJar,
  );
}

r = await call(`/api/attempts/${examAttemptId}/result`, {}, learnerJar);
if (r.status === 409) ok("未提出の結果取得は 409");
else fail(`in_progress の result が 409 にならない: ${r.status}`);

r = await call(`/api/attempts/${examAttemptId}`, { method: "POST", body: JSON.stringify({}) }, learnerJar);
if (r.status === 200 && r.json.grade) ok("提出して採点できる");
else fail(`submit ${r.status} ${r.text.slice(0, 150)}`);
const submittedScore = r.json.grade.score as string;

r = await call(`/api/attempts/${examAttemptId}/result`, {}, learnerJar);
if (r.status === 200 && Array.isArray(r.json.result?.reveals) && r.json.result.reveals.length === 3) {
  ok("結果 API は正解・解説を含む");
} else fail(`result ${r.status} ${r.text.slice(0, 150)}`);

// essay の自己採点を「◯」に
const before = Number(submittedScore);
r = await call(
  `/api/attempts/${examAttemptId}/self-grade`,
  { method: "POST", body: JSON.stringify({ questionId: essayQuestion!.id, selfGrade: "full" }) },
  learnerJar,
);
if (r.status === 200) ok("提出後に自己採点できる");
else fail(`self-grade ${r.status} ${r.text.slice(0, 150)}`);
const after = Number(r.json.grade?.score ?? "0");
if (after > before) ok(`自己採点で得点が再集計される(${before} → ${after})`);
else fail(`自己採点が得点に反映されない: ${before} → ${after}`);

r = await call(
  `/api/attempts/${examAttemptId}/self-grade`,
  { method: "POST", body: JSON.stringify({ questionId: blankQuestion!.id, selfGrade: "full" }) },
  learnerJar,
);
if (r.status === 400) ok("記述式以外の自己採点は 400");
else fail(`非 essay の self-grade が 400 にならない: ${r.status}`);

// --- 履歴・統計 ---
r = await call("/api/me/attempts?limit=10", {}, learnerJar);
const attempts = (r.json.attempts ?? []) as Array<{ id: string; status: string }>;
if (attempts.length >= 2) ok(`/api/me/attempts に履歴が並ぶ(${attempts.length} 件)`);
else fail(`履歴が足りない: ${attempts.length}`);
if (attempts.some((a) => a.status === "abandoned") && attempts.some((a) => a.status === "submitted")) {
  ok("履歴に中断・提出済みが含まれる");
}

r = await call("/api/me/stats", {}, learnerJar);
const stats = r.json.stats;
if (stats && stats.attempts >= 2 && stats.finished >= 1) {
  ok(`/api/me/stats(受験 ${stats.attempts} / 採点済み ${stats.finished} / 平均 ${stats.averageRate}%)`);
} else fail(`stats ${r.status} ${r.text.slice(0, 150)}`);
if (Array.isArray(stats?.recentDays) && stats.recentDays.length === 30) ok("直近 30 日のバケットがある");

// --- ブックマーク ---
r = await call("/api/me/bookmarks", { method: "PUT", body: JSON.stringify({ bookId }) }, learnerJar);
if (r.status === 200 && r.json.bookmarked) ok("ブックマークを追加できる");
else fail(`bookmark put ${r.status} ${r.text.slice(0, 120)}`);
r = await call("/api/me/bookmarks", { method: "PUT", body: JSON.stringify({ bookId }) }, learnerJar);
if (r.status === 200) ok("ブックマークの追加は冪等");
r = await call("/api/me/bookmarks", {}, learnerJar);
if ((r.json.bookmarks ?? []).some((b: { bookId: string }) => b.bookId === bookId)) ok("一覧に出る");
else fail("ブックマーク一覧に出ない");
r = await call("/api/me/bookmarks", { method: "DELETE", body: JSON.stringify({ bookId }) }, learnerJar);
if (r.status === 200 && r.json.bookmarked === false) ok("ブックマークを解除できる");

// --- 作者向け統計 ---
r = await call(`/api/books/${bookId}/stats`, {}, learnerJar);
if (r.status === 200 && r.json.stats?.attempts >= 2) {
  ok(`/api/books/:id/stats(受験 ${r.json.stats.attempts} / 平均 ${r.json.stats.averageRate}%)`);
} else fail(`book stats ${r.status} ${r.text.slice(0, 150)}`);
r = await call(`/api/books/${bookId}/stats`, {}, otherJar);
if (r.status === 403) ok("他人は作者向け統計を見られない");
else fail(`他人の stats が 403 にならない: ${r.status}`);

// --- ゲスト受験は履歴に出ない ---
const guestJar: Jar = new Map();
const guestAttempt = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({ mode: "practice" }) }, guestJar);
if (guestAttempt.json.attemptId) {
  const mine = await call("/api/me/attempts", {}, learnerJar);
  const ids = (mine.json.attempts ?? []).map((a: { id: string }) => a.id);
  if (!ids.includes(guestAttempt.json.attemptId)) ok("ゲストの受験は本人の履歴に混ざらない");
  else fail("ゲストの受験が他人の履歴に含まれる");
}

// --- 後片付け ---
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.bookmark.deleteMany({ where: { bookId } });
  await prisma.book.deleteMany({ where: { id: bookId } });
  await prisma.user.deleteMany({ where: { id: { in: [learnerId, otherId] } } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

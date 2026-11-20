/**
 * API のエンドツーエンド確認(実 DB + 起動中のサーバ)
 *
 *   pnpm dev            # 別ターミナル
 *   pnpm e2e
 */
import { SAMPLE_SOURCE } from "../apps/web/lib/sample.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
/** 実行ごとに別 IP 扱いにしてレート制限の窓を共有しない */
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const jar = new Map<string, string>();
const ok = (m: string) => console.log("ok  ", m);
const fail = (m: string) => { console.error("FAIL", m); process.exitCode = 1; };

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  headers.set("x-real-ip", FAKE_IP);
  if (jar.size) headers.set("cookie", cookieHeader());
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json: json as Record<string, unknown>, text };
}

const loginId = `e2e_${Date.now().toString(36)}`;
const password = "test-password-123";

let r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ loginId, password, name: "E2E" }) });
if (r.status !== 200) { fail(`register ${r.status} ${r.text.slice(0, 200)}`); process.exit(1); }
ok(`register (${loginId})`);

r = await call("/api/auth/me");
const me = r.json.user as { id: string; loginId: string } | null;
if (!me || me.loginId !== loginId) {
  fail("me がユーザーを返さない");
  process.exit(1);
}
ok("GET /api/auth/me");

// 重複登録は 409
r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ loginId, password }) });
if (r.status === 409) ok("重複 ID は 409"); else fail(`重複登録が ${r.status}`);

// ブック作成(ID 書き戻しが効いているか)
r = await call("/api/books", { method: "POST", body: JSON.stringify({ source: SAMPLE_SOURCE }) });
if (r.status !== 201) { fail(`create ${r.status} ${r.text.slice(0, 300)}`); process.exit(1); }
const created = r.json.book as { id: string; version: number; source: string; wroteBack: boolean; questionCount: number };
ok(`book 作成 v${created.version} 設問 ${created.questionCount} 件 / 書き戻し ${created.wroteBack}`);
const bookId = created.id;

r = await call(`/api/books/${bookId}`);
const fetched = r.json.book as { source: string; version: number };
if (fetched.source !== created.source) fail("返却 source が保存済み source と違う"); else ok("GET /api/books/[id] (owner)");

// 楽観ロック: 古い version での更新は 409
r = await call(`/api/books/${bookId}`, { method: "PUT", body: JSON.stringify({ source: created.source, expectedVersion: 999 }) });
if (r.status === 409) ok("古い version の更新は 409"); else fail(`楽観ロックが効かない (${r.status})`);

// 受験開始(ゲスト扱いにならないこと)
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({ mode: "practice" }) });
if (r.status !== 201) { fail(`attempt 開始 ${r.status} ${r.text.slice(0, 200)}`); process.exit(1); }
const attemptId = r.json.attemptId as string;
ok(`attempt 開始 ${attemptId}`);

r = await call(`/api/attempts/${attemptId}`);
const state = r.json.state as {
  order: string[];
  answers: Record<string, unknown>;
  book: { blocks: Array<{ type: string; id: string; kind?: string; choices?: Array<{ id: string; label: unknown[] }> }> };
  attempt: { status: string };
};
if (!state || state.attempt.status !== "in_progress") fail("受験状態が in_progress でない"); else ok(`受験状態 取得(設問 ${state.order.length} 件)`);
const leaked = JSON.stringify(state).includes('"answers":[') && JSON.stringify(state).includes("matchers");
if (leaked) fail("未提出の状態に正解情報が混ざっている"); else ok("未提出の状態に正解・解説が含まれない");

// 全設問に回答する(選択肢は先頭、記述はダミー)
const blocks = state.book.blocks.filter((b) => b.type === "question");
let answered = 0;
for (const q of blocks) {
  const body = (() => {
    switch (q.kind) {
      case "single":
      case "multi":
        return { questionId: q.id, blankId: null, value: { choiceIds: [q.choices?.[0]?.id ?? "c1"] } };
      case "truefalse":
        return { questionId: q.id, blankId: null, value: { boolean: true } };
      case "essay":
        return { questionId: q.id, blankId: null, value: { text: "記述の回答" } };
      default:
        return null;
    }
  })();
  if (body) {
    const res = await call(`/api/attempts/${attemptId}/answers`, { method: "PUT", body: JSON.stringify(body) });
    if (res.status !== 200) fail(`回答保存 ${q.id} ${res.status} ${res.text.slice(0, 150)}`);
    else answered += 1;
  }
}
ok(`設問単位の回答を保存(${answered} 件)`);

// 空欄は blankId 付きで保存する
const blankIds = [...new Set([...created.source.matchAll(/qb_[a-z0-9]{6,16}/g)].map((m) => m[0]))];
ok(`ソース内の確定 ID ${blankIds.length} 件`);

// 提出して採点
r = await call(`/api/attempts/${attemptId}`, { method: "POST", body: JSON.stringify({}) });
if (r.status !== 200) { fail(`提出 ${r.status} ${r.text.slice(0, 300)}`); process.exit(1); }
const grade = r.json.grade as { score: string; maxScore: string; reviewQuestionIds: string[] };
const reveals = r.json.reveals as Array<{ questionId: string; answers: unknown[] }>;
ok(`採点 ${grade.score} / ${grade.maxScore} (復習 ${grade.reviewQuestionIds.length} 問, 正解表示 ${reveals.length} 件)`);

// 提出後は回答を変更できない
r = await call(`/api/attempts/${attemptId}/answers`, {
  method: "PUT",
  body: JSON.stringify({ questionId: blocks[0]!.id, blankId: null, value: { text: "x" } }),
});
if (r.status === 409) ok("提出後の回答変更は 409"); else fail(`提出後の変更が ${r.status}`);

// 提出後の再取得は結果を含む
r = await call(`/api/attempts/${attemptId}`);
const after = r.json.state as { result?: { grade: { score: string } } };
if (after.result?.grade.score === grade.score) ok(`結果の再取得 score=${after.result.grade.score}`);
else fail("結果が再取得できない");

// 他人のブックは見えない
r = await call(`/api/books/${bookId}`);
ok(`(owner 取得 ${r.status})`);


// 後片付け(作成したブックとユーザーを消す)
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.book.deleteMany({ where: { id: bookId } });
  await prisma.user.deleteMany({ where: { id: me.id } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

console.log("\nユーザー:", loginId, "ブック:", bookId);

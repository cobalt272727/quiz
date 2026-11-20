/**
 * 通報・管理(非公開化・ユーザー停止・監査ログ)の E2E(§7.1, §7.2, §6.1)
 *
 *   pnpm dev
 *   node --env-file=.env tools/e2e-admin.ts
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const FAKE_IP = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
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
const authorJar: Jar = new Map();
const reporterJar: Jar = new Map();
const adminJar: Jar = new Map();

const register = async (jar: Jar, loginId: string, name: string) => {
  const body = JSON.stringify({ loginId, password: "admin-test-password-1", name });
  const res = await call("/api/auth/register", { method: "POST", body }, jar);
  if (res.status !== 200) throw new Error(`register ${loginId} → ${res.status} ${res.text.slice(0, 120)}`);
  return res.json.user.id as string;
};

const authorId = await register(authorJar, `au_${stamp}`, "作者");
const reporterId = await register(reporterJar, `rp_${stamp}`, "通報者");
const adminId = await register(adminJar, `ad_${stamp}`, "管理者");

const source = `---
title: 通報テスト
timeLimit: 600
---

@q points=1
1 + 1 は?
[[2]]
@end
`;

let r = await call(
  "/api/books",
  { method: "POST", body: JSON.stringify({ source, visibility: "public" }) },
  authorJar,
);
if (r.status !== 201) {
  fail(`公開ブック作成 ${r.status}`);
  process.exit(1);
}
const bookId = r.json.book.id as string;

// 管理者ロールを付与(SQL 直接。ツールと同じ経路)
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.user.update({ where: { id: adminId }, data: { role: "admin" } });
  await prisma.$disconnect();
}
ok("管理者ロールを付与");

// --- 通報 ---
r = await call("/api/reports", { method: "POST", body: JSON.stringify({ bookId, reason: "権利侵害の疑い" }) }, reporterJar);
if (r.status === 201) ok("ログインユーザーが通報できる");
else fail(`通報 ${r.status} ${r.text.slice(0, 150)}`);
const reportId = r.json.report?.id as string;

r = await call("/api/reports", { method: "POST", body: JSON.stringify({ bookId, reason: "再送" }) }, reporterJar);
if (r.status === 409) ok("同じ人の未処理の重複通報は 409");
else fail(`重複通報が 409 にならない: ${r.status}`);

r = await call("/api/reports", { method: "POST", body: JSON.stringify({ bookId, reason: "未ログイン" }) });
if (r.status === 401) ok("未ログインでは通報できない");
else fail(`未ログイン通報が 401 にならない: ${r.status}`);

// --- 権限 ---
r = await call("/api/admin/reports", {}, reporterJar);
if (r.status === 403) ok("一般ユーザーは /api/admin/reports を読めない");
else fail(`一般ユーザーの管理 API が 403 にならない: ${r.status}`);

r = await call("/api/admin/books/" + bookId + "/hide", {
  method: "PATCH",
  body: JSON.stringify({ hiddenByAdmin: true }),
}, reporterJar);
if (r.status === 403) ok("一般ユーザーは非公開化できない");
else fail(`一般ユーザーの非公開化が 403 にならない: ${r.status}`);

r = await call("/api/admin/reports?status=open", {}, adminJar);
if (r.status === 200 && r.json.reports.some((x: { id: string }) => x.id === reportId)) {
  ok("管理者は通報一覧を取得できる");
} else fail(`通報一覧 ${r.status} ${r.text.slice(0, 150)}`);

// --- 受験中に非公開化 → Attempt 中断 ---
const guestJar: Jar = new Map();
r = await call("/api/books/" + bookId + "/attempts", { method: "POST", body: JSON.stringify({}) }, guestJar);
const attemptId = r.json.attemptId as string;
if (!attemptId) fail(`受験開始に失敗: ${r.status}`);

r = await call("/api/admin/books/" + bookId + "/hide", {
  method: "PATCH",
  body: JSON.stringify({ hiddenByAdmin: true, stopExistingAttempts: true, reason: "通報対応" }),
}, adminJar);
if (r.status === 200 && r.json.abandonedAttempts === 1) {
  ok(`非公開化で開始済みの受験を中断(${r.json.abandonedAttempts} 件)`);
} else fail(`非公開化 ${r.status} ${r.text.slice(0, 150)}`);

r = await call("/api/attempts/" + attemptId, {}, guestJar);
if (r.status === 200 && r.json.state?.attempt?.status === "abandoned") {
  ok("中断された受験は abandoned になる");
} else fail(`中断状態が反映されない: ${r.status} ${r.text.slice(0, 120)}`);

r = await call("/api/books/" + bookId + "/attempts", { method: "POST", body: JSON.stringify({}) }, new Map());
if (r.status === 403 || r.status === 404) ok(`非公開化後は新規受験できない(${r.status})`);
else fail(`非公開化後も受験できる: ${r.status}`);

r = await call("/api/books?scope=public&q=通報テスト");
if (!r.json.books.some((b: { id: string }) => b.id === bookId)) ok("公開ライブラリから消える");
else fail("非公開化後も公開ライブラリに出ている");

r = await call("/api/books/" + bookId, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, source }) }, authorJar);
if (r.status === 403) ok("非公開化されたブックは作者も編集できない");
else fail(`作者の編集が 403 にならない: ${r.status}`);

r = await call("/api/admin/reports/" + reportId, {
  method: "PATCH",
  body: JSON.stringify({ status: "resolved", reason: "非公開にしました" }),
}, adminJar);
if (r.status === 200 && r.json.report.status === "resolved") ok("通報を解決できる");
else fail(`通報の処理 ${r.status} ${r.text.slice(0, 150)}`);

// 解決済みは既定の一覧(未処理)から消える
r = await call("/admin", {}, adminJar);
{
  const html = r.text.replace(/<script[\s\S]*?<\/script>/g, "");
  if (r.status === 200 && !html.includes("権利侵害の疑い")) {
    ok("解決した通報は管理画面の既定一覧に出ない");
  } else {
    fail(`解決済みの通報が既定一覧に残る (http=${r.status})`);
  }
  if (/未処理 0/.test(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))) {
    ok("未処理の件数が 0 になる");
  } else fail("未処理の件数表示が更新されない");
}

// --- 非公開の解除 ---
r = await call("/api/admin/books/" + bookId + "/hide", {
  method: "PATCH",
  body: JSON.stringify({ hiddenByAdmin: false }),
}, adminJar);
if (r.status === 200) ok("非公開を解除できる");
else fail(`非公開解除 ${r.status}`);

r = await call("/api/books?scope=public&q=通報テスト");
if (r.json.books.some((b: { id: string }) => b.id === bookId)) ok("解除すると公開ライブラリに戻る");
else fail("解除後も公開ライブラリに出ない");

// --- ユーザー停止 ---
r = await call("/api/admin/users/" + authorId + "/suspend", {
  method: "PATCH",
  body: JSON.stringify({ suspended: true, reason: "規約違反" }),
}, adminJar);
if (r.status === 200) ok("ユーザーを停止できる");
else fail(`停止 ${r.status} ${r.text.slice(0, 150)}`);

r = await call("/api/auth/me", {}, authorJar);
if (r.status === 200 && r.json.user === null) ok("停止されたユーザーの既存セッションは無効になる");
else fail(`停止後もセッションが有効: ${r.status} ${r.text.slice(0, 100)}`);

r = await call("/api/books", { method: "POST", body: JSON.stringify({ source }) }, authorJar);
if (r.status === 401) ok("停止されたユーザーは API を利用できない");
else fail(`停止後も API が使える: ${r.status}`);

r = await call("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ loginId: `au_${stamp}`, password: "admin-test-password-1" }),
}, new Map());
if (r.status === 401 || r.status === 403) ok(`停止されたユーザーはログインできない(${r.status})`);
else fail(`停止されたユーザーがログインできた: ${r.status}`);

const adminSelf = await call("/api/admin/users/" + adminId + "/suspend", {
  method: "PATCH",
  body: JSON.stringify({ suspended: true }),
}, adminJar);
if (adminSelf.status === 403) ok("管理者自身は停止できない");
else fail(`自己停止が 403 にならない: ${adminSelf.status}`);

r = await call("/api/admin/users/" + authorId + "/suspend", {
  method: "PATCH",
  body: JSON.stringify({ suspended: false }),
}, adminJar);
if (r.status === 200) ok("停止を解除できる");
else fail(`停止解除 ${r.status}`);

r = await call("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ loginId: `au_${stamp}`, password: "admin-test-password-1" }),
}, new Map());
if (r.status === 200) ok("解除後はログインできる");
else fail(`解除後もログインできない: ${r.status}`);

// --- 監査ログ ---
r = await call("/api/admin/audit?limit=50", {}, adminJar);
const actions = (r.json.entries ?? []).map((e: { action: string }) => e.action) as string[];
for (const [action, label] of [
  ["book.hide", "非公開化"],
  ["book.unhide", "非公開解除"],
  ["report.resolve", "通報の解決"],
  ["user.suspend", "ユーザー停止"],
  ["user.unsuspend", "停止解除"],
] as const) {
  if (actions.includes(action)) ok(`監査ログに ${label}(${action})が残る`);
  else fail(`監査ログに ${action} が無い`);
}
const text = JSON.stringify(r.json.entries ?? []);
if (!/admin-test-password-1/.test(text)) ok("監査ログにパスワードは含まれない");
else fail("監査ログにパスワードらしき文字列が含まれる");

// --- 後片付け ---
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const ids = [authorId, reporterId, adminId];
  await prisma.adminAuditLog.deleteMany({ where: { adminUserId: { in: ids } } });
  await prisma.book.deleteMany({ where: { id: bookId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

void reporterId;

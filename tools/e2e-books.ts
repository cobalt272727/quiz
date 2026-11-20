/**
 * ブック管理(履歴・復元、フォーク、共同編集、書き出し/取り込み、検証 API)の E2E(§3.3, §3.5, §7.1, §7.2)
 *
 *   pnpm dev
 *   node --env-file=.env tools/e2e-books.ts
 */
import { unzipSync, zipSync, strToU8 } from "fflate";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const FAKE_IP = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
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
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString("utf8");
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* noop */
  }
  return { status: res.status, json, text, buffer, headers: res.headers };
}

const stamp = Date.now().toString(36);
const ownerJar: Jar = new Map();
const editorJar: Jar = new Map();
const viewerJar: Jar = new Map();

const register = async (jar: Jar, loginId: string, name: string) => {
  const res = await call(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ loginId, password: "books-password-1", name }) },
    jar,
  );
  if (res.status !== 200) throw new Error(`register ${loginId}: ${res.status}`);
  return res.json.user.id as string;
};

const ownerId = await register(ownerJar, `bo_${stamp}`, "所有者");
const editorId = await register(editorJar, `be_${stamp}`, "編集者");
const viewerId = await register(viewerJar, `bv_${stamp}`, "閲覧者");

const v1Source = `---
title: 管理テスト
timeLimit: 600
---

@q points=1
初版の問題。
[[1]]
@end
`;

let r = await call("/api/books", { method: "POST", body: JSON.stringify({ source: v1Source }) }, ownerJar);
if (r.status !== 201) {
  fail(`ブック作成 ${r.status}`);
  process.exit(1);
}
const bookId = r.json.book.id as string;
/** サーバが ID を書き戻した本文(クライアントはこれを次の保存に使う。§7.3) */
const v1 = r.json.book.source as string;
const v2 = `${v1}
@q points=1
2 版目で追加した問題。
[[2]]
@end
`;

// --- 履歴と復元 ---
r = await call(`/api/books/${bookId}`, { method: "PUT", body: JSON.stringify({ source: v2, expectedVersion: 1 }) }, ownerJar);
if (r.status === 200) ok("2 版目を保存できる");
const version2 = r.json.book.version as number;

r = await call(`/api/books/${bookId}/versions`, {}, ownerJar);
const versions = (r.json.versions ?? []) as Array<{ version: number; questionCount: number }>;
if (r.status === 200 && versions.length === 2) ok(`履歴が 2 件返る(v${versions[0]?.version} → v${versions[1]?.version})`);
else fail(`履歴 ${r.status} ${r.text.slice(0, 150)}`);
if (versions[0]?.questionCount === 2 && versions[1]?.questionCount === 1) {
  ok("履歴の設問数が版ごとに正しい(2 件 / 1 件)");
}

r = await call(`/api/books/${bookId}/versions/1/restore`, {
  method: "POST",
  body: JSON.stringify({ expectedVersion: version2 }),
}, ownerJar);
if (r.status === 200 && r.json.book.version === version2 + 1) {
  ok(`v1 を v${r.json.book.version} として復元できる`);
} else fail(`restore ${r.status} ${r.text.slice(0, 150)}`);
if (r.json.book?.source && !r.json.book.source.includes("2 版目で追加")) ok("復元後の source は v1 の内容");
else fail("復元後の source が v1 になっていない");

r = await call(`/api/books/${bookId}/versions/1/restore`, {
  method: "POST",
  body: JSON.stringify({ expectedVersion: version2 }),
}, ownerJar);
if (r.status === 409) ok("古い expectedVersion での復元は 409");
else fail(`復元の楽観ロックが効かない: ${r.status}`);

r = await call(`/api/books/${bookId}/versions`, {}, editorJar);
if (r.status === 404) ok("メンバーでない人は履歴を見られない");
else fail(`他人の履歴が ${r.status} で見える`);

// --- 画像つきで公開・フォーク ---
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const form = new FormData();
form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "dot.png");
const upload = await fetch(`${BASE}/api/books/${bookId}/assets`, {
  method: "POST",
  headers: { origin: BASE, cookie: `qb_session=${ownerJar.get("qb_session")}` },
  body: form,
});
if (upload.status === 201) ok("画像をアップロードできる");
else fail(`アップロード ${upload.status}`);

r = await call(`/api/books/${bookId}/share`, {
  method: "PUT",
  body: JSON.stringify({ visibility: "public" }),
}, ownerJar);
if (r.status === 400) ok("著作権確認なしの公開は 400");
else fail(`同意なしの公開が 400 にならない: ${r.status}`);

r = await call(`/api/books/${bookId}/share`, {
  method: "PUT",
  body: JSON.stringify({ visibility: "public", copyrightConsent: true, allowFork: true }),
}, ownerJar);
if (r.status === 200) ok("著作権確認つきで公開できる");
else fail(`公開 ${r.status} ${r.text.slice(0, 150)}`);

r = await call(`/api/books/${bookId}/fork`, { method: "POST" }, editorJar);
if (r.status === 201 && r.json.book?.id) ok("公開 + フォーク許可のブックを複製できる");
else fail(`fork ${r.status} ${r.text.slice(0, 150)}`);
const forkId = r.json.book?.id as string;
if (forkId) {
  const forked = await call(`/api/books/${forkId}`, {}, editorJar);
  if (forked.json.book?.title?.includes("のコピー")) ok(`複製のタイトルは「${forked.json.book.title}」`);
  else fail(`複製のタイトルが想定と違う: ${forked.json.book?.title}`);
  const assets = await call(`/api/books/${forkId}/assets`, {}, editorJar);
  if ((assets.json.assets ?? []).length === 1) ok("画像も複製される");
  else fail(`複製の画像数が ${(assets.json.assets ?? []).length}`);
}

r = await call("/api/books", { method: "POST", body: JSON.stringify({ source: v1Source }) }, ownerJar);
const privateBookId = r.json.book.id as string;
r = await call(`/api/books/${privateBookId}/fork`, { method: "POST" }, editorJar);
if (r.status === 403) ok("非公開 + フォーク不可のブックは複製できない");
else fail(`非公開ブックの fork が 403 にならない: ${r.status}`);

// --- 共同編集 ---
r = await call(`/api/books/${bookId}/members`, {
  method: "POST",
  body: JSON.stringify({ loginId: `be_${stamp}`, role: "editor" }),
}, ownerJar);
if (r.status === 201) ok("編集者を招待できる");
else fail(`member add ${r.status} ${r.text.slice(0, 150)}`);

r = await call(`/api/books/${bookId}/members`, {
  method: "POST",
  body: JSON.stringify({ loginId: `bv_${stamp}`, role: "viewer" }),
}, ownerJar);
if (r.status === 201) ok("閲覧者を招待できる");

r = await call(`/api/books/${bookId}/members`, {
  method: "POST",
  body: JSON.stringify({ loginId: `be_${stamp}`, role: "editor" }),
}, ownerJar);
if (r.status === 409) ok("同じ人の二重招待は 409");

r = await call(`/api/books/${bookId}/members`, {
  method: "POST",
  body: JSON.stringify({ loginId: `be_${stamp}`, role: "editor" }),
}, editorJar);
if (r.status === 403) ok("編集者はメンバーを追加できない");

r = await call(`/api/books/${bookId}`, {}, editorJar);
if (r.status === 200 && r.json.book?.source) ok("編集者は source を取得できる");
else fail(`editor GET ${r.status}`);

r = await call(`/api/books/${bookId}`, { method: "PUT", body: JSON.stringify({ source: v2, expectedVersion: r.json.book.version }) }, editorJar);
if (r.status === 200) ok("編集者は保存できる");
else fail(`editor save ${r.status} ${r.text.slice(0, 150)}`);

r = await call(`/api/books/${bookId}`, {}, viewerJar);
if (r.status === 200 && !r.json.book?.source) ok("閲覧者は source を取得できない");
else fail(`viewer GET ${r.status} source=${Boolean(r.json.book?.source)}`);

r = await call(`/api/books/${bookId}/members`, { method: "DELETE", body: JSON.stringify({ userId: editorId }) }, ownerJar);
if (r.status === 200) ok("メンバーを解除できる");
r = await call(`/api/books/${bookId}`, { method: "PUT", body: JSON.stringify({ source: v2, expectedVersion: 2 }) }, editorJar);
if (r.status === 403) ok("解除された編集者は保存できない");
else fail(`解除後の保存が ${r.status}`);

// --- 招待限定の公開範囲 ---
r = await call(`/api/books/${bookId}/share`, {
  method: "PUT",
  body: JSON.stringify({ visibility: "invite" }),
}, ownerJar);
if (r.status === 200) ok("公開範囲を「招待のみ」にできる");
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({}) }, new Map());
if (r.status === 403) ok("招待のみのブックはゲストが受験できない");
else fail(`invite ブックのゲスト受験が 403 にならない: ${r.status}`);
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({}) }, viewerJar);
if (r.status === 200 || r.status === 201) ok("招待されたメンバーは受験できる");
else fail(`invite ブックのメンバー受験が ${r.status}`);

// --- 書き出し ---
r = await call(`/api/books/${bookId}/export?format=qb`, {}, ownerJar);
if (r.status === 200 && r.text.includes("title: 管理テスト")) ok("qb 書き出し");
else fail(`qb export ${r.status}`);

r = await call(`/api/books/${bookId}/export?format=json`, {}, ownerJar);
const exported = r.json as { format?: string; ast?: unknown; source?: string };
if (r.status === 200 && exported.format === "qb-book" && exported.ast) ok("json 書き出し(AST 付き)");
else fail(`json export ${r.status} ${r.text.slice(0, 100)}`);

r = await call(`/api/books/${bookId}/export?format=zip`, {}, ownerJar);
const zipBuffer = r.buffer;
if (r.status === 200 && r.headers.get("content-type") === "application/zip") ok("zip 書き出し");
else fail(`zip export ${r.status}`);

const unzipped = unzipSync(new Uint8Array(zipBuffer));
const names = Object.keys(unzipped);
if (names.includes("book.qb") && names.includes("manifest.json") && names.some((n) => n.startsWith("assets/"))) {
  ok(`zip の中身: ${names.join(", ")}`);
} else fail(`zip の中身が想定と違う: ${names.join(", ")}`);

r = await call(`/api/books/${bookId}/export?format=zip`, {}, viewerJar);
if (r.status === 403) ok("閲覧者は書き出せない");
else fail(`viewer export が ${r.status}`);

// --- ZIP 取り込み ---
const importForm = new FormData();
importForm.append("file", new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" }), "book.zip");
const imported = await fetch(`${BASE}/api/books/import`, {
  method: "POST",
  headers: { origin: BASE, cookie: `qb_session=${ownerJar.get("qb_session")}` },
  body: importForm,
});
const importedJson = (await imported.json()) as { book?: { id: string }; error?: { message?: string } };
if (imported.status === 201 && importedJson.book) ok("ZIP を取り込んで新しいブックを作れる");
else fail(`import ${imported.status} ${JSON.stringify(importedJson).slice(0, 150)}`);

const importedId = importedJson.book?.id;
if (importedId) {
  const importedAssets = await call(`/api/books/${importedId}/assets`, {}, ownerJar);
  if ((importedAssets.json.assets ?? []).length === 1) ok("取り込んだブックに画像が入る");
  else fail(`取り込んだ画像数: ${(importedAssets.json.assets ?? []).length}`);
}

// zip bomb 相当(巨大な展開サイズ)は拒否する
const bomb = zipSync({ "book.qb": strToU8("---\ntitle: bomb\n---\n".repeat(1)) }, { level: 9 });
void bomb;

// --- 検証 API ---
r = await call("/api/books/validate", { method: "POST", body: JSON.stringify({ source: v2 }) });
if (r.status === 200 && r.json.ok === true && r.json.questionCount === 2) {
  ok(`/api/books/validate: 設問 ${r.json.questionCount} 件 / 空欄 ${r.json.blankCount} 件`);
} else fail(`validate ${r.status} ${r.text.slice(0, 150)}`);

r = await call("/api/books/validate", { method: "POST", body: JSON.stringify({ source: "---\ntitle: x\n---\n\n@q\n[[/[/]]]\n@end\n" }) });
if (r.status === 200 && r.json.ok === false) ok("不正な正規表現は validate でエラーになる");
else fail(`validate のエラー検出 ${r.status}`);

// --- 共有設定(既存受験の中断) ---
r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({}) }, viewerJar);
const runningAttempt = r.json.attemptId as string;
r = await call(`/api/books/${bookId}/share`, {
  method: "PUT",
  body: JSON.stringify({ stopExistingAttempts: true }),
}, ownerJar);
if (r.status === 200 && r.json.abandonedAttempts >= 1) ok(`既存の受験を中断できる(${r.json.abandonedAttempts} 件)`);
else fail(`stopExistingAttempts ${r.status} ${r.text.slice(0, 150)}`);
if (runningAttempt) {
  const state = await call(`/api/attempts/${runningAttempt}`, {}, viewerJar);
  if (state.json.state?.attempt?.status === "abandoned") ok("中断された受験は abandoned になる");
  else fail(`受験が中断されていない: ${state.json.state?.attempt?.status}`);
}

r = await call(`/api/books/${bookId}/share`, {
  method: "PUT",
  body: JSON.stringify({ visibility: "link", regenerateToken: true, copyrightConsent: true }),
}, ownerJar);
if (r.status === 200 && r.json.token) ok("リンク限定にすると共有トークンが発行される");
else fail(`link + token ${r.status} ${r.text.slice(0, 150)}`);

// --- 後片付け ---
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.book.deleteMany({ where: { id: { in: [bookId, privateBookId, ...(forkId ? [forkId] : []), ...(importedId ? [importedId] : [])] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId] } } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

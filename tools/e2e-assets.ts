/**
 * 画像アップロード・配信・認可の E2E(§7.8, §9)
 *
 *   pnpm dev            # 別ターミナル
 *   node --env-file=.env tools/e2e-assets.ts
 */
import sharp from "sharp";
import { SAMPLE_SOURCE } from "../apps/web/lib/sample.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
/** 実行ごとに別 IP 扱いにしてレート制限の窓を共有しない */
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const ownerJar = new Map<string, string>();
const guestJar = new Map<string, string>();
const otherJar = new Map<string, string>();
const ok = (m: string) => console.log("ok  ", m);
const fail = (m: string) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};

async function call(
  path: string,
  init: RequestInit = {},
  jarRef: Map<string, string> = ownerJar,
  retry = 1,
) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  headers.set("x-real-ip", FAKE_IP);
  if (jarRef.size) headers.set("cookie", [...jarRef].map(([k, v]) => `${k}=${v}`).join("; "));
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  } catch (error) {
    // 大きなボディを拒否した直後は keep-alive 接続が切れることがあるので 1 回だけ再試行する
    if (retry > 0) return call(path, init, jarRef, retry - 1);
    throw error;
  }
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0]!;
    const idx = pair.indexOf("=");
    jarRef.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, json: {} as Record<string, any>, bytes: buf, headers: res.headers };
  }
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* noop */
  }
  return { status: res.status, json, bytes: Buffer.alloc(0), headers: res.headers };
}

const png = await sharp({
  create: { width: 320, height: 200, channels: 3, background: { r: 40, g: 90, b: 200 } },
})
  .png()
  .toBuffer();

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');

const loginId = `as_${Date.now().toString(36)}`;
let r = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ loginId, password: "assets-password-123", name: "画像テスト" }),
});
if (r.status !== 200) {
  fail(`register ${r.status}`);
  process.exit(1);
}
const ownerId = r.json.user.id as string;

// 別ユーザー(権限の確認用)
r = await call(
  "/api/auth/register",
  { method: "POST", body: JSON.stringify({ loginId: `${loginId}_x`, password: "assets-password-123" }) },
  otherJar,
);
const otherId = r.json.user.id as string;

r = await call("/api/books", {
  method: "POST",
  body: JSON.stringify({ source: SAMPLE_SOURCE, visibility: "private" }),
});
const book = r.json.book as { id: string; source: string; version: number };
ok(`ブック作成 ${book.id}`);

// アップロード
const form = new FormData();
form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "chimei.png");
r = await call(`/api/books/${book.id}/assets`, { method: "POST", body: form });
if (r.status !== 201) {
  fail(`upload ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  process.exit(1);
}
const asset = r.json.asset as { id: string; name: string; markdown: string; width: number; height: number };
ok(`アップロード成功 name=${asset.name} ${asset.width}x${asset.height}`);
if (asset.name !== "chimei") fail(`表示名が不正: ${asset.name}`);
if (!asset.markdown.includes("img:chimei")) fail(`markdown 断片が不正: ${asset.markdown}`);

// ファイル名に空白・括弧があっても img: 参照が壊れないよう名前を正規化する(§4.8)
let sanitized = "";
{
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo (2).png");
  const res = await call(`/api/books/${book.id}/assets`, { method: "POST", body: fd });
  if (res.status !== 201) {
    fail(`名前に空白を含む画像のアップロード ${res.status}`);
  } else {
    const named = res.json.asset as { name: string; markdown: string };
    sanitized = named.name;
    if (!/[\s()]/.test(named.name)) ok(`名前に空白・括弧を含むファイルは正規化される(name=${named.name})`);
    else fail(`危険な文字が残っている: ${named.name}`);
    if (named.markdown.includes(`img:${named.name}`)) ok("markdown 断片も正規化後の名前を使う");
  }
}

// SVG は拒否
{
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(svg)], { type: "image/svg+xml" }), "evil.svg");
  const res = await call(`/api/books/${book.id}/assets`, { method: "POST", body: fd });
  if (res.status === 400) ok("SVG は拒否される");
  else fail(`SVG が ${res.status} で通った`);
}

// 5MB 超は拒否
{
  const big = Buffer.alloc(6 * 1024 * 1024, 0x41);
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(big)], { type: "image/png" }), "big.png");
  const res = await call(`/api/books/${book.id}/assets`, { method: "POST", body: fd });
  if (res.status === 413) ok("5MB 超は 413");
  else fail(`大きいファイルが ${res.status}`);
}

// 他人はアップロードできない
{
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "x.png");
  const res = await call(`/api/books/${book.id}/assets`, { method: "POST", body: fd }, otherJar);
  if (res.status === 404) ok("他人のブックにはアップロードできない(404)");
  else fail(`他人のアップロードが ${res.status}`);
}

// 非公開ブックの画像は匿名取得できない
r = await call(`/api/assets/${asset.id}`, {}, new Map());
if (r.status === 404) ok("非公開ブックの画像は匿名で取れない(404)");
else fail(`非公開画像が ${r.status}`);

// 作者は取得できる(プレビュー用)
r = await call(`/api/books/${book.id}/assets/${asset.id}`);
if (r.status === 200 && r.bytes.length > 0) ok("作者はプレビュー用に取得できる");
else fail(`作者の取得 ${r.status}`);

// ソースに画像参照を入れて保存 → assetId に解決される
const withImage = `${book.source}\n\n![地図](img:chimei){width=320}\n${
  sanitized ? `\n![ロゴ](img:${sanitized}){width=120}\n` : ""
}`;
r = await call(`/api/books/${book.id}`, {
  method: "PUT",
  body: JSON.stringify({ source: withImage, expectedVersion: book.version, visibility: "public" }),
});
if (r.status !== 200) {
  fail(`保存 ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
} else {
  ok("img: 参照を含むソースを保存できた");
  if (sanitized && r.json.book.source.includes(`img:${sanitized}`)) {
    ok("正規化後の名前の参照も assetId に解決される");
  }
}
const saved = r.json.book as { version: number; source: string };

// 存在しない画像名は QB-E005 で拒否
r = await call(`/api/books/${book.id}`, {
  method: "PUT",
  body: JSON.stringify({
    source: `${saved.source}\n\n![x](img:not-found)\n`,
    expectedVersion: saved.version,
  }),
});
if (r.status === 422 && JSON.stringify(r.json).includes("QB-E005")) ok("未登録の画像参照は QB-E005 で拒否");
else fail(`未登録画像の保存が ${r.status}`);

// 公開ブックなら匿名で配信される
r = await call(`/api/assets/${asset.id}`, {}, new Map());
if (r.status === 200 && r.headers.get("content-type") === "image/png") ok("公開ブックの画像は匿名配信できる");
else fail(`公開画像の配信 ${r.status}`);
const cache = r.headers.get("cache-control") ?? "";
const referrer = r.headers.get("referrer-policy") ?? "";
if (cache.includes("no-cache") && cache.includes("private")) ok(`Cache-Control: ${cache}`);
else fail(`Cache-Control が不正: ${cache}`);
if (referrer === "no-referrer") ok("Referrer-Policy: no-referrer");
else fail(`Referrer-Policy が不正: ${referrer}`);

// ゲスト受験中の配信
r = await call(`/api/books/${book.id}/attempts`, { method: "POST", body: JSON.stringify({}) }, guestJar);
if (r.status !== 201) fail(`ゲスト受験 ${r.status}`);
const attemptId = r.json.attemptId as string;
r = await call(`/api/attempts/${attemptId}/assets/${asset.id}`, {}, guestJar);
if (r.status === 200) ok("受験中は Attempt 経由で配信される");
else fail(`Attempt 経由の配信 ${r.status}`);
r = await call(`/api/attempts/${attemptId}/assets/${asset.id}`, {}, new Map());
if (r.status === 404) ok("資格情報なしでは Attempt 経由で取得できない");
else fail(`資格情報なしの取得 ${r.status}`);

// リンク共有経由
r = await call(`/api/books/${book.id}`, {
  method: "PUT",
  body: JSON.stringify({ source: saved.source, expectedVersion: saved.version, visibility: "link" }),
});
r = await call(`/api/books/${book.id}/share`, { method: "POST" });
const token = r.json.token as string;
r = await call(`/api/s/${token}/assets/${asset.id}`, {}, new Map());
if (r.status === 200) ok("共有トークン経由で配信される");
else fail(`共有経由の配信 ${r.status}`);
r = await call(`/api/s/wrong-token/assets/${asset.id}`, {}, new Map());
if (r.status === 404) ok("不正なトークンでは配信されない");
else fail(`不正トークンの配信 ${r.status}`);

// 失効後は配信されない
await call(`/api/books/${book.id}/share`, { method: "DELETE" });
r = await call(`/api/s/${token}/assets/${asset.id}`, {}, new Map());
if (r.status === 404) ok("共有失効後は配信されない");
else fail(`失効後の配信 ${r.status}`);

// 後片付け(ファイルも消す)
{
  const { PrismaClient } = await import("@prisma/client");
  const { rm } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const prisma = new PrismaClient();
  await prisma.book.deleteMany({ where: { id: book.id } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await rm(resolve(process.cwd(), "data/uploads/books", book.id), { recursive: true, force: true });
  await prisma.$disconnect();
  ok("後片付け完了");
}

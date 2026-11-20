/**
 * 共有・公開ライブラリ・結果共有・cron の E2E(§3.5, §7.2, §7.7〜§7.9)
 *
 *   pnpm dev            # 別ターミナル
 *   node --env-file=.env tools/e2e-share.ts
 */
import { SAMPLE_SOURCE } from "../apps/web/lib/sample.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
/** 実行ごとに別 IP 扱いにしてレート制限の窓を共有しない */
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const jar = new Map<string, string>();
/** ゲスト用(未ログイン)の Cookie ジャー */
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
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0]!;
    const idx = pair.indexOf("=");
    jarRef.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML */
  }
  return { status: res.status, json: json as Record<string, any>, text, headers: res.headers };
}

const loginId = `sh_${Date.now().toString(36)}`;
let r = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ loginId, password: "share-password-123", name: "共有テスト" }),
});
if (r.status !== 200) {
  fail(`register ${r.status}`);
  process.exit(1);
}
const meId = (r.json.user as { id: string }).id;

// 公開ブックを作る
r = await call("/api/books", {
  method: "POST",
  body: JSON.stringify({ source: SAMPLE_SOURCE, visibility: "public" }),
});
const book = r.json.book as { id: string; source: string; version: number };
ok(`公開ブック作成 ${book.id}`);

// 公開ライブラリに出る
r = await call("/api/books?scope=public");
const listed = (r.json.books as Array<{ id: string; title: string }>).some((b) => b.id === book.id);
if (listed) ok("公開ライブラリの一覧に掲載される");
else fail("公開ライブラリに出てこない");

// 検索でも見つかる
r = await call(`/api/books?scope=public&q=${encodeURIComponent("日本史")}`);
if ((r.json.books as Array<{ id: string }>).some((b) => b.id === book.id)) ok("検索で見つかる");
else fail("検索で見つからない");

// ゲストでも受験できる
r = await call(`/api/books/${book.id}/attempts`, { method: "POST", body: JSON.stringify({ mode: "practice" }) }, guestJar);
if (r.status === 201) ok("公開ブックはゲストが受験できる");
else fail(`ゲスト受験が ${r.status}`);
const guestAttempt = r.json.attemptId as string;

// リンク限定に切り替えると、トークン無しでは受験できない
r = await call(`/api/books/${book.id}`, {
  method: "PUT",
  body: JSON.stringify({ source: book.source, expectedVersion: book.version, visibility: "link" }),
});
if (r.status === 200) ok("公開範囲をリンク限定に変更");
else fail(`公開範囲の変更 ${r.status} ${r.text.slice(0, 150)}`);

r = await call(`/api/books/${book.id}/attempts`, { method: "POST", body: JSON.stringify({}) }, guestJar);
if (r.status === 403) ok("リンク限定ブックはトークン無しで受験できない(403)");
else fail(`トークン無しの受験が ${r.status}`);

// 共有リンクを発行して受験できる
r = await call(`/api/books/${book.id}/share`, { method: "POST" });
if (r.status !== 200 || !r.json.token) {
  fail(`共有リンク発行 ${r.status} ${r.text.slice(0, 200)}`);
  process.exit(1);
}
const bookToken = r.json.token as string;
ok(`共有リンク発行 /s/${bookToken.slice(0, 8)}…`);

r = await call(`/api/books/${book.id}/attempts`, {
  method: "POST",
  body: JSON.stringify({ shareToken: bookToken }),
}, guestJar);
if (r.status === 201) ok("共有トークンがあれば受験できる");
else fail(`共有トークン受験 ${r.status} ${r.text.slice(0, 150)}`);

// 他人(未ログイン)がブック詳細を取るにはトークンが必要
r = await call(`/api/books/${book.id}`, {}, guestJar);
if (r.status === 404) ok("トークン無しのブック取得は 404");
else fail(`トークン無しの取得が ${r.status}`);

r = await call(`/api/books/${book.id}?t=${bookToken}`, {}, guestJar);
if (r.status === 200 && r.json.book) ok("トークン付きなら公開射影を取得できる");
else fail(`トークン付き取得 ${r.status}`);

// 共有ページが描画される
r = await call(`/s/${bookToken}`, {}, new Map());
if (r.status === 200 && r.text.includes("このブックを受験する")) ok("/s/:token が受験ボタン付きで描画される");
else fail(`/s/:token ${r.status}`);

// 共有ページのカード表示(§8)。検索結果には出さない
if (r.text.includes('name="robots" content="noindex') || r.text.includes("noindex")) {
  ok("/s/:token は noindex");
} else fail("/s/:token に noindex が無い");
if (r.text.includes('property="og:title"')) ok("/s/:token に og:title がある");
else fail("/s/:token に og:title が無い");

// 公開ブックの OGP(共有カード)
r = await call(`/api/books/${book.id}/share`, {
  method: "PUT",
  body: JSON.stringify({ visibility: "public", copyrightConsent: true }),
});
if (r.status !== 200) fail(`公開への変更 ${r.status} ${r.text.slice(0, 200)}`);
r = await call(`/b/${book.id}`, {}, new Map());
if (r.status === 200) ok("/b/:id が表示される");
else fail(`/b/:id ${r.status}`);
if (r.text.includes('property="og:title"') && r.text.includes('property="og:image"')) {
  ok("/b/:id に og:title と og:image がある");
} else fail("/b/:id に OGP タグが無い");
if (r.text.includes('name="twitter:card"') && r.text.includes("summary_large_image")) {
  ok("/b/:id に twitter:card がある");
} else fail("/b/:id に twitter:card が無い");
if (/<link rel="canonical" href="[^"]+\/b\//.test(r.text)) ok("/b/:id に canonical がある");
else fail("/b/:id に canonical が無い");

r = await call("/og.png");
if (r.status === 200 && (r.headers.get("content-type") ?? "").includes("image/png")) {
  ok("og.png が配信される");
} else fail(`og.png ${r.status}`);

// 結果共有(点数のみ)
r = await call(`/api/attempts/${guestAttempt}`, { method: "POST", body: JSON.stringify({}) }, guestJar);
if (r.status !== 200) fail(`提出 ${r.status}`);
r = await call(`/api/attempts/${guestAttempt}/share`, { method: "POST" }, guestJar);
if (r.status !== 200 || !r.json.token) {
  fail(`結果共有の発行 ${r.status} ${r.text.slice(0, 150)}`);
} else {
  const resultToken = r.json.token as string;
  ok("結果共有リンクを発行");
  const page = await call(`/r/${resultToken}`, {}, new Map());
  if (page.status === 200 && page.text.includes("得点")) ok("/r/:token が点数だけを表示する");
  else fail(`/r/:token ${page.status}`);
  if (page.text.includes("qb_") || page.text.includes("十七条憲法")) {
    fail("/r/:token に解答内容が漏れている");
  } else ok("/r/:token に解答内容が含まれない");

  // 失効すると 404
  r = await call(`/api/attempts/${guestAttempt}/share`, { method: "DELETE" }, guestJar);
  if (r.status === 200) ok("結果共有を失効");
  else fail(`結果共有の失効 ${r.status} ${r.text.slice(0, 120)}`);
  const revoked = await call(`/r/${resultToken}`, {}, new Map());
  if (revoked.status === 404) ok("失効後の /r/:token は 404");
  else fail(`失効後の表示 ${revoked.status}`);
}

// ブック共有の失効
r = await call(`/api/books/${book.id}/share`, { method: "DELETE" });
if (r.status === 200) ok("ブック共有を失効");
r = await call(`/api/books/${book.id}?t=${bookToken}`, {}, guestJar);
if (r.status === 404) ok("失効後はトークン付きでも取得できない");

// cron(シークレット)
r = await call("/api/cron/expire", { method: "POST" });
if (r.status === 403) ok("cron はシークレット無しでは実行できない");
else fail(`cron の認可 ${r.status}`);
r = await call("/api/cron/expire", {
  method: "POST",
  headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
});
if (r.status === 200 && typeof r.json.expired === "number") ok(`cron 実行(回収 ${r.json.expired} 件)`);
else fail(`cron 実行 ${r.status} ${r.text.slice(0, 150)}`);

// 後片付け
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.book.deleteMany({ where: { id: book.id } });
  await prisma.user.deleteMany({ where: { id: meId } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

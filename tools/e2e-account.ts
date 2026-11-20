/**
 * アカウント自己管理の E2E(§3.4, §7.1, §9)
 *
 * リカバリーコード・パスワード変更・設定画面・退会(匿名化)を確認する。
 *
 *   pnpm dev
 *   node --env-file=.env tools/e2e-account.ts
 */
import { PrismaClient } from "@prisma/client";

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
    /* HTML */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const stamp = Date.now().toString(36);
const prisma = new PrismaClient();
const createdUserIds: string[] = [];
const createdBookIds: string[] = [];
const jars: Jar[] = [];
const newJar = (): Jar => {
  const jar: Jar = new Map();
  jars.push(jar);
  return jar;
};

const login = async (loginId: string, password: string, jar: Jar) =>
  call("/api/auth/login", { method: "POST", body: JSON.stringify({ loginId, password }) }, jar);

try {
  /* ------------------------------------------------------------------ */
  /* 1. 登録とリカバリーコードの発行                                     */
  /* ------------------------------------------------------------------ */
  const loginId = `acct_${stamp}`;
  const jar = newJar();
  let r = await call(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ loginId, password: "first-pass-123", name: "自己管理" }) },
    jar,
  );
  if (r.status !== 200) throw new Error(`register ${r.status} ${r.text.slice(0, 200)}`);
  const codes = (r.json.recoveryCodes ?? []) as string[];
  if (codes.length === 10) ok("登録時に 10 個のリカバリーコードが返る");
  else fail(`リカバリーコードの数が ${codes.length}`);
  if (codes.every((code) => /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code))) {
    ok("コードは 4-4-4 の base32 形式");
  } else fail(`形式が不正: ${codes[0]}`);
  if (r.json.user?.mustChangePassword === false) ok("通常の登録では mustChangePassword=false");
  else fail(`mustChangePassword=${r.json.user?.mustChangePassword}`);

  r = await call("/api/me/recovery-codes", {}, jar);
  if (r.status === 200 && r.json.remaining === 10) ok("GET /me/recovery-codes は残り 10 個を返す");
  else fail(`recovery-codes GET ${r.status} ${JSON.stringify(r.json)}`);

  /* ------------------------------------------------------------------ */
  /* 2. プロフィール更新                                                 */
  /* ------------------------------------------------------------------ */
  r = await call("/api/me", { method: "PATCH", body: JSON.stringify({ name: "改名済み" }) }, jar);
  if (r.status === 200 && r.json.user.name === "改名済み") ok("表示名を変更できる");
  else fail(`PATCH /me ${r.status} ${JSON.stringify(r.json)}`);

  r = await call("/api/me", { method: "PATCH", body: JSON.stringify({ name: "" }) }, jar);
  if (r.status === 400) ok("空の表示名は拒否される");
  else fail(`空の表示名が ${r.status}`);

  /* ------------------------------------------------------------------ */
  /* 3. パスワード変更(他セッションの失効)                              */
  /* ------------------------------------------------------------------ */
  const otherJar = newJar();
  r = await login(loginId, "first-pass-123", otherJar);
  if (r.status === 200) ok("別端末でもログインできる");
  else fail(`別端末ログイン ${r.status}`);

  r = await call(
    "/api/me/password",
    { method: "POST", body: JSON.stringify({ currentPassword: "wrong-pass", newPassword: "second-pass-123" }) },
    jar,
  );
  if (r.status === 401) ok("現在のパスワードが違えば 401");
  else fail(`誤った現在パスワードが ${r.status}`);

  r = await call(
    "/api/me/password",
    { method: "POST", body: JSON.stringify({ currentPassword: "first-pass-123", newPassword: "first-pass-123" }) },
    jar,
  );
  if (r.status === 400) ok("同じパスワードへの変更は 400");
  else fail(`同一パスワードが ${r.status}`);

  r = await call(
    "/api/me/password",
    { method: "POST", body: JSON.stringify({ currentPassword: "first-pass-123", newPassword: "second-pass-123" }) },
    jar,
  );
  if (r.status === 200) ok("パスワードを変更できる");
  else fail(`パスワード変更 ${r.status} ${JSON.stringify(r.json)}`);

  r = await call("/api/auth/me", {}, jar);
  if (r.status === 200 && r.json.user) ok("変更した端末のセッションは維持される");
  else fail(`変更端末のセッションが切れた (${r.status})`);

  r = await call("/api/auth/me", {}, otherJar);
  if (r.json.user === null) ok("他の端末のセッションは失効する");
  else fail("他の端末のセッションが残っている");

  r = await login(loginId, "first-pass-123", newJar());
  if (r.status === 401) ok("古いパスワードではログインできない");
  else fail(`古いパスワードで ${r.status}`);

  /* ------------------------------------------------------------------ */
  /* 4. リカバリーコードによる再設定                                     */
  /* ------------------------------------------------------------------ */
  r = await call(
    "/api/auth/recover",
    { method: "POST", body: JSON.stringify({ loginId, code: "AAAA-BBBB-CCCC", newPassword: "third-pass-123" }) },
  );
  if (r.status === 401) ok("無効なリカバリーコードは 401");
  else fail(`無効なコードが ${r.status}`);

  // 小文字・ハイフン無しでも通る(正規化)
  const firstCode = codes[0]!;
  r = await call(
    "/api/auth/recover",
    {
      method: "POST",
      body: JSON.stringify({
        loginId: loginId.toUpperCase(),
        code: firstCode.replace(/-/g, "").toLowerCase(),
        newPassword: "third-pass-123",
      }),
    },
  );
  if (r.status === 200) ok("リカバリーコードで再設定できる(大文字小文字・ハイフン無しを許容)");
  else fail(`リカバリー ${r.status} ${JSON.stringify(r.json)}`);

  r = await call(
    "/api/auth/recover",
    { method: "POST", body: JSON.stringify({ loginId, code: firstCode, newPassword: "fourth-pass-123" }) },
  );
  if (r.status === 401) ok("使用済みコードは再利用できない");
  else fail(`使用済みコードが ${r.status}`);

  r = await login(loginId, "second-pass-123", newJar());
  if (r.status === 401) ok("再設定前のパスワードは無効");
  else fail(`旧パスワードで ${r.status}`);

  r = await login(loginId, "third-pass-123", newJar());
  if (r.status === 200) ok("再設定後のパスワードでログインできる");
  else fail(`新パスワードで ${r.status}`);

  r = await call("/api/me/recovery-codes", {}, jar);
  if (r.status === 401) ok("再設定で既存セッションはすべて失効する");
  else fail(`再設定後の旧セッションが ${r.status}`);

  const resetJar = newJar();
  await login(loginId, "third-pass-123", resetJar);
  r = await call("/api/me/recovery-codes", {}, resetJar);
  if (r.json.remaining === 9) ok("リカバリーコードを 1 つ消費している(残り 9 個)");
  else fail(`再設定後の残数 ${JSON.stringify(r.json)}`);

  /* ------------------------------------------------------------------ */
  /* 5. リカバリーコードの再発行(旧コードの失効)                        */
  /* ------------------------------------------------------------------ */
  const jar2 = newJar();
  await login(loginId, "third-pass-123", jar2);

  r = await call(
    "/api/me/recovery-codes",
    { method: "POST", body: JSON.stringify({ password: "wrong-pass" }) },
    jar2,
  );
  if (r.status === 401) ok("再発行には現在のパスワードが必要");
  else fail(`誤ったパスワードでの再発行が ${r.status}`);

  r = await call(
    "/api/me/recovery-codes",
    { method: "POST", body: JSON.stringify({ password: "third-pass-123" }) },
    jar2,
  );
  if (r.status === 200 && (r.json.recoveryCodes as string[]).length === 10) ok("リカバリーコードを再発行できる");
  else fail(`再発行 ${r.status} ${JSON.stringify(r.json)}`);
  const regenerated = (r.json.recoveryCodes ?? []) as string[];

  r = await call(
    "/api/auth/recover",
    { method: "POST", body: JSON.stringify({ loginId, code: codes[1]!, newPassword: "fifth-pass-123" }) },
  );
  if (r.status === 401) ok("再発行前のコードは使えなくなる");
  else fail(`旧コードが ${r.status}`);

  r = await call(
    "/api/auth/recover",
    { method: "POST", body: JSON.stringify({ loginId, code: regenerated[0]!, newPassword: "fifth-pass-123" }) },
  );
  if (r.status === 200) ok("再発行後のコードは使える");
  else fail(`新コード ${r.status}`);

  /* ------------------------------------------------------------------ */
  /* 6. 一時パスワード(mustChangePassword)                               */
  /* ------------------------------------------------------------------ */
  const tempId = `tmp_${stamp}`;
  const tempUser = await prisma.user.create({
    data: {
      loginId: tempId,
      name: "一時",
      passwordHash: "scrypt$16384$8$1$00$00",
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
  });
  // 実際のハッシュに置き換える(API 経由で登録できない状態を作るため直接更新)
  {
    const { hashPassword } = await import("../apps/web/lib/password.ts");
    await prisma.user.update({
      where: { id: tempUser.id },
      data: { passwordHash: hashPassword("temp-pass-123") },
    });
  }

  const tempJar = newJar();
  r = await login(tempId, "temp-pass-123", tempJar);
  if (r.status === 200 && r.json.user?.mustChangePassword === true) {
    ok("一時パスワードでログインでき、mustChangePassword=true が返る");
  } else fail(`一時パスワードのログイン ${r.status} ${JSON.stringify(r.json)}`);

  r = await call(
    "/api/books",
    { method: "POST", body: JSON.stringify({ source: "---\ntitle: 一時\n---\n\n本文\n" }) },
    tempJar,
  );
  if (r.status === 403 && r.json.error?.details?.reason === "password_change_required") {
    ok("変更前はブックを作成できない(403 password_change_required)");
  } else fail(`変更前のブック作成 ${r.status} ${JSON.stringify(r.json)}`);

  r = await call(
    "/api/me/password",
    { method: "POST", body: JSON.stringify({ currentPassword: "temp-pass-123", newPassword: "own-pass-123" }) },
    tempJar,
  );
  if (r.status === 200) ok("一時パスワードから自分のパスワードへ変更できる");
  else fail(`一時パスワードの変更 ${r.status} ${JSON.stringify(r.json)}`);

  r = await call(
    "/api/books",
    { method: "POST", body: JSON.stringify({ source: "---\ntitle: 変更後\n---\n\n本文\n" }) },
    tempJar,
  );
  if (r.status === 201) {
    ok("変更後はブックを作成できる");
    await prisma.book.deleteMany({ where: { id: r.json.book.id } });
  } else fail(`変更後のブック作成 ${r.status}`);

  // 期限切れの一時パスワード
  await prisma.user.update({
    where: { id: tempUser.id },
    data: { mustChangePassword: true, passwordChangedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
  });
  r = await login(tempId, "own-pass-123", newJar());
  if (r.status === 403) ok("24 時間を過ぎた一時パスワードはログインできない");
  else fail(`期限切れ一時パスワード ${r.status}`);

  /* ------------------------------------------------------------------ */
  /* 7. 退会(匿名化)                                                    */
  /* ------------------------------------------------------------------ */
  const delId = `del_${stamp}`;
  const delJar = newJar();
  r = await call(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ loginId: delId, password: "delete-pass-123" }) },
    delJar,
  );
  if (r.status !== 200) throw new Error(`退会テスト用の登録 ${r.status} ${r.text.slice(0, 200)}`);
  const delUserId = r.json.user.id as string;
  createdUserIds.push(delUserId);

  r = await call(
    "/api/books",
    { method: "POST", body: JSON.stringify({ source: "---\ntitle: 退会テスト\n---\n\n[[答]]\n" }) },
    delJar,
  );
  if (r.status !== 201) throw new Error(`退会テスト用のブック ${r.status} ${r.text.slice(0, 300)}`);
  const delBookId = r.json.book.id as string;
  createdBookIds.push(delBookId);
  r = await call(
    `/api/books/${delBookId}/attempts`,
    { method: "POST", body: JSON.stringify({ mode: "practice" }) },
    delJar,
  );
  const delAttemptId = r.json.attemptId as string;
  if (!delAttemptId) fail(`受験開始 ${r.status} ${r.text.slice(0, 150)}`);

  r = await call("/api/me", { method: "DELETE", body: JSON.stringify({ password: "wrong-pass" }) }, delJar);
  if (r.status === 401) ok("誤ったパスワードでは退会できない");
  else fail(`誤ったパスワードでの退会が ${r.status}`);

  r = await call("/api/me", { method: "DELETE", body: JSON.stringify({ password: "delete-pass-123" }) }, delJar);
  if (r.status === 200) ok("退会できる");
  else fail(`退会 ${r.status} ${JSON.stringify(r.json)}`);

  r = await call("/api/auth/me", {}, delJar);
  if (r.json.user === null) ok("退会後はセッションが無効");
  else fail("退会後もセッションが有効");

  r = await login(delId, "delete-pass-123", newJar());
  if (r.status === 401) ok("退会後はログインできない");
  else fail(`退会後のログインが ${r.status}`);

  const deletedUser = await prisma.user.findUnique({ where: { id: delUserId } });
  if (deletedUser?.loginId === null && deletedUser?.passwordHash === null && deletedUser?.deletedAt) {
    ok("認証情報が削除され、行は匿名化されて残る");
  } else fail(`退会後のユーザー行: ${JSON.stringify(deletedUser)}`);

  const deletedBook = await prisma.book.findUnique({ where: { id: delBookId } });
  if (deletedBook?.deletedAt) ok("所有ブックは論理削除される");
  else fail("所有ブックが削除されていない");

  const anonymized = await prisma.attempt.findUnique({ where: { id: delAttemptId } });
  if (anonymized?.userId === null && anonymized?.anonymizedAt) ok("受験結果は匿名化して残る");
  else fail(`受験結果の匿名化: userId=${anonymized?.userId} anonymizedAt=${anonymized?.anonymizedAt}`);

  // 削除された ID は再取得できる(§3.4)
  r = await call(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ loginId: delId, password: "reuse-pass-123" }) },
    newJar(),
  );
  if (r.status === 200) ok("退会したログイン ID は別ユーザーとして再取得できる");
  else fail(`ID 再利用 ${r.status} ${JSON.stringify(r.json)}`);
  const reusedId = r.json.user?.id as string;
  if (reusedId) createdUserIds.push(reusedId);
  if (reusedId && reusedId !== delUserId) ok("再取得したアカウントは別 ID");
  else fail("再取得したアカウントが同じ ID");

  /* ------------------------------------------------------------------ */
  /* 8. 画面(未ログイン/ログイン済み)                                   */
  /* ------------------------------------------------------------------ */
  r = await call("/terms");
  if (r.status === 200 && r.text.includes("利用規約")) ok("/terms が表示される");
  else fail(`/terms ${r.status}`);

  r = await call("/privacy");
  if (r.status === 200 && r.text.includes("プライバシー")) ok("/privacy が表示される");
  else fail(`/privacy ${r.status}`);

  r = await call("/report-abuse");
  if (r.status === 200 && r.text.includes("通報")) ok("/report-abuse が表示される");
  else fail(`/report-abuse ${r.status}`);

  r = await call("/recover");
  if (r.status === 200 && r.text.includes("リカバリーコード")) ok("/recover が表示される");
  else fail(`/recover ${r.status}`);

  r = await call("/settings", {}, newJar());
  if (r.status === 307 && (r.headers.get("location") ?? "").includes("/login")) {
    ok("未ログインの /settings はログインへ誘導される");
  } else fail(`未ログイン /settings ${r.status}`);

  const settingsJar = newJar();
  await login(loginId, "fifth-pass-123", settingsJar);
  r = await call("/settings", {}, settingsJar);
  if (r.status === 200 && r.text.includes("リカバリーコード")) ok("ログイン済みの /settings が表示される");
  else fail(`/settings ${r.status}`);

  // 一時パスワードの利用者にはバナーが出る
  await prisma.user.update({
    where: { id: tempUser.id },
    data: { mustChangePassword: true, passwordChangedAt: new Date() },
  });
  const bannerJar = newJar();
  await login(tempId, "own-pass-123", bannerJar);
  r = await call("/settings", {}, bannerJar);
  if (r.status === 200 && r.text.includes("一時パスワード")) ok("一時パスワードの利用者には変更バナーが出る");
  else fail(`一時パスワードのバナー ${r.status}`);
} catch (error) {
  fail(`例外: ${(error as Error).message}`);
  if (process.env.E2E_DEBUG) console.error((error as Error).stack);
} finally {
  // 後片付け(このスクリプトが作ったものだけを消す)
  for (const jar of jars) {
    const value = jar.get("qb_session");
    void value;
  }
  // このスクリプトが作ったものだけを消す(他のデータには触れない)
  await prisma.book.deleteMany({ where: { id: { in: createdBookIds } } });
  await prisma.user.deleteMany({ where: { loginId: { in: [`acct_${stamp}`, `tmp_${stamp}`] } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
  ok("後片付け完了");
}

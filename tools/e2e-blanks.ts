/**
 * 空欄(blankId 付き)の保存と採点の確認。empty / number / regex / choiceBlank を網羅する。
 *
 *   pnpm dev && pnpm e2e:blanks
 */
import { parse, collectQuestions } from "../packages/qb-parser/src/index.ts";
import { SAMPLE_SOURCE } from "../apps/web/lib/sample.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
/** 実行ごとに別 IP 扱いにしてレート制限の窓を共有しない */
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const jar = new Map<string, string>();
const ok = (m: string) => console.log("ok  ", m);
const fail = (m: string) => { console.error("FAIL", m); process.exitCode = 1; };

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  headers.set("x-real-ip", FAKE_IP);
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0]!;
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json: json as Record<string, any>, text };
}

// 正解表は「サーバに保存された確定ソース」から作る(ID が一致するのはこちらだけ)
function buildCorrectTable(source: string) {
const ast = parse(source).ast;
const correctByBlank = new Map<string, { kind: "blank"; text: string } | { kind: "choiceBlank"; index: number }>();
for (const q of collectQuestions(ast.blocks)) {
  const walk = (inlines: unknown[]) => {
    for (const raw of inlines as Array<Record<string, any>>) {
      if (raw.t === "blank") {
        const first = raw.answers?.[0];
        if (first?.kind === "exact") correctByBlank.set(raw.id, { kind: "blank", text: first.v });
        else if (first?.kind === "number") correctByBlank.set(raw.id, { kind: "blank", text: first.v });
        else if (first?.kind === "regex") correctByBlank.set(raw.id, { kind: "blank", text: "Abc" });
      } else if (raw.t === "choiceBlank") {
        correctByBlank.set(raw.id, { kind: "choiceBlank", index: raw.correct?.[0] ?? 0 });
      } else if (Array.isArray(raw.c)) walk(raw.c);
    }
  };
  const walkBlocks = (blocks: unknown[]) => {
    for (const raw of blocks as Array<Record<string, any>>) {
      if (raw.type === "paragraph") walk(raw.c);
      else if (raw.type === "list") for (const item of raw.items) walkBlocks(item);
      else if (raw.type === "table") { for (const cell of raw.header) walk(cell); for (const row of raw.rows) for (const cell of row) walk(cell); }
      else if (raw.type === "question") walkBlocks(raw.body);
    }
  };
  walkBlocks(q.body);
}
return correctByBlank;
}

const loginId = `bl_${Date.now().toString(36)}`;
let r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ loginId, password: "test-password-123" }) });
if (r.status !== 200) { fail(`register ${r.status}`); process.exit(1); }

r = await call("/api/books", { method: "POST", body: JSON.stringify({ source: SAMPLE_SOURCE }) });
const bookId = (r.json.book as { id: string; source: string }).id;
(globalThis as any).__bookId = bookId;
const storedSource = (r.json.book as { source: string }).source;
ok(`book ${bookId}`);

const correctByBlank = buildCorrectTable(storedSource);
ok(`正解表を作成(${correctByBlank.size} 空欄)`);

r = await call(`/api/books/${bookId}/attempts`, { method: "POST", body: JSON.stringify({ mode: "practice" }) });
const attemptId = r.json.attemptId as string;

// 空欄をすべて正解で埋める
for (const [blankId, ans] of correctByBlank) {
  // 設問 ID を求める(state から)
  const state = (await call(`/api/attempts/${attemptId}`)).json.state as {
    book: { blocks: Array<Record<string, any>> };
  };
  const findQuestion = (): string | null => {
    const search = (inlines: unknown[]): boolean => {
      for (const raw of inlines as Array<Record<string, any>>) {
        if ((raw.t === "blank" || raw.t === "choiceBlank") && raw.id === blankId) return true;
        if (Array.isArray(raw.c) && search(raw.c)) return true;
      }
      return false;
    };
    const walkBlocks = (blocks: Array<Record<string, any>>, owner: string | null): string | null => {
      for (const b of blocks) {
        if (b.type === "question") {
          const inner = walkBlocks(b.body ?? [], b.id);
          if (inner) return inner;
        } else if (b.type === "paragraph" && search(b.c)) return owner;
        else if (b.type === "list") {
          for (const item of b.items ?? []) {
            const found = walkBlocks(item, owner);
            if (found) return found;
          }
        } else if (b.type === "table") {
          for (const cell of b.header ?? []) if (search(cell)) return owner;
          for (const row of b.rows ?? []) for (const cell of row) if (search(cell)) return owner;
        }
      }
      return null;
    };
    return walkBlocks(state.book.blocks, null);
  };
  const questionId = findQuestion();
  if (!questionId) { fail(`設問が見つからない: ${blankId}`); continue; }
  const value = ans.kind === "blank" ? { text: ans.text } : { text: String(ans.index) };
  const res = await call(`/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: JSON.stringify({ questionId, blankId, value }),
  });
  if (res.status !== 200) fail(`空欄 ${blankId} の保存 ${res.status} ${res.text.slice(0, 120)}`);
}
if (process.exitCode !== 1) ok("全空欄を保存(blankId 付き)");

// 提出前は正解が見えない
const before = await call(`/api/attempts/${attemptId}`);
const beforeText = JSON.stringify(before.json);
if (beforeText.includes('"matchers"') || beforeText.includes('"correct"')) fail("未提出の応答に正解が含まれる");
else ok("未提出の応答に正解が含まれない");

r = await call(`/api/attempts/${attemptId}`, { method: "POST", body: JSON.stringify({}) });
const grade = r.json.grade as { score: string; maxScore: string; questions: Array<{ kind: string; score: string; maxScore: string }> };
for (const q of grade.questions as Array<Record<string, any>>) {
  if (q.kind !== "blank") continue;
  console.log("   q", q.questionId, q.score, "/", q.maxScore, JSON.stringify(q.blanks));
}
const blanksFull = grade.questions.filter((q) => q.kind === "blank" && q.score === q.maxScore).length;
const blankTotal = grade.questions.filter((q) => q.kind === "blank").length;
if (blanksFull === blankTotal) ok(`空欄設問 ${blankTotal} 件すべて満点`);
else fail(`空欄の採点が不正 (${blanksFull}/${blankTotal})`);
ok(`合計 ${grade.score} / ${grade.maxScore}`);

// 空欄の回答が blankId 行として保存されているか(DB 直接確認は省き、再取得で確認)
const after = await call(`/api/attempts/${attemptId}`);
const answers = (after.json.state as { answers: Record<string, { kind: string; values?: Record<string, string> }> }).answers;
const restored = Object.values(answers).filter((a) => a.kind === "blanks");
if (restored.length > 0 && Object.keys(restored[0]!.values ?? {}).length > 0) ok(`空欄回答の復元 ${Object.keys(restored[0]!.values ?? {}).length} 件`);
else fail("空欄回答が復元されない");

// 後片付け
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
await prisma.book.deleteMany({ where: { id: (globalThis as any).__bookId ?? "" } });
await prisma.user.deleteMany({ where: { loginId } });
await prisma.$disconnect();
ok("後片付け完了");

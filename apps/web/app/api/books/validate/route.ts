import { z } from "zod";
import { collectBlanks, collectQuestions, parse, saveSource } from "@qb/parser";
import { fail, handleRouteError, json, noStore, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ source: z.string().max(2 * 1024 * 1024) });

/** POST /api/books/validate … 保存せず診断だけ返す(§7.1) */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await readJsonBody(request));
    if (!parsed.success) return fail("invalid_request", "リクエストが不正です", parsed.error.issues);

    // ID を書き戻した結果も返す(クライアントのプレビュー・下書きに使える)
    const saved = saveSource(parsed.data.source);
    const ast = saved.result.ast;
    return json(
      {
        ok: !saved.result.hasErrors,
        source: saved.source,
        title: ast.meta.title,
        questionCount: collectQuestions(ast.blocks).length,
        blankCount: collectQuestions(ast.blocks).reduce(
          (sum, q) => sum + collectBlanks(q.body).length,
          0,
        ),
        diagnostics: saved.result.diagnostics,
        meta: parse(parsed.data.source).ast.meta,
      },
      { headers: noStore },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

import { z } from "zod";
import { toPublic, type BookAst } from "@qb/parser";
import { getCurrentUser } from "@/lib/auth";
import { sha256 } from "@/lib/auth";
import { bookRole, canEdit } from "@/lib/access";
import { db } from "@/lib/db";
import { saveBook } from "@/lib/books";
import { fail, handleRouteError, json, noStore, passwordChangeRequired, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function findBook(id: string) {
  return db.book.findUnique({ where: { id } });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const book = await findBook(id);
    if (!book || book.deletedAt || book.hiddenByAdmin) return fail("not_found", "ブックが見つかりません");

    const user = await getCurrentUser();
    const role = await bookRole(book.id, user?.id ?? null);

    // owner と editor メンバーは source まで取得できる(§7.2)
    if (canEdit(role)) {
      return json(
        {
          book: {
            id: book.id,
            title: book.title,
            description: book.description,
            tags: book.tags,
            visibility: book.visibility,
            allowFork: book.allowFork,
            version: book.version,
            source: book.source,
            updatedAt: book.updatedAt,
            createdAt: book.createdAt,
          },
        },
        { headers: noStore },
      );
    }

    if (book.visibility === "link") {
      // リンク共有はトークン一致が必須(§3.5)
      const token = new URL(request.url).searchParams.get("t");
      if (!token || !book.shareTokenHash || book.shareTokenHash !== sha256(token)) {
        return fail("not_found", "ブックが見つかりません");
      }
    } else if (book.visibility !== "public") {
      return fail("not_found", "ブックが見つかりません");
    }

    // 受験者向けの公開射影(正解・解説は含めない。§5.3)
    const ast = book.ast as unknown as BookAst;
    const publicBook = toPublic(ast);
    return json(
      {
        book: {
          id: book.id,
          title: publicBook.meta.title,
          description: publicBook.meta.description ?? null,
          tags: publicBook.meta.tags,
          timeLimit: publicBook.meta.timeLimit ?? null,
          blocks: publicBook.blocks,
          assets: publicBook.assets,
          questionCount: publicBook.blocks.filter((b) => b.type === "question").length,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

const UpdateBook = z.object({
  source: z.string().min(1).max(2 * 1024 * 1024),
  expectedVersion: z.number().int().positive(),
  visibility: z.enum(["private", "link", "public", "invite"]).optional(),
  allowFork: z.boolean().optional(),
});

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    if (user.mustChangePassword) return passwordChangeRequired();
    const { id } = await params;

    const parsed = UpdateBook.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "リクエストが不正です", parsed.error.issues);
    }

    const saved = await saveBook({
      ownerId: user.id,
      bookId: id,
      source: parsed.data.source,
      expectedVersion: parsed.data.expectedVersion,
      ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.allowFork === undefined ? {} : { allowFork: parsed.data.allowFork }),
    });

    if (!saved.ok) {
      if (saved.reason === "parse") {
        return fail("parse_failed", "記法のエラーがあります", saved.diagnostics);
      }
      if (saved.reason === "conflict") {
        return fail("conflict", "他の変更が保存されています。再読み込みしてください");
      }
      if (saved.reason === "forbidden") return fail("forbidden", "編集権限がありません");
      return fail("not_found", "ブックが見つかりません");
    }
    return json({ book: saved.book });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    const { id } = await params;

    // 論理削除(§9)。物理削除は別ジョブが BOOK_RETENTION_DAYS 後に実行する
    const result = await db.book.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date(), visibility: "private", shareTokenHash: null },
    });
    if (result.count === 0) return fail("not_found", "ブックが見つかりません");
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

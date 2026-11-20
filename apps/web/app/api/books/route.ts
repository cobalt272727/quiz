import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { collectQuestions, type BookAst } from "@qb/parser";
import { getCurrentUser } from "@/lib/auth";
import { listOwnBooks, saveBook } from "@/lib/books";
import { searchPublicBooks } from "@/lib/library";
import { db } from "@/lib/db";
import {
  clientIp,
  fail,
  handleRouteError,
  json,
  noStore,
  passwordChangeRequired,
  readJsonBody,
} from "@/lib/api";
import { consumeRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBook = z.object({
  source: z.string().min(1).max(2 * 1024 * 1024),
  visibility: z.enum(["private", "link", "public", "invite"]).optional(),
  allowFork: z.boolean().optional(),
});

/**
 * GET /api/books?scope=public&q=&tag=&cursor=  … 公開ライブラリ(§7.2)
 * GET /api/books?mine=1&q=&tag=                … 自分のブック
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const q = url.searchParams.get("q") ?? undefined;
    const tag = url.searchParams.get("tag") ?? undefined;

    if (scope === "public") {
      const page = await searchPublicBooks({
        ...(q ? { q } : {}),
        ...(tag ? { tag } : {}),
        ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor")! } : {}),
        ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
      });
      return json({ books: page.items, nextCursor: page.nextCursor }, { headers: noStore });
    }

    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");

    if (!q && !tag) {
      return json({ books: await listOwnBooks(user.id) }, { headers: noStore });
    }

    // 自分のブックの絞り込み
    const where: Prisma.BookWhereInput = {
      ownerId: user.id,
      deletedAt: null,
      ...(tag ? { tags: { has: tag } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await db.book.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, description: true, tags: true, visibility: true, version: true, updatedAt: true, ast: true },
    });
    return json(
      {
        books: rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          tags: row.tags,
          visibility: row.visibility,
          version: row.version,
          questionCount: collectQuestions((row.ast as unknown as BookAst).blocks).length,
          updatedAt: row.updatedAt,
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("unauthorized", "ログインが必要です");
    if (user.mustChangePassword) return passwordChangeRequired();

    const limit = await consumeRateLimit(`books:create:${clientIp(request)}`, WRITE_LIMIT);
    if (!limit.ok) {
      return fail("rate_limited", "作成の回数が多すぎます。しばらく待ってください", undefined, {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    const parsed = CreateBook.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return fail("invalid_request", "リクエストが不正です", parsed.error.issues);
    }

    const saved = await saveBook({
      ownerId: user.id,
      source: parsed.data.source,
      ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.allowFork === undefined ? {} : { allowFork: parsed.data.allowFork }),
    });

    if (!saved.ok) {
      if (saved.reason === "parse") {
        return fail("parse_failed", "記法のエラーがあります", saved.diagnostics);
      }
      return fail("invalid_request", "保存できませんでした");
    }
    return json({ book: saved.book }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

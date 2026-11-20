import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookRole, canEdit } from "@/lib/access";
import { EditorClient, type EditorBook } from "@/components/EditorClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "エディタ" };

export default async function NewBookPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const { book: bookId } = await searchParams;
  const user = await getCurrentUser();

  let initial: EditorBook | null = null;
  let assets: Array<{ id: string; name: string }> = [];
  let blocked = false;
  let readOnly = false;
  if (bookId && user) {
    const role = await bookRole(bookId, user.id);
    if (role === "viewer") readOnly = true;
  }
  if (bookId && user && !readOnly) {
    const found = await db.book.findFirst({
      where: { id: bookId, ownerId: user.id, deletedAt: null },
      select: { id: true, version: true, source: true, hiddenByAdmin: true },
    });
    if (found?.hiddenByAdmin && user.role !== "admin") blocked = true;
    const book = found && !blocked ? found : null;
    if (book) {
      initial = book;
      assets = await db.asset.findMany({
        where: { bookId: book.id },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
    }
  }

  if (blocked) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">このブックは公開停止中です</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          管理者によって非公開に設定されています。心当たりがない場合は、サイトの管理者へお問い合わせください。
        </p>
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">閲覧のみのメンバーです</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          このブックでは編集できません。受験はマイブックの「受験する」から行えます。
        </p>
      </div>
    );
  }

  return <EditorClient initial={initial} initialAssets={assets} signedIn={Boolean(user)} />;
}

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, json, noStore } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ user: null }, { headers: noStore });
    const [books, attempts] = await Promise.all([
      db.book.count({ where: { ownerId: user.id, deletedAt: null } }),
      db.attempt.count({ where: { userId: user.id } }),
    ]);
    return json({ user, counts: { books, attempts } }, { headers: noStore });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * 管理者ロールの付与・剥奪
 *
 *   pnpm admin:grant <loginId>          … 管理者にする
 *   pnpm admin:grant <loginId> --revoke … 一般ユーザーに戻す
 */
import { PrismaClient } from "@prisma/client";

const [loginId, flag] = process.argv.slice(2);
if (!loginId) {
  console.error("使い方: pnpm admin:grant <loginId> [--revoke]");
  process.exit(1);
}
const role = flag === "--revoke" ? "user" : "admin";

const prisma = new PrismaClient();
try {
  // loginId は式インデックスで一意(Prisma の unique ではない)ため updateMany を使う
  const updated = await prisma.user.updateMany({
    where: { loginId, deletedAt: null },
    data: { role },
  });
  if (updated.count === 0) {
    console.error(`ユーザーが見つかりません: ${loginId}`);
    process.exitCode = 1;
  } else {
    const user = await prisma.user.findFirst({
      where: { loginId },
      select: { loginId: true, name: true, role: true },
    });
    console.log(`更新しました: ${user?.loginId} (${user?.name}) role=${user?.role}`);
  }
} finally {
  await prisma.$disconnect();
}

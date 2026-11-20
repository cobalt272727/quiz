/**
 * パスワードの再設定(運用ツール)
 *
 *   pnpm user:passwd <loginId> <新しいパスワード>
 *
 * パスワードは scrypt ハッシュのみを保存しており平文は復元できないため、
 * 忘れた場合はこのコマンドで上書きする。停止中のユーザーは停止も解除できる:
 *
 *   pnpm user:passwd <loginId> <新しいパスワード> --unsuspend
 *
 * 管理者による「一時パスワード発行」(§3.4)は --temp を付ける。24 時間で失効し、
 * ログイン後にパスワード変更を強制する(未変更の間はブックの作成・保存ができない):
 *
 *   pnpm user:passwd <loginId> <一時パスワード> --temp
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../apps/web/lib/password.ts";

const [loginId, password, ...flags] = process.argv.slice(2);
const temp = flags.includes("--temp");
if (!loginId || !password) {
  console.error("使い方: pnpm user:passwd <loginId> <新しいパスワード> [--unsuspend] [--temp]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("パスワードは 8 文字以上にしてください");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const updated = await prisma.user.updateMany({
    where: { loginId, deletedAt: null },
    data: {
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
      mustChangePassword: temp,
      ...(flags.includes("--unsuspend") ? { suspendedAt: null } : {}),
    },
  });
  if (updated.count === 0) {
    console.error(`ユーザーが見つかりません: ${loginId}`);
    process.exitCode = 1;
  } else {
    // 既存セッションは失効させる(パスワード変更後の使い回しを防ぐ)
    const user = await prisma.user.findFirst({ where: { loginId }, select: { id: true } });
    if (user) {
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const note = temp ? " (一時パスワード: 24 時間で失効、ログイン後に変更が必要)" : "";
    console.log(`パスワードを更新しました: ${loginId}(既存セッションは失効)${note}`);
  }
} finally {
  await prisma.$disconnect();
}

-- DropIndex
DROP INDEX "Answer_attemptId_questionId_blankId_key";

-- DropIndex
DROP INDEX "Book_tags_gin_idx";

-- DropIndex
DROP INDEX "Bookmark_userId_bookId_questionId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- 上記の DROP INDEX は Prisma がスキーマ定義を知らない索引を消してしまうための差分。
-- 20260101000001_constraints で定義した制約・索引をそのまま復元する(§6.3)。
CREATE UNIQUE INDEX "Answer_attemptId_questionId_blankId_key"
  ON "Answer" ("attemptId", "questionId", "blankId") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "Bookmark_userId_bookId_questionId_key"
  ON "Bookmark" ("userId", "bookId", "questionId") NULLS NOT DISTINCT;

CREATE INDEX "Book_tags_gin_idx" ON "Book" USING GIN ("tags");

-- アカウント関連の検索を軽くする
CREATE INDEX "RecoveryCode_userId_unused_idx"
  ON "RecoveryCode" ("userId")
  WHERE "usedAt" IS NULL;

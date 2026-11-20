-- SPEC_v4 §6.3: Prisma で表現できない制約・索引
-- PostgreSQL 15 以上を前提とする(NULLS NOT DISTINCT を使用)。
-- pg_bigm を同梱した Docker イメージを使う場合は、最後の検索索引を
-- gin_bigm_ops に置き換える(§6.3)。既定は pg_trgm で代替する。

-- 拡張(日本語部分一致検索用)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ログイン ID は大文字小文字を区別せず一意。削除時は NULL にして解放する(§3.4)
CREATE UNIQUE INDEX "User_loginId_lower_key"
  ON "User" (lower("loginId"))
  WHERE "loginId" IS NOT NULL;

-- Answer は (attemptId, questionId, blankId) で一意。
-- NULL 同士を等しいとみなすため NULLS NOT DISTINCT を使う(§6.2, §6.3)
CREATE UNIQUE INDEX "Answer_attemptId_questionId_blankId_key"
  ON "Answer" ("attemptId", "questionId", "blankId") NULLS NOT DISTINCT;

-- Bookmark も同じ理由で NULLS NOT DISTINCT(§6.3)
CREATE UNIQUE INDEX "Bookmark_userId_bookId_questionId_key"
  ON "Bookmark" ("userId", "bookId", "questionId") NULLS NOT DISTINCT;

-- 公開ライブラリの部分索引(visibility = 'public' かつ 非表示・非削除のみ)
CREATE INDEX "Book_public_library_idx"
  ON "Book" ("visibility", "updatedAt" DESC)
  WHERE "visibility" = 'public' AND "hiddenByAdmin" = false AND "deletedAt" IS NULL;

-- タグ検索
CREATE INDEX "Book_tags_gin_idx" ON "Book" USING GIN ("tags");

-- タイトル + 説明の日本語部分一致検索(§6.3)。
-- description が NULL でも全体が NULL にならないよう coalesce する。
CREATE INDEX "Book_search_trgm_idx"
  ON "Book" USING GIN ((lower("title" || ' ' || coalesce("description", ''))) gin_trgm_ops);

-- 期限切れ検索を in_progress に限定して軽くする(§6.3)
CREATE INDEX "Attempt_in_progress_deadline_idx"
  ON "Attempt" ("deadlineAt")
  WHERE "status" = 'in_progress' AND "deadlineAt" IS NOT NULL;

-- ゲスト Attempt の資格情報失効検索(§7.6)
CREATE INDEX "Attempt_guest_expiry_idx"
  ON "Attempt" ("updatedAt")
  WHERE "userId" IS NULL AND "guestTokenHash" IS NOT NULL;

-- 論理削除済みブックの物理削除ジョブ用(§9)
CREATE INDEX "Book_deleted_purge_idx"
  ON "Book" ("deletedAt")
  WHERE "deletedAt" IS NOT NULL;

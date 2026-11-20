-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('private', 'link', 'public', 'invite');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('editor', 'viewer');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('question', 'blank');

-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('practice', 'exam', 'review');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'submitted', 'expired', 'abandoned');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "loginId" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "suspendedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "Visibility" NOT NULL DEFAULT 'private',
    "shareTokenHash" TEXT,
    "allowFork" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "ast" JSONB NOT NULL,
    "astVersion" INTEGER NOT NULL DEFAULT 1,
    "parserVersion" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hiddenByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "forkedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookVersion" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "ast" JSONB,
    "parserVersion" TEXT NOT NULL,
    "astVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookEntityId" (
    "bookId" TEXT NOT NULL,
    "kind" "EntityKind" NOT NULL,
    "id" TEXT NOT NULL,
    "firstVersion" INTEGER NOT NULL,
    "retiredVersion" INTEGER,

    CONSTRAINT "BookEntityId_pkey" PRIMARY KEY ("bookId","kind","id")
);

-- CreateTable
CREATE TABLE "QuestionRevision" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "gradingHash" TEXT NOT NULL,
    "gradingSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookMember" (
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookMember_pkey" PRIMARY KEY ("bookId","userId")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "bookVersion" INTEGER NOT NULL,
    "userId" TEXT,
    "guestTokenHash" TEXT,
    "mode" "AttemptMode" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "score" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxScore" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionRevision" INTEGER NOT NULL,
    "blankId" TEXT,
    "value" JSONB NOT NULL,
    "correct" BOOLEAN,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "selfGraded" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE INDEX "RateLimit_lockedUntil_idx" ON "RateLimit"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Book_shareTokenHash_key" ON "Book"("shareTokenHash");

-- CreateIndex
CREATE INDEX "Book_ownerId_idx" ON "Book"("ownerId");

-- CreateIndex
CREATE INDEX "Book_visibility_updatedAt_idx" ON "Book"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "Book_deletedAt_idx" ON "Book"("deletedAt");

-- CreateIndex
CREATE INDEX "Book_forkedFromId_idx" ON "Book"("forkedFromId");

-- CreateIndex
CREATE INDEX "BookVersion_bookId_createdAt_idx" ON "BookVersion"("bookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookVersion_bookId_version_key" ON "BookVersion"("bookId", "version");

-- CreateIndex
CREATE INDEX "BookEntityId_bookId_retiredVersion_idx" ON "BookEntityId"("bookId", "retiredVersion");

-- CreateIndex
CREATE INDEX "QuestionRevision_bookId_questionId_idx" ON "QuestionRevision"("bookId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionRevision_bookId_questionId_revision_key" ON "QuestionRevision"("bookId", "questionId", "revision");

-- CreateIndex
CREATE INDEX "BookMember_userId_idx" ON "BookMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_bookId_idx" ON "Asset"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_bookId_name_key" ON "Asset"("bookId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_guestTokenHash_key" ON "Attempt"("guestTokenHash");

-- CreateIndex
CREATE INDEX "Attempt_bookId_idx" ON "Attempt"("bookId");

-- CreateIndex
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");

-- CreateIndex
CREATE INDEX "Attempt_status_deadlineAt_idx" ON "Attempt"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "Attempt_bookId_status_idx" ON "Attempt"("bookId", "status");

-- CreateIndex
CREATE INDEX "Answer_attemptId_idx" ON "Answer"("attemptId");

-- CreateIndex
CREATE INDEX "Answer_attemptId_questionId_idx" ON "Answer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_idx" ON "Bookmark"("userId");

-- CreateIndex
CREATE INDEX "Bookmark_bookId_idx" ON "Bookmark"("bookId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_bookId_idx" ON "Bookmark"("userId", "bookId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareResult_attemptId_key" ON "ShareResult"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareResult_tokenHash_key" ON "ShareResult"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareResult_expiresAt_idx" ON "ShareResult"("expiresAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_bookId_idx" ON "Report"("bookId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookVersion" ADD CONSTRAINT "BookVersion_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookEntityId" ADD CONSTRAINT "BookEntityId_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionRevision" ADD CONSTRAINT "QuestionRevision_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookMember" ADD CONSTRAINT "BookMember_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookMember" ADD CONSTRAINT "BookMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareResult" ADD CONSTRAINT "ShareResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client のシングルトン。
 * Next.js の開発時は HMR でモジュールが再評価されるため、globalThis に保持する。
 */
const globalForPrisma = globalThis as unknown as { qbPrisma?: PrismaClient };

export const db =
  globalForPrisma.qbPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.qbPrisma = db;

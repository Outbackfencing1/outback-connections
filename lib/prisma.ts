// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

// Only create the client if DB envs exist (so local dev can still run without DB)
function hasDb() {
  return !!(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!hasDb()) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

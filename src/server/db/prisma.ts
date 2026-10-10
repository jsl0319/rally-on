import { createPrismaPg } from "./prisma-adapter";

import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/server/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = createPrismaPg(getDatabaseUrl());
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  const prisma = globalForPrisma.prisma ?? createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}

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
  // Reuse the connection pool in production too, including calls within one request.
  // Only the client is shared; user data and transactions remain request-scoped.
  return globalForPrisma.prisma ??= createPrismaClient();
}

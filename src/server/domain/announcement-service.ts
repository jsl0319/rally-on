import type { PrismaClient } from "@/generated/prisma/client";

export async function listAnnouncements(prisma: PrismaClient) {
  const items = await prisma.announcement.findMany({
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  return {
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      publishedAt: item.publishedAt.toISOString(),
    })),
  };
}

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const announcements: Array<{ title: string; body: string }> = [
  {
    title: "Rally On 비공개 테스트를 시작해요",
    body: "Rally On은 테니스 초보자가 비슷한 수준의 메이트를 찾아 부담 없이 약속을 잡도록 돕는 서비스예요. 사용해 보시고 느낀 점은 1:1 문의로 편하게 남겨주세요.",
  },
  {
    title: "코트 예약과 비용은 참여자끼리 직접 진행해요",
    body: "Rally On은 매칭과 채팅만 도와드려요. 코트 예약과 비용 정산은 서비스 밖에서 참여자끼리 직접 진행하며, Rally On이 결제하거나 예약을 보증하지 않아요.",
  },
];

async function seedAnnouncements() {
  for (const announcement of announcements) {
    const existing = await prisma.announcement.findFirst({ where: { title: announcement.title } });
    if (existing) {
      await prisma.announcement.update({ where: { id: existing.id }, data: { body: announcement.body } });
    } else {
      await prisma.announcement.create({ data: announcement });
    }
  }
}

seedAnnouncements()
  .then(() => console.info("공지사항 seed를 완료했어요."))
  .finally(async () => prisma.$disconnect());

import { config } from "dotenv";
import { createPrismaPg } from "../src/server/db/prisma-adapter";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";
import { regionSeed } from "./region-data";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient({
  adapter: createPrismaPg(getDatabaseUrl()),
});

async function seedRegions() {
  for (const [code, name, shortName, districts] of regionSeed) {
    await prisma.region.upsert({
      where: { code },
      update: { name, shortName, type: "CITY", active: true },
      create: { code, name, shortName, type: "CITY" },
    });

    for (const [index, district] of districts.entries()) {
      const districtCode = `${code}-${String(index + 1).padStart(3, "0")}`;
      await prisma.region.upsert({
        where: { code: districtCode },
        update: { name: district, parentCode: code, type: "DISTRICT", active: true },
        create: { code: districtCode, name: district, parentCode: code, type: "DISTRICT" },
      });
    }
  }
}

seedRegions()
  .then(() => console.info("전국 활동 지역 seed를 완료했어요."))
  .finally(async () => prisma.$disconnect());

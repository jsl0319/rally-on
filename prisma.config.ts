import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

import { parseDatabaseUrl } from "./src/server/env";

// `vercel env pull` stores development values in .env.local. Keep .env as a
// fallback so a conventional local PostgreSQL setup continues to work.
config({ path: ".env.local" });
config();

// 주의: DATABASE_URL_UNPOOLED가 먼저다. .env.local에 그 값이 있으면 `DATABASE_URL=...
// prisma migrate deploy`로 대상을 바꾼 줄 알아도 조용히 원래 데이터베이스가 바뀐다.
// 전용 E2E DB에 적용할 때는 `npm run db:migrate:e2e`를 쓴다.
const migrationDatabaseUrl = parseDatabaseUrl(process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL"));

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationDatabaseUrl,
  },
});

import { config } from "dotenv";
import { defineConfig } from "@playwright/test";

import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./tests/e2e/e2e-environment";

// README는 `E2E_DATABASE_URL`을 .env.local에 두라고 안내하는데, 이 설정 파일이
// 그것을 읽지 않아 셸에 직접 export하지 않으면 무조건 실패했다. prisma.config.ts와
// 같은 순서로 로드한다.
config({ path: ".env.local" });
config();

const e2eDatabaseUrl = requireE2eDatabaseUrl();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: E2E_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      APP_BASE_URL: E2E_BASE_URL,
      AUTH_SECRET: E2E_AUTH_SECRET,
      DATABASE_URL: e2eDatabaseUrl,
    },
  },
});

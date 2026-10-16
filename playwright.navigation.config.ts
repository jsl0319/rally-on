import { defineConfig } from "@playwright/test";
import base from "./playwright.court-chat.config";
import { E2E_BASE_URL } from "./tests/e2e/e2e-environment";

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected one local E2E server.");

export default defineConfig({
  ...base,
  testMatch: "navigation-history.spec.ts",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    ...webServer,
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    timeout: 180_000,
    env: { ...webServer.env, AUTH_URL: E2E_BASE_URL, NEXTAUTH_URL: E2E_BASE_URL },
  },
});

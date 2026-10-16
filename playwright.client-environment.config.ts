import { defineConfig } from "@playwright/test";
import base from "./playwright.navigation.config";
import { requireE2eDatabaseUrl } from "./tests/e2e/e2e-environment";

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected one local E2E server.");

export default defineConfig({
  ...base,
  testMatch: "client-environment.spec.ts",
  webServer: {
    ...webServer,
    env: { ...webServer.env, DATABASE_URL_UNPOOLED: requireE2eDatabaseUrl() },
  },
});

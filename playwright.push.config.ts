import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Provider calls are mocked in this suite; no production keys or subscriptions.
const pushEnv = {
  WEB_PUSH_ENABLED: "true",
  WEB_PUSH_PUBLIC_KEY: "test-public",
  WEB_PUSH_PRIVATE_KEY: "test-private",
  WEB_PUSH_SUBJECT: "mailto:push@example.test",
};
Object.assign(process.env, pushEnv);
const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected one local E2E server.");

export default defineConfig({
  ...base,
  testMatch: "web-push.spec.ts",
  timeout: 90_000,
  webServer: {
    ...webServer,
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
    env: { ...webServer.env, ...pushEnv },
  },
});

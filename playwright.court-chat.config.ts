import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected one local E2E server.");

export default defineConfig({
  ...base,
  testMatch: "court-chat.spec.ts",
  webServer: {
    ...webServer,
    // Match the production build path; Turbopack rejects the current ICO asset.
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
  },
});

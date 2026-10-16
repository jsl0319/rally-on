import { defineConfig } from "@playwright/test";
import base from "./playwright.client-environment.config";

export default defineConfig({
  ...base,
  testMatch: ["court-application-notice.spec.ts", "court-ball-contribution.spec.ts"],
});

import { defineConfig } from "@playwright/test";
import navigation from "./playwright.navigation.config";

export default defineConfig({ ...navigation, testMatch: "activity-badges.spec.ts" });

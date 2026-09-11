import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * 화면을 눈으로 훑기 위한 설정.
 *
 * 단언을 세우는 검사가 아니라 첫 사용자가 보는 순서대로 화면을 찍어 두는 용도라
 * 기본 E2E 실행(`*.spec.ts`)에 섞이지 않게 `*.tour.ts`만 고른다.
 */
export default defineConfig({
  ...base,
  testMatch: /.*\.tour\.ts$/,
  reporter: "list",
  timeout: 180_000,
  use: {
    ...base.use,
    // 훑기는 막힌 화면에서 오래 기다리면 안 된다. 못 누르면 빨리 포기하고 다음 화면으로 간다.
    // (비활성 버튼을 누르려 하면 기본값은 영영 기다린다.)
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },
});

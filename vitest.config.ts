import { defineConfig } from "vitest/config";

const alias = { "@": new URL("./src", import.meta.url).pathname };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", environment: "node", include: ["src/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          // 실제 DB 테스트는 데이터베이스 하나를 나눠 쓰고 매 테스트마다 users를
          // TRUNCATE 한다. 파일을 동시에 돌리면 서로가 만든 사용자를 지워, 원인이
          // 코드에 없는 실패가 무작위로 난다. 파일 단위로 차례대로 돌린다.
          fileParallelism: false,
        },
      },
    ],
  },
});

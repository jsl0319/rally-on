import { Client } from "pg";
import { auditCourtFinancialRetention } from "../src/server/domain/court-financial-retention-audit";

// Deliberately do not load dotenv or fall back to the app's DATABASE_URL.
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("RETENTION_AUDIT_DATABASE_URL을 명시한 뒤 npm run privacy:audit:financial 실행. 읽기 전용 건수·사유만 출력하며 데이터를 삭제하지 않습니다.");
} else if (args.length > 0) {
  console.error("지원하지 않는 인자입니다. --help로 사용법을 확인해 주세요.");
  process.exitCode = 1;
} else {
  let client: Client | undefined;
  try {
    const connectionString = process.env.RETENTION_AUDIT_DATABASE_URL?.trim();
    if (!connectionString || !["postgres:", "postgresql:"].includes(new URL(connectionString).protocol)) {
      throw new Error("AUDIT_CONNECTION_REQUIRED");
    }
    client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
    // Connection failures between queries must not surface unsanitized driver error events.
    client.on("error", () => { process.exitCode = 1; });
    await client.connect();
    const report = await auditCourtFinancialRetention(client);
    console.log(JSON.stringify(report, null, 2));
  } catch {
    // Driver messages can include connection details or data. Never print the original error.
    console.error("금융 정보 보존 점검에 실패했습니다. 점검용 DB 연결·스키마·조회 권한을 확인해 주세요. 부분 결과는 출력하지 않았습니다.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => { process.exitCode = 1; });
  }
}

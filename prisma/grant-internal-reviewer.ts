import { createInterface } from "node:readline/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";

config({ path: ".env.local" });
config();

/**
 * 내부 심사자 역할을 부여하거나 회수한다.
 *
 * 이 역할 하나로 사업자등록증 원문 열람, 채팅 메시지 숨김·발신 중지, 환불 실행,
 * 탈퇴 운영자 거래 인계가 모두 열린다. 그래서 웹에서 닿는 경로를 만들지 않는다.
 * 셸과 DB 접속 정보를 가진 사람만 실행할 수 있고, 무엇을 바꾸는지 보여 준 뒤
 * 사람이 직접 확인해야 적용된다(`04-erd.md`가 말하는 "보호된 서비스 외 절차").
 *
 * 손으로 UPDATE 문을 치는 것보다 나은 이유는 세 가지다. 대상이 한 명인지 확인하고,
 * 어느 데이터베이스를 바꾸는지 먼저 보여 주고, 바꾼 뒤 심사자 전원을 다시 세어 준다.
 *
 *   npm run role:reviewer -- --list
 *   npm run role:reviewer -- --grant "닉네임"
 *   npm run role:reviewer -- --revoke "닉네임"
 *
 * 사람이 없는 곳(CI 등)에서 돌릴 때만 --yes로 확인을 건너뛴다.
 */

const databaseUrl = getDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

function usage(): never {
  console.log(`
사용법
  npm run role:reviewer -- --list
  npm run role:reviewer -- --grant <닉네임 또는 사용자 ID> [--yes]
  npm run role:reviewer -- --revoke <닉네임 또는 사용자 ID> [--yes]
`.trim());
  process.exit(1);
}

/** 접속 문자열에서 사람이 알아볼 부분만 꺼낸다. 비밀번호는 절대 찍지 않는다. */
function describeDatabase() {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "알 수 없는 대상";
  }
}

async function findTarget(key: string) {
  const byId = /^[0-9a-f-]{36}$/i.test(key)
    ? await prisma.user.findUnique({ where: { id: key }, select: { id: true, nickname: true, role: true, status: true } })
    : null;
  if (byId) return [byId];
  return prisma.user.findMany({ where: { nickname: key }, select: { id: true, nickname: true, role: true, status: true } });
}

async function listReviewers() {
  const reviewers = await prisma.user.findMany({
    where: { role: "INTERNAL_REVIEWER" },
    select: { id: true, nickname: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (reviewers.length === 0) {
    console.log("내부 심사자가 없습니다. 이 상태에서는 운영자 승인·신고 처리·문의 답변·거래 인계가 모두 막힙니다.");
    return;
  }
  console.log(`내부 심사자 ${reviewers.length}명`);
  for (const reviewer of reviewers) console.log(`  ${reviewer.nickname} (${reviewer.id}) · ${reviewer.status}`);
}

async function confirm(question: string) {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) {
    console.error("확인을 받을 수 없는 환경입니다. 내용을 검토한 뒤 --yes를 붙여 다시 실행해 주세요.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} (y/N) `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((arg) => arg === "--list" || arg === "--grant" || arg === "--revoke");
  if (!mode) usage();

  console.log(`대상 데이터베이스: ${describeDatabase()}`);

  if (mode === "--list") {
    await listReviewers();
    return;
  }

  const key = args[args.indexOf(mode) + 1];
  if (!key || key.startsWith("--")) usage();

  const matches = await findTarget(key);
  if (matches.length === 0) {
    console.error(`"${key}"에 해당하는 계정을 찾지 못했습니다.`);
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(`"${key}"에 해당하는 계정이 ${matches.length}명입니다. 사용자 ID로 지정해 주세요.`);
    for (const found of matches) console.error(`  ${found.nickname} (${found.id})`);
    process.exitCode = 1;
    return;
  }

  const [target] = matches;
  const nextRole = mode === "--grant" ? "INTERNAL_REVIEWER" : "MEMBER";
  console.log(`대상: ${target.nickname} (${target.id}) · 계정 상태 ${target.status}`);
  console.log(`역할: ${target.role} → ${nextRole}`);

  if (target.role === nextRole) {
    console.log("이미 그 역할입니다. 바꾸지 않았습니다.");
    return;
  }
  // 정지·탈퇴한 계정에 권한을 주면 화면은 열리지 않으면서 DB에는 권한이 남는다.
  if (nextRole === "INTERNAL_REVIEWER" && target.status !== "ACTIVE") {
    console.error("활성 계정에만 부여할 수 있습니다.");
    process.exitCode = 1;
    return;
  }
  if (!(await confirm("이대로 바꿀까요?"))) {
    console.log("바꾸지 않았습니다.");
    return;
  }

  await prisma.user.update({ where: { id: target.id }, data: { role: nextRole } });
  console.log(`${target.nickname}의 역할을 ${nextRole}로 바꿨습니다.`);
  await listReviewers();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

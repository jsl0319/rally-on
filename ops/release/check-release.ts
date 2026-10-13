import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { releaseTarget as target, assessRelease, aliasSchema, deploymentSchema, deploymentListSchema, projectSchema } from "./release-status";

const exec = promisify(execFile);
async function command(bin: string, args: string[]) {
  try {
    const { stdout } = await exec(bin, args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    // CLI output may include credentials or personal account details. Do not echo it.
    throw new Error(`${bin} 조회 실패. 네트워크와 CLI 로그인 상태를 확인하세요.`);
  }
}
async function api(path: string) {
  const raw = await command("vercel", ["api", `${path}${path.includes("?") ? "&" : "?"}teamId=${target.teamId}`, "--raw"]);
  try { return JSON.parse(raw); } catch { throw new Error("Vercel이 JSON 응답을 반환하지 않았습니다."); }
}
async function remoteMain() {
  const remote = await command("git", ["remote", "get-url", "origin"]);
  if (!["https://github.com/jsl0319/rally-on.git", "https://github.com/jsl0319/rally-on", "git@github.com:jsl0319/rally-on.git"].includes(remote))
    throw new Error("현재 체크아웃의 origin이 Rally On 저장소가 아닙니다.");
  const output = await command("git", ["ls-remote", "origin", "refs/heads/main"]);
  const sha = output.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("원격 main의 커밋을 확인하지 못했습니다.");
  return sha;
}
async function allProductionDeployments() {
  const items: { uid: string; state: string }[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < 20; page++) {
    const result = deploymentListSchema.parse(await api(`/v6/deployments?projectId=${target.projectId}&target=production&limit=100${cursor === null ? "" : `&until=${cursor}`}`));
    items.push(...result.deployments);
    if (result.pagination.next === null) return items;
    if (cursor !== null && result.pagination.next >= cursor) throw new Error("배포 목록 페이지가 진행되지 않아 검증을 중단합니다.");
    cursor = result.pagination.next;
  }
  throw new Error("배포 목록을 모두 읽지 못했습니다. 대기 배포가 없다고 판정하지 않습니다.");
}

async function main() {
  const args = process.argv.slice(2);
  const candidate = args[0] === "--candidate";
  const expectedSha = candidate ? args[1] : args[0];
  const candidateId = candidate ? args[2] : undefined;
  if ((candidate && (args.length !== 3 || !/^dpl_[A-Za-z0-9]+$/.test(candidateId ?? ""))) || (!candidate && args.length > 1) || (expectedSha && !/^[a-f0-9]{40}$/.test(expectedSha)))
    throw new Error("사용법: npm run release:check -- [40자리 SHA] 또는 --candidate <40자리 SHA> <dpl_ID>");
  const [remoteSha, project, alias, deployments] = await Promise.all([
    remoteMain(), api(`/v9/projects/${target.projectId}`).then(x => projectSchema.parse(x)),
    api(`/v4/aliases/${target.domain}`).then(x => aliasSchema.parse(x)), allProductionDeployments(),
  ]);
  const deployment = deploymentSchema.parse(await api(`/v13/deployments/${candidateId ?? alias.deployment.id}`));
  const issues = assessRelease({ project, alias, deployment, deployments, remoteSha, expectedSha: expectedSha ?? remoteSha, candidate });
  // Detect changes during this check. This is a point-in-time check, not a lock.
  const [lastSha, lastAlias] = await Promise.all([remoteMain(), api(`/v4/aliases/${target.domain}`).then(x => aliasSchema.parse(x))]);
  if (lastSha !== remoteSha || lastAlias.deployment.id !== alias.deployment.id) issues.push("점검 도중 main 또는 운영 주소가 바뀌었습니다. 다시 확인하세요.");
  console.log(`대상: ${target.repository} / ${target.branch}\n커밋: ${expectedSha ?? remoteSha}\n배포: ${deployment.id}\n운영: https://${target.domain}`);
  if (issues.length) {
    for (const issue of issues) console.error(`확인 필요: ${issue}`);
    process.exitCode = 1;
    return;
  }
  if (!candidate) {
    const responses = await Promise.all(["/login", "/api/health", "/api/v1/me"].map(async path => {
      const r = await fetch(`https://${target.domain}${path}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const expected = path === "/api/v1/me" ? 401 : 200;
      if (r.status !== expected) throw new Error(`${path}: 예상 ${expected}, 실제 ${r.status}`);
      await r.body?.cancel();
      return `${path} ${r.status}`;
    }));
    console.log(responses.join(" · "));
  }
  console.log(candidate ? "후보 점검 통과. 화면 검증 후 이 배포 ID만 promote 하세요." : "운영 버전·연결·대기열 점검 통과. 변경 화면의 실제 동작도 별도로 확인하세요.");
}
main().catch(error => {
  const reason = error instanceof Error && error.name !== "ZodError" ? error.message : "Vercel 응답 형식이 예상과 다릅니다.";
  console.error(`점검 실패: ${reason} 완료로 간주하지 않습니다.`);
  process.exitCode = 1;
});

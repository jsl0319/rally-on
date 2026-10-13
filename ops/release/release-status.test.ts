import { describe, expect, it } from "vitest";
import { assessRelease, releaseTarget as t, type ReleaseSnapshot } from "./release-status";
const sha = "a".repeat(40);
function snapshot(): ReleaseSnapshot {
  return {
    project: { id: t.projectId, accountId: t.teamId, autoAssignCustomDomains: false, link: { type: "github", org: "jsl0319", repo: "rally-on", productionBranch: "main" } },
    alias: { alias: t.domain, deployment: { id: "dpl_current" } },
    deployment: { id: "dpl_current", projectId: t.projectId, target: "production", readyState: "READY", gitSource: { sha, ref: "main" } },
    deployments: [{ uid: "dpl_current", state: "READY" }, { uid: "dpl_failed", state: "ERROR" }],
    expectedSha: sha, remoteSha: sha, candidate: false,
  };
}
describe("운영 반영 점검", () => {
  it("같은 최신 커밋·연결·자동 연결 해제·종료된 배포만 통과한다", () => expect(assessRelease(snapshot())).toEqual([]));
  it("지난 장애처럼 오래된 배포가 운영 주소를 차지하면 실패한다", () => {
    const s = snapshot(); s.deployment.gitSource!.sha = "b".repeat(40);
    expect(assessRelease(s).join(" ")).toContain("배포 커밋");
  });
  it("READY여도 운영 도메인이 다른 배포를 가리키면 실패한다", () => {
    const s = snapshot(); s.alias.deployment.id = "dpl_previous";
    expect(assessRelease(s).join(" ")).toContain("운영 주소");
  });
  it("아직 연결하지 않은 후보는 최신 production READY일 때만 통과한다", () => {
    const s = snapshot(); s.candidate = true; s.deployment.id = "dpl_candidate";
    expect(assessRelease(s)).toEqual([]);
    s.deployment.target = "preview";
    expect(assessRelease(s).join(" ")).toContain("Production");
  });
  it.each(["QUEUED", "BUILDING", "INITIALIZING", "BLOCKED", "UNKNOWN"])("%s 배포를 완료로 오인하지 않는다", state => {
    const s = snapshot(); s.deployments.push({ uid: "dpl_late", state });
    expect(assessRelease(s).join(" ")).toContain("미완료 운영 배포");
  });
  it("점검 대상으로 지정한 커밋보다 원격 main이 앞서면 실패한다", () => {
    const s = snapshot(); s.remoteSha = "b".repeat(40);
    expect(assessRelease(s).join(" ")).toContain("원격 main");
  });
  it("자동 연결이 남아 있으면 현재 버전이 맞아도 실패한다", () => {
    const s = snapshot(); s.project.autoAssignCustomDomains = true;
    expect(assessRelease(s).join(" ")).toContain("후속 빌드");
  });
  it("다른 프로젝트·팀·저장소를 배포 대상으로 인정하지 않는다", () => {
    const s = snapshot(); s.project.accountId = "other"; s.project.link.repo = "other";
    expect(assessRelease(s)).toHaveLength(2);
  });
  it("커밋 정보가 없는 배포와 서로 다른 Git 출처를 차단한다", () => {
    const s = snapshot(); s.deployment.gitSource = null;
    expect(assessRelease(s)).not.toEqual([]);
    s.deployment.meta = { githubCommitSha: sha, githubCommitRef: "main" };
    expect(assessRelease(s)).toEqual([]);
    s.deployment.gitSource = { sha: "b".repeat(40), ref: "main" };
    expect(assessRelease(s).join(" ")).toContain("출처");
  });
});

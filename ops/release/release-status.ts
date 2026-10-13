import { z } from "zod";

// Resource identifiers are not credentials. Keep checks scoped to this service.
export const releaseTarget = {
  projectId: "prj_fUbFlXvgi3mSMGF3rzzA9WIqnOgS",
  teamId: "team_pt89jk63dVzngkTLBR9FT0BM",
  domain: "tennis-mate-ochre.vercel.app",
  repository: "jsl0319/rally-on",
  branch: "main",
};
export const deploymentSchema = z.object({
  id: z.string(), projectId: z.string(), readyState: z.string(),
  target: z.string().nullable(),
  meta: z.object({ githubCommitSha: z.string().optional(), githubCommitRef: z.string().optional() }).optional(),
  gitSource: z.object({ sha: z.string().optional(), ref: z.string().optional() }).nullish(),
});
export const projectSchema = z.object({
  id: z.string(), accountId: z.string(), autoAssignCustomDomains: z.boolean(),
  link: z.object({ type: z.string(), org: z.string(), repo: z.string(), productionBranch: z.string() }),
});
export const aliasSchema = z.object({ alias: z.string(), deployment: z.object({ id: z.string() }) });
export const deploymentListSchema = z.object({
  deployments: z.array(z.object({ uid: z.string(), state: z.string() })),
  pagination: z.object({ next: z.number().nullable() }),
});
export type ReleaseSnapshot = {
  project: z.infer<typeof projectSchema>;
  deployment: z.infer<typeof deploymentSchema>;
  alias: z.infer<typeof aliasSchema>;
  deployments: z.infer<typeof deploymentListSchema>["deployments"];
  expectedSha: string;
  remoteSha: string;
  candidate: boolean;
};

export function assessRelease(s: ReleaseSnapshot): string[] {
  const issues: string[] = [];
  const { project: p, deployment: d } = s;
  if (p.id !== releaseTarget.projectId || p.accountId !== releaseTarget.teamId || d.projectId !== p.id)
    issues.push("프로젝트 또는 팀이 Rally On 운영 대상과 다릅니다.");
  if (`${p.link.org}/${p.link.repo}` !== releaseTarget.repository || p.link.type !== "github" || p.link.productionBranch !== releaseTarget.branch)
    issues.push("Git 저장소 또는 운영 브랜치 연결이 다릅니다.");
  if (p.autoAssignCustomDomains)
    issues.push("운영 도메인 자동 연결이 켜져 있어 후속 빌드가 현재 버전을 덮어쓸 수 있습니다.");
  if (!/^[a-f0-9]{40}$/.test(s.expectedSha) || s.expectedSha !== s.remoteSha)
    issues.push("대상 커밋이 현재 원격 main의 최신 커밋과 다릅니다.");
  const sha = d.gitSource?.sha ?? d.meta?.githubCommitSha;
  const branch = d.gitSource?.ref ?? d.meta?.githubCommitRef;
  if (sha !== s.expectedSha || (d.meta?.githubCommitSha && d.meta.githubCommitSha !== sha))
    issues.push("배포 커밋이 요청한 커밋과 다르거나 출처를 확인할 수 없습니다.");
  if (branch !== releaseTarget.branch || (d.meta?.githubCommitRef && d.meta.githubCommitRef !== branch))
    issues.push("배포가 main에서 만들어졌는지 확인할 수 없습니다.");
  if (d.target !== "production" || d.readyState !== "READY")
    issues.push("Production 환경에서 정상 빌드가 끝난 배포가 아닙니다.");
  if (s.alias.alias !== releaseTarget.domain || (!s.candidate && s.alias.deployment.id !== d.id))
    issues.push("운영 주소가 확인하려는 배포와 연결되어 있지 않습니다.");
  // Fail closed for unknown/blocked states, not only the three common pending states.
  const unsettled = s.deployments.filter(x => !["READY", "ERROR", "CANCELED"].includes(x.state));
  if (unsettled.length) issues.push(`미완료 운영 배포 ${unsettled.length}개: ${unsettled.map(x => `${x.uid} (${x.state})`).join(", ")}`);
  return issues;
}

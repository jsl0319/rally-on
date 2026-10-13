# 운영 배포와 최종 확인

## 1. 목적과 적용 대상

늦게 끝난 이전 커밋의 자동 배포가 새 운영 화면을 덮어쓰는 일을 막는다. 기존 Vercel 프로젝트와 Git 연결을 유지하고, 별도 배포 서버·유료 서비스·새 의존성을 추가하지 않는다.

- 저장소: `jsl0319/rally-on`, 운영 브랜치: `main`
- 프로젝트: `jinni1/rally-on` (`prj_fUbFlXvgi3mSMGF3rzzA9WIqnOgS`)
- 운영 주소: <https://tennis-mate-ochre.vercel.app>
- iPhone 검증 앱도 이 운영 주소의 화면을 사용한다. 웹 변경만으로 네이티브 앱을 다시 설치하지 않는다.

## 2. 2026-10-13 확인한 장애

1. 최신 `547a961` CLI 배포 `dpl_FQLeZxDxybAHZ1L6szAApiQhZRWo`가 정상 빌드되고 운영에 연결됐다.
2. 이전 커밋 `ff768a5`의 Git 자동 배포 `dpl_A5aRyjnX7W8kSmUW5tjDzphoymwC`가 나중에 끝나 운영 주소를 차지했다.
3. 최신 커밋의 Git 배포 `dpl_EdsPth9kkimBRg44PRdQAoogi3nX`는 `git_info_fail`, `Git information retrieval failed for this deployment.`로 실패했다. 빌드 이벤트가 없어 앱 컴파일 오류로 판단할 근거는 없다.
4. 최신 정상 배포를 다시 promote해 복구했고, 사용자가 수정 화면을 확인했다.

GitHub에서 해당 커밋이 존재하고 CI `verify`가 성공한 것을 확인했다. 정확한 Git 정보 조회 실패의 내부 원인은 Vercel 응답만으로 특정하지 못했다. 임의로 토큰을 교체하거나 Git 연결을 끊지 않는다. 재발하면 같은 프로젝트·커밋의 이벤트와 저장소 접근 상태를 확인한다.

## 3. 적용된 운영 방식 — 2026-10-13

사용자가 ‘검증 후 운영 반영으로 변경’을 승인했고, 프로젝트의 `autoAssignCustomDomains`를 `false`로 변경한 뒤 재조회해 확인했다. Git push에 따른 빌드는 유지된다(`gitProviderOptions.createDeployments: enabled`, 운영 브랜치 `main`). 이후 빌드는 운영 주소에 자동 연결되지 않으며, 확인한 최신 배포를 `vercel promote`로 한 번만 반영한다.

- 장점: 늦은 자동 빌드와 수동 빌드가 완료돼도 운영 주소를 임의로 바꾸지 않는다.
- 달라지는 점: `git push`만으로 운영 반영이 끝나지 않는다. 배포 요청을 처리하는 개발자가 최종 promote와 확인을 수행한다.
- 더 단순한 대안: Git 자동 배포만 사용하고 수동 배포를 금지할 수 있다. 다만 이번처럼 Git 단계가 실패하는 경우 수동 복구 경로가 필요하므로, 자동 연결 해제가 더 명확하다.
- 변경 범위: 운영 연결 방식 한 가지. 기존 앱 코드·DB·인증·요금제는 유지한다.
- 설정 전후 운영 별칭은 모두 `dpl_FQLeZxDxybAHZ1L6szAApiQhZRWo`로 같았다. 현재 운영 화면은 유지됐다.

공식 근거: [Vercel의 staged production 배포](https://vercel.com/docs/deployments/promoting-a-deployment#staging-and-promoting-a-production-deployment).

## 4. 평상시 배포 순서

1. `git status`와 사용자 요청 범위를 확인한다. 다른 작업자의 미커밋 변경을 섞지 않는다.
2. 관련 검사·화면 검증을 마친 변경만 커밋해 main에 push한다. Git 자동 빌드가 생기면 같은 커밋을 CLI로 중복 배포하지 않는다.
3. 해당 커밋의 Git 배포가 `READY`가 될 때까지 확인한다. 대기 중이라는 이유로 곧바로 CLI 배포를 추가하지 않는다.
4. 실행 직전 원격 main의 전체 SHA를 확인한다. 아래 명령은 실제 SHA와 배포 ID로 실행한다.

   ```bash
   npm run release:check -- --candidate <40자리-main-SHA> <dpl_ID>
   ```

5. 해당 배포의 변경 화면을 확인한다. 인증 보호가 있으면 기존 권한으로 확인하고 보호를 끄지 않는다. 운영에서 실제 참가 신청이나 송금을 테스트 목적으로 자동 실행하지 않는다.
6. 후보 점검을 통과한 **정확한 배포 ID**만 운영에 반영한다.

   ```bash
   vercel promote <dpl_ID> --yes --scope jinni1
   npm run release:check -- <40자리-main-SHA>
   ```

7. 운영 주소에서 변경 화면·핵심 동작을 확인한다. 이 확인 뒤 최종 점검 명령을 다시 실행하고, 커밋·배포 ID·확인 범위를 보고한다.

`READY`는 빌드 성공일 뿐 운영 반영 완료가 아니다. 후보 검사와 promote 사이 main 또는 설정이 바뀌면 다시 점검한다. 점검 명령은 시점 조회이며 다른 운영자가 동시에 수동 promote하는 것을 잠그지 않는다. 배포 담당자는 한 명으로 정하고 코드 작업만 병행한다.

## 5. Git 배포 실패 시 예외

- 우선 실패 상태·오류 코드를 확인한다. GitHub의 해당 커밋과 CI 상태도 확인한다.
- 같은 SHA의 Git 재배포를 우선한다. 새 커밋이 이미 있으면 이전 SHA를 재배포하지 않는다.
- Git 소스를 가져오지 못하는 문제가 계속되면, **현재 원격 main의 Git archive**로 만든 깨끗한 임시 디렉터리에서만 CLI 배포한다. `.env`와 미커밋 파일을 복사하지 않는다.
- CLI도 `--prod --skip-domain`으로 생성해 후보 상태에서 먼저 확인한다. Git SHA·main 브랜치 메타데이터와 프로젝트 연결을 정확히 남긴다. 메타데이터는 출처의 서명이 아니므로 실제 archive SHA 확인을 생략하지 않는다.
- 생성이 끝나면 4절의 후보 검사 → 화면 확인 → promote → 최종 확인을 동일하게 수행한다.
- 성공한 CLI 배포 뒤에 Git 재배포를 또 시작하지 않는다. 자동 연결을 해제했더라도 불필요한 중복 빌드는 피한다.

### DB 주의

`vercel-build`는 `prisma migrate deploy`를 실행한다. **운영 주소 미연결은 DB 쓰기 차단이 아니다.** Production 후보 빌드도 운영 DB 마이그레이션을 수행할 수 있다. 스키마 변경이 있는 배포는 사용자 승인·현재 운영 코드와의 호환성·복구 지점 확인 후 진행한다. 앱 rollback과 DB 복원은 별개다.

## 6. 점검 명령의 범위

`npm run release:check`는 원격 main, Vercel 프로젝트·별칭·배포 목록, `/login`, `/api/health`, 비로그인 `/api/v1/me`를 조회한다. 배포·취소·승격·DB 쓰기를 실행하지 않으며 환경변수 값을 요청하거나 출력하지 않는다. 프로젝트 응답은 필요한 필드만 검증하고 전체 응답과 CLI 오류 원문은 출력하지 않는다.

실패 조건:

- 프로젝트·팀·Git 저장소·운영 브랜치 불일치
- 자동 도메인 연결이 켜져 있음
- 대상 SHA와 현재 원격 main, 배포 SHA 불일치 또는 출처 누락
- Production/READY 아님
- 운영 주소가 대상 배포를 가리키지 않음(최종 확인)
- 대기·빌드·보류·알 수 없는 상태의 운영 배포가 남아 있음
- 점검 중 원격 main 또는 별칭이 변경됨
- API 오류·권한 문제·응답 형식 변경·배포 페이지 조회 미완료
- 로그인·health·비로그인 API의 예상 응답 불일치(최종 확인)

명령이 통과해도 로그인 후 실제 화면과 iPhone 동작 검증을 대신하지 않는다. 자동 연결 해제 설정은 매번 확인한다. 현재 배포 복구가 필요한 경우에는 최신 main 요구를 임의로 우회하지 말고, 되돌릴 SHA·DB 호환성을 따로 기록하고 명시적으로 rollback한다.

## 7. 설정 변경 직후의 검증 기록 — 첫 배포 전

- lint·typecheck·production build 통과.
- 단위 테스트 442개 통과(새 배포 점검 테스트 13개 포함). DB 연동 테스트 123개는 별도 환경 조건에 따라 skipped이며 이번 변경으로 DB를 수정하지 않았다.
- 설정 변경 당시 원격 main과 운영 주소는 `547a9617d7abea7184f7539a32a7a091f0f7a83e`로 일치하고, 미완료 운영 배포는 없었다.
- 설정 적용 전 실제 점검 명령은 `autoAssignCustomDomains: true`를 감지해 의도대로 실패했다. 올바른 운영 버전이라는 이유로 재발 가능성을 무시하지 않는다.
- 사용자 승인 후 자동 연결을 해제했고, 재조회에서 `false`와 Git 자동 빌드 유지, 기존 운영 배포 유지가 확인됐다.
- 변경 후 `npm run release:check`가 종료 코드 0으로 통과했다. 최신 원격 main·실제 운영 배포 일치, 미완료 운영 배포 없음, `/login` 200·`/api/health` 200·비로그인 `/api/v1/me` 401을 확인했다.
- 설정 변경 자체를 위해 새 배포를 만들지는 않았다. 실제 배포 때는 staged 상태 유지·promote 후 설정 유지까지 4절 절차로 검증하고, 최종 보고에 커밋·배포 ID와 결과를 남긴다. 이 절의 기록만으로 전체 배포 흐름을 검증했다고 간주하지 않는다.

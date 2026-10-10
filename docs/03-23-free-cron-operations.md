# 무료 크론 운영

기준: 2026-10-10 · 사용자 승인: 크론 보류 해제, 무료 방식부터 도입.

## 목적과 범위

접속자가 없어도 입금 기한 만료·최소 구성 미달 취소·모집 마감·채팅 종료를 처리한다.
이미 있는 API와 도메인 규칙을 재사용하므로 새 관리 화면·DB 테이블·앱 의존성은 추가하지 않는다.
Cloudflare Workers Free의 예약 실행 1개로 기존 앱을 호출한다. 더 단순한 Vercel 일일 크론은
당일 참가 신청 기한 처리에 너무 늦어 보조 경로로 유지한다. 유료 플랜으로 바꾸지 않는다.

**현재 단계:** 앱과 비활성 Worker 배포·전용 키 등록 완료. 실제 운영 상태 정리와 예약 활성화는 명시적 승인 대기다. 사용자가 Cloudflare 공식 CLI의 계정 조회·Worker 코드/예약 변경·실행 로그 조회 권한 연결을 명시적으로 승인했고 OAuth 연결을 완료했다.

## 실행과 비용

- Worker: `rally-on-lifecycle-cron`, 코드/설정: `ops/cron/worker.ts`, `ops/cron/wrangler.jsonc`.
- 계획 주기: UTC `*/15 * * * *` (한국 시간도 매시 00·15·30·45분), 하루 96회.
- 상태 보정만 이 주기로 호출한다. 이미지·증빙 파기 등 기존 일일 정리 작업은 그대로 둔다.
- 실제 입금·확정 기한은 기존 규칙 그대로다. 예약 처리·앱 내 알림은 정상 상황에서도 다음 실행까지 약 15분 늦을 수 있으며 서비스 장애 시 더 늦어진다. 지연 실행에도 실제 판정 시각의 확정 이력을 사용한다.
- 신청·확정·상세 조회 때의 서버 판정도 유지한다. 크론 지연을 기한 연장으로 처리하지 않는다.
- Cloudflare Free: 일 100,000 요청·트리거 5개·CPU 10ms. Worker는 HTTP 호출만 하고 실제 DB 작업은 Vercel이 수행한다. 네트워크 대기와 CPU 시간은 다르다.
- Neon Free 월 100 CU-hours는 개발/운영 브랜치가 함께 사용한다. 현재 운영 컴퓨트는 0.25 CU 고정이며 자동 중지되는 것을 확인했다. 이상적인 5분 활성 후 중지라면 15분 크론만으로 30일 약 60 CU-hours다. 실제 중지 지연·트래픽·개발 사용을 포함하면 늘어나므로 무료 유지의 보장은 아니다.
- 매분/5분 호출은 DB를 계속 활성화해 30일 약 180 CU-hours를 쓸 수 있어 선택하지 않는다. 운영자는 도입 다음 날과 첫 주에 Neon Usage의 실제 소모량을 확인하고, 월 한도에 근접할 전망이면 주기와 호스팅 계획을 재검토한다. 임의 유료 전환은 하지 않는다.

## 인증과 실패 처리

- 외부에는 `RECONCILE_CRON_SECRET`만 전달한다. 최소 32바이트 난수로 생성해 Vercel Production과 Cloudflare Worker의 Secret으로 저장한다. 코드·명령 인수·문서·로그에 실제 값을 넣지 않는다.
- 기존 `CRON_SECRET`은 유지한다. 새 키는 상태 보정 API에만 유효하며 파기 API에 사용할 수 없다. DB 접속 문자열을 Cloudflare에 전달하지 않는다.
- 호출 URL은 운영 HTTPS 주소로 고정한다. 리디렉션을 따라가지 않고 HTTP 200과 JSON `status: ok`를 모두 확인한다. 인증 실패·로그인 HTML·5xx를 성공으로 처리하지 않는다.
- 앱 실행 제한 60초, 호출 대기 90초. 실패를 숨기지 않고 scheduled Promise를 reject하여 Cron Event 실패로 남긴다. 원문 응답·비밀키·개인정보는 기록하지 않는다.
- 타임아웃 때 서버 실행이 남아 있을 수 있으므로 즉시/플랫폼 자동 재시도 대신 다음 주기에 다시 판정한다. 이미 반영된 항목은 기존 행 잠금·상태 검사로 재처리하지 않는다. 자동 송금 기능은 아니다.
- 공개 HTTP 실행 주소(`workers.dev`/미리보기 URL)는 비활성화한다. 예약 이벤트만 사용한다.

## 배포 순서

1. 공식 npm 도구 `npx --yes wrangler@4.149.0`를 사용한다. 앱 의존성으로 설치하지 않는다. 계정 조회·Worker 변경·실행 로그 조회 권한만 요청한다.
2. `triggers.crons: []` 상태로 먼저 Worker를 배포한다. Cloudflare 계정이 Free인지 확인한다.
3. 전용 키를 두 서비스의 보호된 환경변수에 등록한다. Preview/Development에는 등록하지 않는다.
4. 해당 키를 수용하는 앱 코드를 운영에 배포하고, 인증 없는 요청 401·새 키의 성공 응답을 확인한다. 기존 키 호환성은 단위 테스트로 검증하며 기존 운영 키 원문은 조회하지 않는다. 인증 호출은 실제 만료 상태를 정리할 수 있다.
5. 설정의 `crons`를 `["*/15 * * * *"]`로 바꾸고 Worker를 다시 배포한다. 변경 전파는 최대 15분, 처음 Cron Events 표시에는 최대 30분이 걸릴 수 있다.
6. 실제 예약 이벤트의 성공과 Vercel 작업 완료 로그를 확인한다. 단순 수동 API 성공이나 설정 저장만으로 예약 실행 검증 완료라고 쓰지 않는다.

## 1인 운영 확인·재실행·중지

- Cloudflare → Workers & Pages → 해당 Worker → Cron Events/Logs에서 마지막 성공과 `rally.cron.failed`를 확인한다. 초기에는 매일 운영 업무를 시작할 때 확인한다. 외부 이메일 알림이나 장기 이력 저장 시스템은 이번에 추가하지 않는다.
- Vercel Logs의 `cron.reconcile_started_matches.completed`에서 처리 건수와 실행 시간을 본다. 작업별 실패는 `...failed`로 남는다.
- 401/403: 키 등록·앱 배포·접근 보호를 확인한다. 3xx: 도메인 이동을 확인한다. 429/5xx/타임아웃: 앱·DB 장애/사용량을 확인한다. 인증 검사를 끄는 방식으로 해결하지 않는다.
- 문제 해결 후 다음 주기를 기다리거나 보호된 로컬 환경에서 기존 API를 한 번 호출한다. 키를 URL이나 셸 인수에 넣지 않는다. 일부 처리 후 실패했어도 완료 항목을 초기화하지 않는다.
- 중지: `ops/cron/wrangler.jsonc`의 `triggers.crons`를 `[]`로 바꾸고 같은 Worker에 배포한다. 필요 시 Vercel Production의 전용 키도 제거 후 앱 재배포한다. 기존 Vercel 일일 크론과 사용자 요청 시 보정은 유지된다.

## 검증 기록

- 전용 키 인증·미인증 차단, 잘못된 상태/응답·리디렉션·네트워크 실패·민감 로그 방지 테스트.
- 전용 로컬 DB에서 이용자 조회 없이 배치를 실행하고, 동시에 두 번 실행/다음 주기 재실행 시 취소·만료·알림이 중복되지 않는지 및 실제 입금 반환 대상 보존 확인.
- 린트·타입 검사·테스트·프로덕션 빌드, Wrangler dry-run.
- 실제 결과와 배포 ID/실행 시각은 검증 완료 후 아래에 추가한다.

로컬 확인: 관련 API/Worker 31개, 전체 단위 테스트 408개, 코트 매칭 실제 DB 테스트 78개 통과.
실제 DB 검증에는 무접속 배치·동시 배치·다음 주기 재실행과 반환 대상 보존이 포함된다.
Wrangler 4.149.0 dry-run 번들링도 통과했다.
린트·TypeScript·프로덕션 빌드 통과. Cloudflare 계정의 Current plan이 Free($0)임을 확인하고,
예약/공개 URL이 꺼진 Worker를 먼저 배포했다(초기 버전 `8a2d1e18-87c9-47f0-92fd-5f7c293eb1c0`).

- 코드 커밋 `e1213bd`, main 푸시 완료. [CI 38024412897](https://github.com/jsl0319/rally-on/actions/runs/38024412897) 성공.
- 운영 앱 `dpl_6FRARxPY2ScBZBAaFaqfbJXug6HT` READY. 상태 보정 API 미인증 401, health/login 200 확인.
- 전용 키는 Vercel Production의 sensitive 변수와 Cloudflare Worker secret_text에만 등록했다. 실제 값을 코드나 로그에 넣지 않았다.
- 자동 승인 검토가 실제 매칭 만료·취소·알림 생성 및 기존 운영 키 조회를 포함한 테스트를 차단했다. 기존 키 조회는 제거했으며, 실제 운영 상태 정리와 15분 자동 실행에 대한 추가 승인 전에는 실행하지 않는다. 현재 `triggers.crons`는 빈 배열이며 예약 실행 성공으로 표시하면 안 된다.

## 공식 근거

- [Cloudflare 제한](https://developers.cloudflare.com/workers/platform/limits/), [무료 요금제](https://developers.cloudflare.com/workers/platform/pricing/), [Cron Triggers·전파·실행 이력](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- [Neon Free 월 100 CU-hours](https://neon.com/blog/neon-free-plan-1-gb-per-project), [5분 자동 중지](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md).
- 무료 크론은 상업용 호스팅 요금제 조건과 별개다. 기존 [무료 옵션 비교 및 한계](03-21-small-pilot-operations-readiness.md)의 호스팅 조건을 함께 확인한다.

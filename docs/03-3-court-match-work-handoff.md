# 코트 매칭 재설계 인수인계

작성일: 2026-09-08 · 작성: Claude (Cowork) · 이전 노트: `handoff.md`

설계는 `docs/03-2-court-match-operator-hosted-redesign.md`가 정본이다. 이 노트는
**어디까지 했고 다음에 무엇을 하는지**만 적는다.

## 1. 이번 세션에서 한 일

`dac9d4d` 이후 14개 커밋. 크게 두 덩어리다.

**(a) 기존 모델 위에서의 개선 — `5fa0a6a` ~ `fcb9ec9`**

지난 시간이 목록에 남던 버그, 카드 정보 부족, 개설 폼 격차, 사용자 문구("세션" →
"코트 매칭"), 현장 이용 안내 누락, 비용 모델(총액 나눗셈 → 고정 게스트 참가비)을
고쳤다. 이 중 **비용 모델과 현장 이용 안내는 새 모델에서도 그대로 살아남는다.**

**(b) 운영자 주최 모델로의 전환 — `0f03408` 이후**

작업 중 코트 매칭의 주최자가 구현과 다르다는 것이 드러났다. 중간의 세션 모집자
(일반 플레이어)가 없어지고 **운영자가 직접 코트 매칭을 만들어 참가 신청을 받고
확정한다.** 재설계 문서를 쓰고, 데이터 모델과 운영자 입력 단계까지 구현했다.

## 2. 지금 상태

| 단계 | 상태 |
| --- | --- |
| 1. 데이터 모델 | **완료** (`74c028d`). 마이그레이션 로컬 적용 확인됨 |
| 2. 운영자 입력(조건·계좌) | **완료** (`0483eec`, `361852f`) |
| 3. 참가·승인·입금·확정·자동취소 | **서버 완료.** 화면 미착수 |
| 4. 코트 매칭 탭 화면 재작성 | 미착수 ← 다음 작업 |

## 3. 3번 서버 로직 — 구현 완료

`src/server/domain/court-match{,-service}.ts`에 전용 도메인으로 넣었다. 일반 매칭과
주최자·확정 조건이 달라 `match-service.ts`를 키우지 않고 분리했다. 기존
`createApplication`은 `PARTNER_COURT` Match를 `COURT_MATCH_APPLICATION_PATH`로 막는다.

API:

| 경로 | 하는 일 |
| --- | --- |
| `POST /api/v1/court-matches/{matchId}/applications` | 참가 신청 |
| `POST /api/v1/court-match-applications/{id}/decision` | 운영자 승인·거절 |
| `POST /api/v1/court-match-applications/{id}/deposit` | 참가자 입금 알림 |
| `POST /api/v1/court-match-applications/{id}/confirm` | 운영자 입금 확인·확정 |
| `PUT /api/v1/court-match-applications/{id}/refund-account` | 참가자 환불 계좌 |
| `POST /api/v1/court-match-applications/{id}/refund` | 운영자 환불 완료 표시 |

자동 정리는 `reconcileCourtMatches`가 하고 기존 `/api/cron/reconcile-matches`에 붙였다.
코트 매칭 정리를 먼저 돌린다 — 기한 만료로 자리가 풀린 결과가 뒤의 보정에 반영돼야 한다.

**남은 것: 화면.** 참가자 쪽(신청·입금자명 입력·환불 계좌)과 운영자 쪽(신청 목록·
승인·입금 확인·환불 표시)이 모두 없다. 운영자 화면 경로는 서버가 알림 링크에
`/partner/court-matches/{matchId}`를 쓰고 있으니 그 경로로 만들면 된다.

구현에 반영된 규칙:

- **공개 시 Match 생성.** 운영자가 Slot을 공개하면 `hostUserId = 운영자`인
  `PARTNER_COURT` Match를 같은 트랜잭션에서 만든다. Court의 계좌 3필드를 Match의
  `settlementBank`/`settlementAccountNumber`/`settlementAccountHolder`로 복사해
  스냅샷을 남긴다
- **승인:** Slot의 `approvalMode`가 `AUTO`면 신청 즉시 `ACCEPTED`, `OPERATOR`면
  `PENDING` → 운영자 검토. 어느 쪽이든 성별·경기 유형 조건은 서버가 프로필로
  자동 검증한다(`genderApplicationBlock` 재사용)
- **입금 기한 = `min(승인 + 6시간, 시작 3시간 전)`.** 판정 시점이 지난 뒤의 추가
  신청은 `시작 30분 전`. 초과 시 `EXPIRED_UNPAID`
- **자동 취소:** 시작 3시간 전, `CONFIRMED` 인원 < `minParticipantCount`면 Match와
  신청을 취소. `reconcile-matches` 크론에 붙인다
- **정원과 최소 인원의 기준이 다르다.** 자리는 `ACCEPTED + CONFIRMED`가 차지하고,
  진행 여부는 `CONFIRMED`만으로 판정한다. **`getAcceptedCount`가 `ACCEPTED`만 세므로
  코트 매칭에 그대로 쓰면 초과 승인이 난다 — 반드시 손볼 것**
- **환불:** `CANCELLED` + `confirmedAt` 있음 + `refundCompletedAt` 없음 = 환불 대기.
  환불 계좌는 취소가 난 뒤에만 참가자에게 받는다. `환불 완료`는 운영자가 눌렀다는
  기록일 뿐 송금 증명이 아니라는 문구를 화면에 반드시 둘 것
- **입금 식별코드:** 승인 시 서버가 3자리 코드를 발급하고 `홍길동742`로 입금하도록
  안내한다. `@@unique([matchId, depositCode])`가 이미 걸려 있다

4번에서는 `PartnerSessionCreate`(`/partner-sessions/open`)를 폐기하고, `getMatches`·
`getRecommendedMatches`에서 `PARTNER_COURT`를 제외해 매칭 탭과 분리한다.

## 4. 작업 환경 주의사항

- **GPT가 동시에 작업 중이다.** 미커밋 파일: `docs/03-screen-spec.md`,
  `docs/05-api-spec.md`, `src/features/matches/m3-match-card.tsx`,
  `src/server/domain/match-service.ts`, `match-service.test.ts`, `match.ts`,
  `match.test.ts`, `prisma/seed-ui-matches.ts`. **건드리지 말 것**
- 그 파일들을 꼭 고쳐야 할 때는 워킹트리를 그대로 두고 **인덱스에만 내 변경분을
  올려 커밋**했다: `git show HEAD:<file>`로 원본을 받아 내 수정만 적용한 뒤
  `git hash-object -w` → `git update-index --cacheinfo`. 이번 세션에서 네 번 썼고
  GPT 변경분은 한 번도 안 잃었다
- **Prisma CLI가 이 환경에서 안 돈다**(엔진 다운로드 차단). `prisma validate`,
  `migrate deploy`, `generate` 모두 사용자 맥에서 실행해야 한다
- **vitest·next dev/build도 안 돈다**(네이티브 바이너리 없음, npm 레지스트리 403).
  검증은 `npx tsc --noEmit`과 `npx eslint`까지만 가능하다
- `.git` 안에 락 파일을 지울 수 없어 git 명령마다 `index.lock`/`HEAD.lock`이 남는다.
  다음 명령 전에 `mv`로 치워야 한다(`.git/*.cleared-*`가 그 흔적)

## 5. 남은 결정

1. **코트 매칭 상세 경로** — `/matches/[id]` 유지 vs `/partner-sessions/[id]`로 이동.
   매칭 탭과 완전히 분리하려면 후자지만 채팅·활동 화면 링크가 함께 움직인다
2. **기존 `PARTNER_COURT` 데이터** — 옛 모델로 만들어진 것들. 파일럿이면 정리 가능
3. **운영자에게 보여 줄 참가자 정보 범위** — 자동 승인이 기본이면 입금 확인에 필요한
   최소치(닉네임·성별·입금 상태·신청 시각)로 충분할 것

## 6. 알려진 미해결

- `m3-match-card.tsx`의 비용 라벨이 `EXTERNAL_RESERVED ? "참가비" : "1인 약"`이라
  코트 매칭만 "1인 약"으로 나온다. 금액은 맞고 라벨만 틀리다. GPT 작업 구역이라 뒀다
- `match-service.test.ts`에 `usageNote` 통과를 고정하는 어서션을 못 넣었다(같은 이유)
- e2e에 기존 실패가 둘 있다. 일반 매칭 개설 테스트가 게임 유형을 안 고르고(필수가 된
  뒤 갱신 안 됨), 74번 줄이 `getByLabel("전체 코트 비용")`으로 찾는데 실제 라벨은
  `게스트 참가비용`이다. 둘 다 이번 작업과 무관한 기존 문제

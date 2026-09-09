# 코트 매칭 인수인계 — Claude → GPT

작성일: 2026-09-09 · 이전 노트: `Claude outputs/handoff.md`(2026-09-07, 일반 매칭 쪽)

**다음 작업 인계:** 실제 브라우저·DB 검증의 실행 순서와 완료 기준은
[`03-5-claude-to-codex-handoff.md`](03-5-claude-to-codex-handoff.md)를 따른다.
검증 결과는 [`03-4`](03-4-codex-to-claude-verification-handoff.md) §12·§13에 있다.
이 문서의 과거 미완료 메모와 최신 검증 상태를 구분할 것.

---

## 0. 먼저 읽을 것

**`docs/03-2-court-match-operator-hosted-redesign.md`가 코트 매칭의 정본이다.**

**최신 사용자 결정(2026-09-09): 크론 작업은 보류. 사용자가 명시적으로 재개하기
전까지 다시 진행하지 않는다.** Vercel Pro 전환, 매분 실행 설정, Cloudflare 등 외부
스케줄러 연동은 모두 보류 대상이다. 이번 커밋에는 매분 실행 설정을 포함하지 않고
기존 일일 설정을 유지한다. 상세 조회·신청·승인·입금 요청 시 서버 상태 보정과
환불 동시 처리 수정은 유지한다. 무접속 상태에서 제시간에 취소 알림을 보내는 일은
아직 해결되지 않았으므로, 크론 재개 시 별도로 검증해야 한다.

이 세션에서 코트 매칭의 업무 자체가 바뀌었다. 기존 `docs/03-1-court-partner-screen-spec.md`는
운영자 등록·심사(OP01·OP02·IR01), 대표 코트 사진(OP07), 공급 철회(§9.4)만 유효하고
**§3 역할표, §4.2, §4.4, §6.2, §7, §10~§12는 폐기됐다.** 03-1을 근거로 작업하면 안 된다.

---

## 1. 무엇이 바뀌었나

작업 중에 코트 매칭의 주최자가 구현과 다르다는 것이 드러났다. 사용자 확인 결과:

> "코트매칭은 운영자가 자기 코트장을 미리 예약해서 올려놓으면 일반사용자들이 보고
> 참여를 신청하는 메뉴야. 당연히 코트매칭은 운영자가 만들어야 해."

| | 기존 구현 | 새 모델 |
| --- | --- | --- |
| 만드는 사람 | 일반 회원(세션 모집자) | **운영자** |
| 참가 신청 받는 사람 | 세션 모집자 | **운영자** |
| 참가 확정 | 수락하면 끝 | 승인 → **계좌이체 입금** → 운영자 확정 |
| 비용 | 코트 총액 ÷ 인원 | **게스트 1인 고정 참가비** |
| 비용 수령 | 참가자끼리 앱 밖 정산 | **운영자가 계좌이체로 수령** |
| '매칭' 탭 노출 | 노출됨 | **노출 안 함. 코트매칭 탭 전용** |

**`매칭`과 `코트매칭`은 전혀 다른 메뉴다.** 이 전제를 놓치면 방향이 통째로 어긋난다.
(내가 그렇게 어긋났다가 사용자 지적으로 되돌렸다.)

---

## 2. 지금 상태

| 단계 | 상태 |
| --- | --- |
| 1. 데이터 모델 | 완료 · 마이그레이션 적용 확인됨 |
| 2. 운영자 입력(모집 조건·입금 계좌) | 완료 |
| 3. 참가·승인·입금·확정·자동취소 **서버** | 완료 |
| 4. 화면 전체 | 완료 |

`dac9d4d`(마이 페이지 개편) 이후 커밋 33개. 마이그레이션 적용과 push 모두 끝났고 `origin/main`과 동기화돼 있다. 받는 쪽은 `git pull`만 하면 된다.

### 확정된 규칙

| 항목 | 값 |
| --- | --- |
| 참가비 | 운영자가 정하는 게스트 1인 고정액. 나누지 않음 |
| 승인 방식 | 코트 매칭마다 `AUTO`(선착순) / `OPERATOR` 선택. 기본 `AUTO` |
| 입금 기한 | `min(승인 + 6시간, 시작 3시간 전)` |
| 신청 마감 | 시작 30분 전. 판정 후 신청의 입금 기한도 이 시각 |
| 자동 취소 | 시작 3시간 전, **입금 완료 인원** < 최소 인원이면 취소 |
| 환불 | 앱이 `환불 대기 → 환불 완료` 기록. 계좌는 취소 후에만 받음 |
| 계좌 저장 | `Court`에 한 벌, 공개 시 `Match`로 스냅샷 |

---

## 3. 4번 화면 — 구현 완료

> 아래는 모두 구현됐다. **무엇을 왜 그렇게 만들었는지의 근거로 남긴다.**
>
> 참가자는 `/partner-sessions/{slotId}` 한 화면에서 신청·입금자명 입력·환불 계좌
> 입력까지 하고, 운영자는 `/partner/court-matches/{matchId}`에서 승인 대기 · 입금
> 대기 · 참가 확정 · 환불 대기를 나눠 보며 처리한다.

### 3.1 매칭 탭에서 코트 매칭 떼어내기 — 먼저 할 것

`src/server/domain/match-service.ts:353`이 아직 `courtSource: { not: "COURT_TBD" }`라
**코트 매칭이 '매칭' 목록과 추천에 그대로 섞여 나온다.** `getMatches`와
`getRecommendedMatches`(`filterDiscoverable`)를 `EXTERNAL_RESERVED`만 보도록 좁혀야 한다.

이걸 먼저 하면 아래 항목도 자동으로 해결된다:
- `m3-match-card.tsx`의 비용 라벨이 `EXTERNAL_RESERVED ? "참가비" : "1인 약"`이라
  코트 매칭만 "1인 약"으로 잘못 나오는 문제 (금액은 맞고 라벨만 틀림)

### 3.2 옛 모델 잔재 삭제

`availableAction: "OPEN_SESSION"`(일반 회원이 슬롯을 골라 세션을 여는 흐름)이
남아 있는 곳:

- `src/features/partner/partner-session-create.tsx` + `/partner-sessions/open` — **통째로 삭제**
- `partner-session-list.tsx`, `partner-session-detail.tsx`, `partner-session.ts` — CTA·타입 정리
- `court-slot-service.ts`의 `toCourtSlotView`에서 `availableAction` 자체를 재정의

`CourtSlot.status`의 새 의미: `DRAFT`=초안, `AVAILABLE`=**공개·모집 중**,
`ALLOCATED`=**쓰지 않음(옛 기록 호환용)**, 나머지는 그대로. enum 값은 안 바꿨다
(Postgres enum 이름 변경은 얻는 게 이름뿐이라 위험 대비 이득이 없다).

### 3.3 참가자 화면

| 화면 | 필요한 것 |
| --- | --- |
| 코트 매칭 목록·상세 | 지금 화면을 새 모델로 재작성. 참가 CTA가 `이 시간으로 열기`가 아니라 `참가 신청하기` |
| 신청 후 | 입금 안내 — 계좌, 금액, **입금 식별코드**, 기한. `홍길동742`로 보내라고 안내 |
| 입금 알림 | 입금자명 입력 → `POST .../deposit` |
| 취소됐을 때 | 환불받을 계좌 입력 → `PUT .../refund-account` |

### 3.4 운영자 화면 — `/partner/court-matches/{matchId}`

**서버가 알림 링크에 이미 이 경로를 쓰고 있다.** 이 경로로 만들면 된다.

| 필요한 것 | API |
| --- | --- |
| 신청 목록(닉네임·성별·입금 상태·신청 시각) | (조회 API 없음 — 만들어야 함) |
| 승인·거절 (`OPERATOR` 모드일 때만) | `POST /api/v1/court-match-applications/{id}/decision` |
| 입금 확인·확정 — 금액·입금자명·**식별코드**를 통장과 대조 | `POST .../{id}/confirm` |
| 환불할 참가자 목록·환불 완료 표시 | `POST .../{id}/refund` |

조회는 `GET /api/v1/operator/court-matches/{matchId}`가 한다. 노출 범위는 기본이
닉네임·성별·신청 시각·입금/환불 정보이고, `OPERATOR` 승인 방식일 때만 테니스 프로필과
신청 메시지를 더 준다. 이 경계는 `court-match-view.test.ts`가 고정하고 있다.

### 3.5 API 목록 (구현됨)

```
POST /api/v1/court-matches/{matchId}/applications        참가 신청
POST /api/v1/court-match-applications/{id}/decision      운영자 승인·거절  { accept: boolean }
POST /api/v1/court-match-applications/{id}/deposit       참가자 입금 알림  { depositorName }
POST /api/v1/court-match-applications/{id}/confirm       운영자 입금 확인·확정
PUT  /api/v1/court-match-applications/{id}/refund-account 참가자 환불 계좌  { bank, accountNumber, accountHolder }
POST /api/v1/court-match-applications/{id}/refund        운영자 환불 완료 표시
```

자동 정리는 `reconcileCourtMatches`가 `/api/cron/reconcile-matches`에서 돈다.

**2026-09-09 후속 수정:** 매분 크론 도입은 사용자 요청으로 보류했다(§0).
상세 조회와 신청·승인·입금 알림·입금 확인도 같은 시간 보정 함수를 사용한다.
판정 기준은 시작 3시간 전까지 확정된 인원이며, 요청을 거절할 때에도 취소·만료
상태는 커밋한다. 환불 계좌 수정과 환불 완료는 같은 Match 행 잠금으로 직렬화한다.
기존 일일 크론 설정은 유지한다. 무접속 상태에서 기한에 맞춰 알림을 보내는 보장은
아직 없다. 상세 정책은 03-2 §3.2·§3.9,
배포 조건은 README의 ‘코트 매칭 자동 처리’를 따른다.

---

## 4. 함정 — 꼭 읽을 것

### 4.1 정원과 최소 인원의 기준이 다르다

- **정원**(초과 승인 방지)은 `ACCEPTED + CONFIRMED`로 센다. 승인만 받고 입금 전인
  사람도 자리는 잡고 있다.
- **진행 여부**(자동 취소 판정)는 `CONFIRMED`만 센다. 돈 안 낸 사람 수로 진행을
  결정하면 운영자가 코트를 열었는데 실제로 오는 사람이 적어진다.

`match.ts`의 `getAcceptedCount`는 `ACCEPTED`만 센다. **코트 매칭에 그대로 쓰면 안 된다.**
`court-match-service.ts`의 `countSeats` / `countConfirmed`를 쓸 것.

### 4.2 환불 완료는 송금 증명이 아니다

앱은 돈을 만지지 않는다. `refundCompletedAt`은 운영자가 버튼을 눌렀다는 기록일 뿐이다.
**화면에 "실제 입금 여부는 통장에서 확인해 주세요"와 문의 경로를 반드시 둘 것.**
이 문구가 없으면 앱이 환불을 보증하는 것처럼 읽힌다. 입금 계좌 화면에도 같은 취지의
문구를 이미 넣어뒀으니 톤을 맞추면 된다.

### 4.3 계좌 스냅샷을 다시 읽지 말 것

`Court`의 계좌는 원본이고, 공개 시점에 `Match.settlementBank/AccountNumber/AccountHolder`로
복사된다. 화면에서 참가자에게 보여줄 때는 **반드시 Match 쪽 값**을 쓴다. Court를 다시
읽으면 운영자가 계좌를 바꿨을 때 이미 입금한 사람의 기록과 어긋난다.

### 4.4 환불 대기는 별도 상태가 아니다

`CANCELLED` + `confirmedAt` 있음 + `refundCompletedAt` 없음 = 환불 대기.
`court-match.ts`의 `isAwaitingRefund()`를 쓸 것.

### 4.5 배지를 다시 만들지 말 것

`Rally On에서 준비한 코트` 배지는 **의도적으로 뺐다.** 코트 매칭 탭은 화면 자체가
운영자 공개 목록이라 배지가 새 정보를 주지 않고, 매칭 상세에서도 참가 흐름과 비용
모델이 일반 매칭과 같아져서 구분할 이유가 없어졌다. 03-1 §10.2·§15에 근거를 남겨뒀다.

---

## 5. 결정 현황

확정됨:

- **코트 매칭 상세 경로** — `/partner-sessions/{slotId}`로 통일. 옛 `/matches/{id}`는
  그쪽으로 리다이렉트한다
- **운영자에게 보여 줄 참가자 정보** — 기본은 닉네임·성별·신청 시각·입금/환불 정보.
  `OPERATOR` 승인 방식일 때만 테니스 프로필과 신청 메시지를 추가로 준다

아직 안 정해진 것:

1. **기존 `PARTNER_COURT` 데이터** — 옛 모델(모집자가 호스트)로 만들어진 것들.
   파일럿이라 정리해도 무방하다는 게 사용자 의견. `court-match-view.ts`가 이런 기록을
   `legacy`로 표시해 새 신청을 막아 두고 있다
2. **노쇼·현장 책임·문의 창구** — 돈이 오가기 시작하면 바로 필요해진다. 03-1 §16에도
   필수 확정 항목으로 올라와 있다

---

## 5.5 모델 전환이 남긴 조용한 오동작 — 계속 볼 것

`ALLOCATED`와 `ACCEPTED`의 의미가 새 모델에서 이동했는데, 그 값을 조건으로 쓰던
코드가 **타입 오류 없이 잘못 동작**하고 있었다. 한 번 훑어 세 건을 고쳤다.

| 찾은 것 | 증상 |
| --- | --- |
| `reportCourtSupplyIncident`가 `ALLOCATED`만 받음 | 공개된 코트 매칭을 **긴급 취소할 방법이 아예 없었다** |
| 철회·취소가 `CONFIRMED`를 취소 대상에서 뺌 | **입금한 사람만 환불 흐름에서 사라졌다** |
| `acceptApplication`·`cancelMatch`가 코트 매칭에 열려 있음 | 운영자가 호스트라 통과. 입금 코드·기한 없이 `ACCEPTED`가 됐고, `/activity/received/{id}`로 실제 도달 가능했다 |
| `closeMatch`가 `ACCEPTED`만 셈 | 확정 인원이 있어도 모집 마감이 거부됐다 |

**같은 패턴이 더 있을 수 있다.** 새 코드를 쓸 때 `status === "ALLOCATED"`나
`status: "ACCEPTED"` 단독 조건을 보면 새 모델에서 무엇을 뜻하는지 먼저 확인할 것.
자리는 `ACCEPTED + CONFIRMED`, 진행 판정은 `CONFIRMED`, 공개된 코트 매칭은 `AVAILABLE`이다.

## 6. 알려진 미해결 이슈

> **2026-09-09 갱신:** 아래 목록은 이 문서를 쓸 당시의 기록이다. 이후 대부분이
> 해소됐다. 브라우저 E2E와 실제 DB 검증 결과는
> [`03-4 §12`](03-4-codex-to-claude-verification-handoff.md)를 보라. 지금 기준으로
> 남은 것은 **크론 보류(무접속 정시 알림)**, **미확정 운영 정책**, 그리고 아직
> 폐기된 모델을 기준으로 서술하는 **다른 문서들의 정합성**뿐이다.

- **이 기능은 아직 브라우저에서 한 번도 돌아가지 않았다.** 이번에 고친 것들은 전부
  "코드는 멀쩡해 보이는데 실제로는 잘못 동작"하는 종류였고, 화면에서 한 번 지나가
  봤으면 곧바로 드러났을 것들이다. `npm run db:seed:court-match`로 승인된 운영자·
  공개된 코트 매칭·세 상태의 신청이 한 번에 만들어진다(README 참고). 개발 DB에
  upsert로만 쓴다
- **e2e는 전용 DB가 없어 실행하지 못했다.** `E2E_DATABASE_URL`(이름에 `e2e` 필수)과
  마이그레이션이 필요하다. 설정 절차는 README에 있다. 픽스처가 `users`·`regions`를
  TRUNCATE하므로 개발·운영 DB를 넣으면 안 된다
- **e2e를 한 번도 실행하지 못했다.** 코트 매칭 시나리오를 새 흐름으로 다시 썼고
  일반 매칭 개설의 기존 실패 2건도 고쳤지만, 전부 정적 검사까지만 확인했다.
  셀렉터가 실제 DOM과 어긋날 수 있다 — 특히 WDS `Modal`의 접근성 이름
  (`getByRole("dialog", { name: "참가 신청" })`)
- `docs/05-api-spec.md`에 코트 매칭 API 8개(참가·승인·입금·확정·환불 6개 + 조회 2개)가
  하나도 기재돼 있지 않다
- `docs/03-1-court-partner-screen-spec.md`의 폐기된 절에 표시가 없다. 이 노트 §0을 못
  보고 그 문서를 근거로 작업하면 방향이 어긋난다
- `docs/01-product-overview.md:184`가 아직 "전체 비용 ÷ 인원" 시절 문서다. 일반 매칭은
  이미 `b826db2`에서, 코트 매칭은 이번에 고정 참가비로 넘어갔다

---

## 7. 시작하기

```
git pull
npm run check     # lint + typecheck + test + build
```

`lint`와 `typecheck`는 통과가 확인됐다. `test`와 `build`는 아래 사유로 확인되지 않았다.

마이그레이션 2개(`20260908140000_court_match_operator_hosted`,
`20260909100000_court_match_notifications`)는 적용 완료됐고 Prisma Client도
재생성돼 있다. 스키마를 더 건드리면 `db:migrate:deploy` 다음 `db:generate`를
잊지 말 것(둘은 별개 작업이라 마이그레이션만 돌리면 Client가 옛 컬럼을 참조한다).

### 검증 공백 — 중요

내 작업 환경은 사용자 맥 안의 격리된 리눅스 VM이라 **vitest와 next build/dev를
실행할 수 없었다.** 검증은 `npx tsc --noEmit`과 `npx eslint`까지만 했다.

**그래서 이번 코트 매칭 작업분은 `npm run test`도 `npm run e2e`도, 브라우저 확인도
한 번도 거치지 않았다.** 특히 아래 셋을 먼저 돌려 보길 권한다.

1. `src/server/domain/court-match.test.ts` — 이번에 새로 넣은 것. 기한 계산, 정원
   기준, 승인 방식 분기, 신청 마감을 덮는다
2. `src/server/domain/court-slot-service.test.ts` — 스키마 필드가 늘면서 픽스처를
   손봤다
3. `/partner`, `/partner/slots/new`, `/partner/settlement-account` — 운영자 화면은
   브라우저로 한 번도 못 봤다

GPT가 정상 macOS 터미널이면 이 제약은 없을 것이다.

### 2026-09-09 Codex 재검증

위 검증 공백은 Claude 작업 당시 기록이다. 후속 시간 판정·환불 동시 처리 수정 후
`npm run check`의 린트·타입 검사·단위/API 테스트 269개·프로덕션 빌드가 통과했다.
새 회귀 테스트는 기한 경계, 취소·만료 커밋 유지, 판정 후 승인·확정 차단,
최소 인원 충족 후 추가 참가, 잠금 대기, 환불 계좌 수정과 완료의 순서를 검증한다.
DB 동시성은 단위 테스트에서 실행 순서를 모사했으며 실제 PostgreSQL 동시 실행과
브라우저 E2E는 아직 미검증이다(`E2E_DATABASE_URL` 미설정).
운영 DB 데이터 변경·배포·요금제 변경은 수행하지 않았다.

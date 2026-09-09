# 코트 매칭 인수인계 — Claude → GPT

작성일: 2026-09-09 · 이전 노트: `Claude outputs/handoff.md`(2026-09-07, 일반 매칭 쪽)

---

## 0. 먼저 읽을 것

**`docs/03-2-court-match-operator-hosted-redesign.md`가 코트 매칭의 정본이다.**

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
| 4. **화면 전체** | **미착수 ← 여기부터** |

`dac9d4d`(마이 페이지 개편) 이후 커밋 18개. 마이그레이션 적용과 push 모두 끝났고 `origin/main`과 동기화돼 있다. 받는 쪽은 `git pull`만 하면 된다.

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

## 3. 다음 작업 (4번) — 화면

서버는 다 있고 화면이 하나도 없다. 아래 순서를 권한다.

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

**조회 API가 없다.** 운영자가 신청 목록을 볼 엔드포인트를 만들어야 한다. 노출 범위는
아직 미확정이지만(§5), 자동 승인이 기본이면 닉네임·성별·입금 상태·신청 시각이면 충분하다.

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

## 5. 아직 안 정해진 것

1. **코트 매칭 상세 경로** — `/matches/{id}` 유지 vs `/partner-sessions/{id}`로 이동.
   매칭 탭과 완전히 분리하려면 후자지만 채팅·활동 화면 링크가 함께 움직인다.
   지금 서버는 알림 링크에 `/matches/{id}`를 쓰고 있다
2. **기존 `PARTNER_COURT` 데이터** — 옛 모델(모집자가 호스트)로 만들어진 것들.
   파일럿이라 정리해도 무방하다는 게 사용자 의견
3. **운영자에게 보여 줄 참가자 정보 범위**
4. **노쇼·현장 책임·문의 창구** — 돈이 오가기 시작하면 바로 필요해진다. 03-1 §16에도
   필수 확정 항목으로 올라와 있다

---

## 6. 알려진 미해결 이슈

- **e2e 기존 실패 2건** (내 작업과 무관, 원래 있던 것):
  - `match-flow.spec.ts:68` — 일반 매칭 개설 테스트가 게임 유형을 안 고른다.
    `4557d6d`에서 필수가 된 뒤 갱신이 안 됐다. `getByRole("button", { name: "랠리" })`는
    플레이 목적 카드지 게임 유형이 아니다
  - `match-flow.spec.ts:74` — `getByLabel("전체 코트 비용")`으로 찾는데 실제 라벨은
    `게스트 참가비용`이다
- `docs/01-product-overview.md:184`가 아직 "전체 비용 ÷ 인원" 시절 문서다. 일반 매칭은
  이미 `b826db2`에서, 코트 매칭은 이번에 고정 참가비로 넘어갔다. 문서 정리 필요

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

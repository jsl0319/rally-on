# Claude → Codex: 코트 매칭 인수인계

작성일: 2026-09-09 · 앞 문서: [`03-4-codex-to-claude-verification-handoff.md`](03-4-codex-to-claude-verification-handoff.md)

## 0. 한 줄 요약과 가장 중요한 결정

`03-4`가 맡긴 **실동작 검증을 끝냈다.** 코트 매칭은 이제 실제 브라우저와 실제
PostgreSQL에서 검증된다. 그 위에 사용자 요청으로 **참가자 취소와 단계별 환불**을
새로 만들었고, 미확정이던 운영 정책 네 가지를 확정해 정본에 기록했다.

**크론 작업은 여전히 보류다. 사용자가 명시적으로 재개를 요청하기 전에는 진행하지
않는다.** Vercel 매분 실행 설정, Pro 요금제 전환, Cloudflare 등 외부 스케줄러 연동을
하지 않는다. `vercel.json`의 기존 일일 설정을 유지하며, 이 인수인계는 기존 크론을
끄라는 뜻도 아니다. 요청 시 서버 상태 보정 코드는 유지한다. **접속자가 없을 때
제시간에 취소 알림이 가는지는 미완료·보류다. 이 항목을 완료로 보고하지 않는다.**

## 1. 기준 상태

코드 기준 커밋은 **`b12ef10 docs: 제품 문서의 코트 매칭 서술을 새 모델로 다시 쓴다`**
이며, 작성 시점에 `main`과 `origin/main`이 이 커밋으로 일치하고 작업 폴더는 깨끗했다.
`03-4`의 기준이던 `394e5f1` 이후 커밋 12개다.

```
b12ef10 docs: 제품 문서의 코트 매칭 서술을 새 모델로 다시 쓴다
2b06166 test: 문의의 매칭 참조가 본인 건에만 붙는지 확인한다
bf2b7b0 feat: 문의에 어느 매칭 건인지 함께 남긴다
f611b68 feat: 약관에 코트 매칭의 참가비·환불·현장 책임을 적는다
5971243 docs: 폐기된 코트 매칭 모델 서술에 정본을 가리키는 표시를 남긴다
7c6928a docs: 참가자 취소와 단계별 환불 정책을 정본에 적는다
5d42a8f test: 참가자 취소와 단계별 환불을 실제 DB와 브라우저로 검증한다
0874ccc feat: 참가자가 스스로 취소하고 남은 날짜만큼 환불받는다
eeeb4ce docs: 코트 매칭 검증 결과와 전용 DB 준비 절차를 남긴다
b8186d5 test: 코트 매칭을 실제 DB와 브라우저에서 검증한다
8d36460 fix: 본문을 읽지 못한 요청에 500 대신 400으로 답한다
6e913b5 docs: 코트 매칭 실동작 검증 인수인계를 남긴다
```

읽는 순서:

1. `AGENTS.md` — 공통 규칙, 크론 보류, 기존 작업 보존, 검증 기준
2. `docs/03-2-court-match-operator-hosted-redesign.md` — **코트 매칭 제품 정책 정본**
3. 이 문서 — 현재 상태, 환경, 함정, 남은 일
4. `docs/03-4-...-handoff.md` §12·§13 — 검증 결과와 참가자 취소 구현 기록
5. `docs/03-3-court-match-work-handoff.md` — 모델 전환 배경과 과거 함정

주의: `03-3`과 `03-4`에는 역사 기록이 섞여 있다. `03-3` §6의 미해결 목록, `03-4` §2의
검증 공백 표는 **당시 기록**이며 지금은 대부분 해소됐다. 각 문서에 갱신 표시를 달아
두었으니 그것을 함께 볼 것.

## 2. 이번 세션에서 한 일

### 2.1 실동작 검증 (03-4 §4~§7의 임무)

전용 PostgreSQL을 준비하고 브라우저 E2E와 실제 DB 동시성까지 확인했다. **이 기능이
브라우저에서 돌아간 것은 이번이 처음이다.** 상세는 `03-4` §12.

동시성 4건은 `Promise.all`로 겹쳤다고 가정하지 않는다. 별도 연결이
`SELECT ... FOR UPDATE`로 Match 행을 실제로 쥔 뒤 요청들을 시작시키고, 잠금을 놓은
다음 결과를 받는다(`whileMatchLocked` 헬퍼).

### 2.2 고친 결함

| 결함 | 사용자에게 달라지는 것 | 커밋 |
| --- | --- | --- |
| 본문이 비어 있거나 끊긴 요청에 500을 돌려줬다 | 탭을 닫는 순간의 요청에서 "요청을 처리하지 못했어요"(500) 대신 400이 나가고 서버 오류 로그가 쌓이지 않는다 | `8d36460` |
| 판정 이후의 취소가 매칭 전체를 취소시켰다 | 진행이 확정된 매칭이 한 명의 당일 취소로 사라지지 않는다 | `0874ccc` |
| 정원이 차서 마감된 매칭은 취소로 자리가 비어도 닫힌 채였다 | 빈자리가 다시 열려 대체 참가자를 받을 수 있다 | `0874ccc` |
| 신청 마감(시작 30분 전) 뒤에는 취소도 막혔다 | 못 가게 된 사람이 자리를 붙잡고 있지 않는다 | `0874ccc` |

뒤의 셋은 **참가자 취소 경로가 없던 시절에는 드러날 수 없던 것**이다. 확정 인원이
줄어들 방법 자체가 없었기 때문이다.

**코트 매칭의 기존 구현에서는 제품 결함이 나오지 않았다.** E2E 실패 5건은 전부
테스트가 옛 UI를 보고 있던 것이었다(§7.3).

### 2.3 새로 만든 것 — 참가자 취소와 단계별 환불

앱에는 확정된 참가를 참가자가 스스로 취소하는 경로가 **아예 없었다**. 일반 매칭의
`withdrawApplication`은 `PENDING`만 철회할 수 있는데, 자동 승인 코트 매칭의 신청은
곧바로 `ACCEPTED`가 되어 그 상태를 거치지 않는다. 단계별 환불은 "언제 취소했는지"가
있어야 성립하므로 이 경로부터 만들었다.

- `POST /api/v1/court-match-applications/{id}/cancel` — 본인만, 본문 없음
- `cancelCourtMatchApplication()` — `withCurrentCourtMatch` 안에서 잠금·시간 보정을 거친다
- 마이그레이션 `20260909200000_court_match_participant_cancel`
- 참가자 화면: 취소 전에 환불 예정 금액과 비율을 보여 주는 2단계 확인
- 운영자 화면: 환불할 참가자에 **보낼 금액**과 `참가자 취소` 표시

### 2.4 정책 확정과 문서 정리

미확정이던 네 가지를 사용자가 확정했다(§3). 정본은 `03-2` §3.7과 §5 표다.
약관에 코트 매칭의 참가비·환불·현장 책임 세 절을 넣었고, 제품 문서 곳곳의 폐기된
모델 서술을 새 모델로 다시 썼다.

## 3. 확정된 정책 — 테스트 기대값

`03-2` §5 표가 정본이다. 이번에 더해진 것만 옮긴다.

| 항목 | 규칙 |
| --- | --- |
| 참가자 취소 환불 | 매칭 **시작일** 기준 이틀 전까지 전액, 하루 전 절반, 당일 없음 |
| 환불 계산 기준 | 시각이 아니라 **한국 시간 날짜**. 원 단위 내림 |
| 환불 금액 스냅샷 | 취소 시점에 계산해 `refundAmountKrw`에 남긴다. `null`은 앱 사유 취소로 **전액** |
| 취소 허용 구간 | 시작 전까지 언제든. 환불 0원 구간에도 허용하고 신청 마감 뒤에도 받는다 |
| 취소 시 자리 | 항상 반환. 마감됐던 매칭은 신청 마감 전에 한해 다시 모집 중으로 |
| 입금 확인 전 취소 | `WITHDRAWN`. 돌려줄 것이 없다. 이미 이체했다면 화면이 문의로 안내 |
| 판정 후 취소 | 판정 시점에 확정돼 있던 인원은 이후 취소해도 판정 인원으로 센다. 매칭은 유지 |
| 노쇼 | 취소 없이 나타나지 않으면 환불하지 않는다. 예외는 1:1 문의로 운영자 판단 |
| 현장 책임 | 시설·안전은 운영자, 개인 부상·소지품은 각자, Rally On은 정보 제공자 |
| 문의 | 기존 1:1 문의로 단일화. `SupportInquiry.matchId`로 어느 건인지 남긴다 |
| 옛 `PARTNER_COURT` 데이터 | 지우지 않는다. 보존하고 새 신청만 막는 현 동작 유지 |

`환불 완료`는 운영자가 눌렀다는 기록이지 송금 증명이 아니다. 앱은 돈을 만지지 않는다.

## 4. 실행 환경 — 이 순서를 지킬 것

### 4.1 전용 E2E DB (이미 준비돼 있음)

사용자 맥에는 Docker가 없어 **Homebrew PostgreSQL 17로 전용 포트에 전용 클러스터**를
따로 띄웠다. 기본 포트 5432, `brew services` 자동 시작, 기존 `DATABASE_URL`(공유 Neon)은
건드리지 않았다.

```bash
# 클러스터가 꺼져 있으면 (재부팅하면 꺼진다)
PGBIN="$(brew --prefix postgresql@17)/bin"
"$PGBIN/pg_ctl" -D ~/.rally-on-e2e-pg \
  -o "-p 55432 -k /tmp -c listen_addresses=127.0.0.1" \
  -l ~/.rally-on-e2e-pg/server.log start
```

`.env.local`에는 아래 한 줄만 추가돼 있다. 다른 값은 손대지 않았다.

```dotenv
E2E_DATABASE_URL=postgresql://tennis_mate:tennis_mate@127.0.0.1:55432/tennis_mate_e2e?schema=public
```

설치부터 다시 해야 하면 README `브라우저 E2E`에 전체 절차가 있다.

### 4.2 검증 명령

```bash
export E2E_DATABASE_URL='postgresql://tennis_mate:tennis_mate@127.0.0.1:55432/tennis_mate_e2e?schema=public'
npm run lint && npm run typecheck && npx vitest run && npm run build
npm run e2e
```

`E2E_DATABASE_URL`이 없으면 `tests/db/*`는 통째로 건너뛴다. 코트 매칭을 고칠 때는
반드시 이 변수를 넣고 돌릴 것. 스키마를 바꿨다면 마이그레이션은 **전용 DB에만** 적용한다.

```bash
DATABASE_URL="$E2E_DATABASE_URL" DATABASE_URL_UNPOOLED="$E2E_DATABASE_URL" npm run db:migrate:deploy
npm run db:generate
```

### 4.3 환경의 함정

- **포트 3000 개발 서버를 끄고 E2E를 돌린다.** 같은 저장소의 `.next` 산출물을 공유해
  테스트가 불안정해진다. E2E는 3100에 서버를 따로 띄운다.
- `prisma.config.ts`는 `DATABASE_URL_UNPOOLED`를 `DATABASE_URL`보다 먼저 쓴다.
  마이그레이션 때 하나만 덮어쓰면 `.env.local`의 공유 DB로 향한다. **둘 다 덮어쓸 것.**
- 앱 런타임은 `DATABASE_URL`만 본다. `playwright.config.ts`가 dev 서버에 그 값을 넘긴다.
- `tests/e2e/fixtures.ts`는 매 테스트 전에 `users`·`regions`를 `TRUNCATE`한다. DB 이름에
  `e2e`가 있는지만 검사하므로, 값을 넣기 전에 **호스트·포트·용도**를 눈으로 확인할 것.
- `.claude-transfer/`는 내 작업용 스크립트·로그·전송 tarball이다. `.git/info/exclude`로
  제외돼 있어 커밋되지 않는다. **지워도 된다.**

## 5. 검증 범위 — 무엇이 확인됐고 무엇이 안 됐나

| 항목 | 결과 |
| --- | --- |
| 린트·타입 검사 | 통과 |
| Vitest 단위/API/DB | **48개 파일, 297개 통과** (`E2E_DATABASE_URL` 설정 시) |
| `tests/db/court-match-flow.test.ts` | 28개 — 권한·상태 경계, 시간 경계, 취소·환불, 실제 동시성 |
| 프로덕션 빌드 | 통과 |
| Playwright E2E | **7개 통과** |
| 실제 PostgreSQL 동시성 | 4건 통과 (별도 연결이 행 잠금을 쥔 상태에서) |
| **무접속 상태의 정시 취소 알림** | **미해결·보류.** 요청 시 상태 보정만 검증됨 |
| **공유 DB 마이그레이션** | **미적용.** §8 참조 |
| 약관 문구의 법무 검토 | **미검토.** §8 참조 |

## 6. 코드 지도 — 이번에 바뀐 곳 중심

| 파일 | 역할·이번 변경 |
| --- | --- |
| `src/server/domain/court-match.ts` | 기한 계산, `getRefundPercent`/`getRefundAmountKrw`(KST 날짜 기준), `isAwaitingRefund`(환불 0원 제외) |
| `src/server/domain/court-match-service.ts` | `cancelCourtMatchApplication`, `countConfirmedAtJudgement`, `reopenIfSeatFreed`, `withCurrentCourtMatch`의 `allowAfterApplicationDeadline` |
| `src/server/domain/court-match-view.ts` | 응답의 `refundAmountKrw`·`participantCancelledAt`·`cancellation`(취소 전 미리보기), 상태 라벨 `취소됨 · 환불 없음` |
| `src/server/domain/match-chat-service.ts` | `removeParticipantFromConversation` |
| `src/server/domain/support-service.ts` | 문의의 `matchId` 검증(본인 건만)과 응답의 매칭 정보 |
| `src/server/http/api-response.ts` | 본문 파싱 `SyntaxError` → 400 |
| `src/features/partner/court-match-payment.tsx` | 참가자 취소 2단계 확인, 환불 예정 금액 |
| `src/features/partner/operator-court-match.tsx` | 환불할 참가자의 보낼 금액·참가자 취소 표시 |
| `src/app/terms/page.tsx` | 참가비·환불·현장 책임 절 |
| `tests/db/court-match-flow.test.ts` | 실제 DB 통합 테스트 28개 |
| `tests/e2e/match-flow.spec.ts` | 브라우저 테스트 7개 |

## 7. 함정 — 꼭 읽을 것

### 7.1 이번에 실제로 밟은 것들

- **`src/server/domain/notification.ts`는 알림 종류를 손으로 관리하는 유니온 타입을
  따로 들고 있다.** Prisma 스키마에만 enum 값을 추가하면 타입 검사가 깨진다. 둘 다 고칠 것.
- **`tsconfig.tsbuildinfo` 증분 캐시가 옛 Prisma 타입을 물고 있는 경우가 있다.**
  `db:generate` 뒤에도 없는 enum 값이라고 하면 이 파일을 지우고 다시 돌려 볼 것.
- **`court_slots.max_participant_count >= 2`가 DB 제약이다.** "마지막 한 자리" 상황을
  만들려면 정원 2에 자리 하나를 미리 채운다.
- **입금 식별코드는 `(matchId, depositCode)` 유니크다.** 픽스처에서 고정값을 쓰면 같은
  매칭에 두 명을 넣을 때 깨진다.
- **`ALTER TYPE ... ADD VALUE`는 같은 트랜잭션에서 그 값을 쓸 수 없다.** 마이그레이션을
  나누거나 사용을 다음 마이그레이션으로 미룰 것.

### 7.2 도메인 규칙에서 헷갈리는 것

- **판정은 1회성 관문이다.** `cancelForShortfall`은 `countConfirmedAtJudgement`로
  "판정 시점에 확정돼 있던 인원"을 센다. `status === "CONFIRMED"`만 세면 판정 이후의
  취소가 매칭 전체를 취소시키는 결함이 재발한다.
- **`refundAmountKrw`의 `null`과 `0`은 다르다.** `null`은 앱 사유 취소로 **전액**,
  `0`은 당일 취소로 **환불 없음**이다. `isAwaitingRefund`가 `0`을 제외한다.
- **자리는 `ACCEPTED + CONFIRMED`, 진행 판정은 `CONFIRMED`, 공개 상태는 `AVAILABLE`.**
  `ALLOCATED`는 옛 모델 잔재라 새로 쓰지 않는다.
- **계좌는 `Match` 쪽 스냅샷을 쓴다.** `Court`를 다시 읽으면 운영자가 계좌를 바꿨을 때
  이미 입금한 사람의 안내와 어긋난다.
- `withCurrentCourtMatch`의 취소·만료 거절은 트랜잭션에서 `{ error }`로 돌려주고
  **커밋 이후** 예외를 던진다. 콜백 안에서 바로 `throw`하면 취소·만료까지 rollback된다.

### 7.3 E2E를 고칠 때

이번 실패 5건은 전부 테스트가 옛 UI를 보고 있던 것이었다. **UI를 테스트에 맞춰
되돌리지 말고 테스트를 현재 조작에 맞출 것.**

- **날짜·시간은 바텀시트 휠 피커다.** 스크롤이 멈춘 뒤에야 선택이 확정되므로 옵션을
  직접 클릭하거나 여러 칸을 한 번에 누르면 값이 어긋난다. `pickSchedule` 헬퍼가 한
  칸씩 누르고 확정을 기다리며 좁힌다.
- **필수 항목의 접근성 이름에는 `*`가 붙는다**(`"매칭 소개글 *"`). `exact: true`로는 안 잡힌다.
- **채팅은 서버 응답 전에 임시 말풍선을 먼저 그린다.** 화면에 보이는 것만 확인하고 상대
  화면으로 넘어가면 저장 전에 조회해 간헐 실패한다. POST 응답을 기다릴 것.
- WDS `Modal`은 `role="dialog"`이고 접근성 이름은 `ModalNavigation`의 제목이다.
  `getByRole("dialog", { name: "..." })`가 정상 동작한다. `03-3` §6의 우려는 사실이 아니었다.
- 매칭 상세에는 출처 배지가 없다(`6479506`에서 의도적으로 뺐다). `모집자가 코트를
  예약했어요`는 미리보기 시트에만 있다.
- 실패하면 `test-results/.../error-context.md`의 접근성 스냅샷을 먼저 볼 것. 실제 이름이
  그대로 적혀 있어 추측할 필요가 없다.

## 8. 배포 전 체크리스트

1. **마이그레이션 2개가 공유 DB에 적용되지 않았다.** 로컬 E2E DB에만 적용돼 있다.
   - `20260909200000_court_match_participant_cancel` — `ALTER TYPE "NotificationType" ADD VALUE` 포함
   - `20260909210000_support_inquiry_match_reference`
2. **약관 문구는 법무 검토가 필요하다.** `/terms`에 참가비·환불·현장 책임 세 절을
   새로 넣었다. 배포 전에 사람이 읽어야 한다.
3. 크론은 보류 상태 그대로다. 배포로 재개하지 않는다.

## 9. 남은 일

### 9.1 사용자 결정이 필요한 것

- **Commerce 재설계.** `01 §14.2`, `02-prd §3.3`, `07-court-commerce-design.md`가 *일반
  모집자가 코트 이용 총액을 결제*하던 전제로 쓰여 있다. 주최자가 운영자로 바뀌면서
  결제 주체와 환불 대상이 달라졌다. 각 문서에 주의 문구만 달아 두었다. 확정된 수수료
  정책(운영자 부담 5%, 첫 결제 후 30일 0%)은 사용자 확정값이라 그대로 두었다.
- **크론 재개 여부.** 재개하면 무접속 상태의 정시 취소 알림을 별도로 검증해야 한다.

### 9.2 바로 할 수 있는 것

- **`03-1-court-partner-screen-spec.md`의 폐기 절 정리.** 지금은 문서 머리에 배너만
  있다. §3·§4.2·§4.4·§6.2·§7·§10~§12가 폐기 대상이다.
- **참가자 취소의 운영자 알림 확인.** `COURT_MATCH_PARTICIPANT_CANCELLED` 알림을
  브라우저에서 지나가 보지 않았다. 도메인 테스트로만 확인했다.
- **문의 매칭 참조의 화면 확인.** 코트 매칭에서 문의로 넘어가는 링크와 문의 내역의
  매칭 표시를 브라우저에서 보지 않았다. 도메인 테스트로만 확인했다.
- **모바일 390×844에서 취소 흐름 눈으로 확인.** E2E는 통과하지만 2단계 확인 패널의
  여백·버튼 크기는 사람이 봐야 안다.

### 9.3 하지 말아야 할 것

- 크론·스케줄러 재개, Vercel 요금제 변경
- 공유/운영 DB를 테스트에 사용하거나 초기화
- 옛 `PARTNER_COURT` 데이터 삭제 (보존으로 확정)
- 환불 비율·노쇼 패널티·수락 후 취소 정책을 임의로 바꾸기 (§3이 확정값)
- 실패하는 테스트를 지우거나 기대값을 약하게 해서 숫자 맞추기

## 10. 다음 세션에 줄 시작 프롬프트

> `docs/03-5-claude-to-codex-handoff.md`를 전체 읽고 이어서 작업해줘.
> 제품 정책은 `docs/03-2-court-match-operator-hosted-redesign.md`가 정본이야.
> 코드 기준은 main의 `b12ef10`이지만 이후 변경이 있으면 보존해줘.
> 전용 E2E DB는 이미 준비돼 있어(포트 55432). 검증할 때 `E2E_DATABASE_URL`을 꼭 넣고,
> 공유/운영 DB는 테스트에 쓰지 마. 크론 작업은 내가 명시적으로 재개하기 전까지 보류야.
> 정책이 미정인 부분은 임의로 구현하지 말고 질문할 사항만 정리해줘.

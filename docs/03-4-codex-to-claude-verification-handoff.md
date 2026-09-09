# Codex → Claude: 코트 매칭 실동작 검증 인수인계

작성일: 2026-09-09

## 0. 이번에 맡길 임무와 가장 중요한 결정

사용자는 토큰 사용량 때문에 다음 작업을 Claude에게 인계하기로 했다.
이번 임무는 **전용 테스트 DB를 준비하고, 구현된 코트 매칭을 실제 브라우저·API·DB에서
검증하며, 그 과정에서 발견한 결함을 수정하는 것**이다. 기존 기능을 새로 만드는
작업이나 화면 전면 재설계가 아니다.

**크론 작업은 보류다. 사용자가 명시적으로 재개를 요청하기 전까지 진행하지 않는다.**

- Vercel 매분 실행 설정, Pro 요금제 전환, Cloudflare 등 외부 스케줄러 연동을 하지 않는다.
- 현재 `vercel.json`의 기존 일일 설정을 유지한다. 이번 인수인계는 기존 크론을 끄라는 뜻도 아니다.
- 상세 조회·신청·승인·입금 요청 시의 서버 시간 보정 코드는 유지한다.
- 전용 테스트 DB에서 시간 판정 함수를 직접 호출하거나, 시간 조건에 맞는 픽스처로
  요청 시 보정을 검증하는 것은 이번 임무에 포함된다. 외부 예약 실행을 재개하는 것과 다르다.
- 접속자가 없을 때 제시간에 취소 알림이 가는지는 **미완료·보류**다. 이 항목까지
  완료됐다고 보고하지 않는다.

이 결정은 저장소 `AGENTS.md` §8과 `docs/03-3-court-match-work-handoff.md` §0에도 기록했다.

## 1. 기준 상태와 먼저 읽을 문서

코드 기준 커밋은 **`394e5f1 fix: 코트 매칭 기한과 환불 동시 처리 보완`**이다.
작성 직전 `main`과 `origin/main`이 이 커밋으로 일치하고 작업 폴더는 깨끗했다.
이 문서는 그 이후에 작성한 인수인계 파일이므로 새 환경에서는 코드 커밋과 문서의
전달 여부를 각각 확인한다. 이후 사용자나 다른 에이전트의 변경이 있으면 보존한다.

읽는 순서:

1. `AGENTS.md`: 공통 규칙, 크론 보류, 기존 작업 보존, 검증 기준.
2. `docs/03-2-court-match-operator-hosted-redesign.md`: **코트 매칭 제품 정책 정본**.
3. 이 문서: 현재 상태와 구체적인 다음 임무.
4. `docs/03-3-court-match-work-handoff.md`: 모델 전환 배경과 과거 함정.
5. `README.md`의 브라우저 E2E·코트 매칭 자동 처리, `docs/05-api-spec.md`의 코트 매칭 API.

주의: 03-3에는 역사 기록이 섞여 있다. ‘화면을 만들어야 한다’, ‘테스트와 빌드를
실행하지 못했다’, ‘API 문서가 없다’는 과거 문구를 현재 상태로 받아들이지 않는다.
현재 화면·API는 구현돼 있고 API 명세에도 코트 매칭 항목이 있다. 문서 아래쪽의
‘2026-09-09 Codex 재검증’과 실제 코드를 함께 확인한다.
03-1의 폐기된 모델을 근거로 일반 사용자가 코트 매칭을 개설하는 흐름을 되살리지 않는다.

## 2. 완료된 것과 아직 확인하지 못한 것

### 완료된 구현

- 코트 운영자가 시간과 조건을 공개하며 `PARTNER_COURT` Match를 주최한다.
- 참가자 상세는 `/partner-sessions/{slotId}`, 운영자 상세는
  `/partner/court-matches/{matchId}`다. 기존 `/matches/{matchId}`는 코트 매칭 상세로 연결한다.
- 자동 승인·운영자 승인, 입금 알림·확정, 취소 후 환불 계좌 입력·환불 완료 표시.
- 보낸 신청, 마이 페이지, 알림, 운영자 처리 목록, 긴급 공급 철회.
- 일반 매칭 API로 코트 매칭 승인·취소 등을 우회하는 경로 차단.

### `394e5f1`에서 수정한 결함

1. 신청·승인·입금 알림·입금 확인에서 같은 시간 보정을 적용한다.
2. Match 행 잠금을 얻은 뒤 현재 시각을 읽는다. 대기 중 기한을 넘으면 최신 시각으로 판정한다.
3. 판정 시점까지 확정된 인원이 미달이면 취소하고 이후 승인을 막는다.
4. 기한 때문에 요청을 거절하더라도 자동 취소·만료 상태와 알림은 커밋한다.
5. 상세 상태 보정 뒤 Slot 표시 정보를 다시 읽어 상단 상태와 참가 상태가 어긋나지 않게 했다.
6. 환불 계좌 수정과 환불 완료를 같은 Match 행 잠금으로 직렬화했다.

### 검증 결과의 정확한 범위

| 항목 | 현재 상태 |
| --- | --- |
| 린트·타입 검사 | 통과 |
| Vitest 단위/API 테스트 | **47개 파일, 269개 테스트 통과** |
| 프로덕션 빌드 | `npm run build` 통과 |
| 시간 경계·환불 동시 처리 | 단위 테스트에서 DB 동작·실행 순서를 모사해 확인 |
| 실제 PostgreSQL 동시성 | **미검증** |
| Playwright 브라우저 E2E | **미실행: `E2E_DATABASE_URL` 미설정** |
| 실제 자동 스케줄 호출 | **보류** |

269개 통과는 DB 행 잠금이나 브라우저 화면까지 검증됐다는 뜻이 아니다.
이 공백을 메우는 것이 이번 인수인계의 핵심이다.

## 3. 제품 규칙 — 테스트 기대값

| 항목 | 반드시 유지할 규칙 |
| --- | --- |
| 일반 매칭 | `EXTERNAL_RESERVED`, 일반 매칭 탭에 노출 |
| 코트 매칭 | `PARTNER_COURT`, 운영자가 주최, 코트 매칭 탭에 노출 |
| 참가비 | 운영자가 정한 게스트 1인 고정액. 정원으로 나누지 않음 |
| 승인 방식 | `AUTO`: 바로 `ACCEPTED`; `OPERATOR`: `PENDING` 후 운영자 승인 |
| 참가 확정 | `ACCEPTED`는 입금 대기, 운영자 입금 확인 후 `CONFIRMED` |
| 자리 점유 | `ACCEPTED + CONFIRMED` |
| 진행 최소 인원 | 시작 3시간 전까지 `confirmedAt`이 기록된 `CONFIRMED` |
| 초기 입금 기한 | `min(승인 시각 + 6시간, 시작 3시간 전)` |
| 판정 후 추가 승인 | 최소 인원을 이미 충족한 경우만 허용. 입금 기한은 시작 30분 전 |
| 신청·입금 마감 | 시작 30분 전. 경계에 도달한 경우도 마감 |
| 미입금 만료 | `EXPIRED_UNPAID`, 자리 반환 |
| 최소 인원 미달 | Match 취소, 관련 신청 취소, 입금 완료 이력은 환불을 위해 보존 |
| 환불 대기 | `CANCELLED && confirmedAt && !refundCompletedAt` |
| 계좌 공개 | 참가자는 본인이 승인·확정된 경우에만 정산 계좌 확인 |
| 운영자 정보 공개 | 기본 신청·입금·환불 정보. 프로필 스냅샷·신청 메시지는 `OPERATOR` 방식에서만 |
| 채팅 | 새 코트 매칭 참가자는 `CONFIRMED` 이후. 운영자 및 해당 방 멤버 권한 유지 |
| 과거 기록 | 모집자가 호스트인 옛 `PARTNER_COURT`와 `COURT_TBD` 이력 보존. 새 신청 제한 유지 |

‘입금했어요’는 참가자의 신고이고 자동 송금 검증이 아니다. ‘환불 완료’도 운영자가
처리했다고 표시하는 기록이다. 실제 은행 이체·결제 서비스 연동은 이번 범위가 아니다.

## 4. 환경 준비 — 이 순서를 지킬 것

### 4.1 저장소·도구 확인

작업 경로는 `/Users/zseon/Desktop/mine/rally-on`이다. 다른 머신이면 실제 경로를 사용한다.

```bash
git status --short
git branch --show-current
git log -5 --oneline
node --version
npm --version
```

Node.js는 프로젝트 기준 22 계열, `package.json` 엔진은 `>=22.12.0`이다.
깨끗한 작업 폴더에서 원격 갱신이 필요하면 `git pull --ff-only`로 받는다. 로컬 변경이
있으면 자동 reset·덮어쓰기·무조건 stash를 하지 않는다.

이전 Claude 환경은 격리된 Linux VM에서 런타임 실행이 제한됐다는 기록이 있다.
현재 환경에서도 불가능하다고 가정하지 말고 실제 Node·브라우저·Docker 접근부터 확인한다.
불가능하면 실패 명령과 원인을 남기고 실행 가능한 대안까지만 확인한다.

### 4.2 테스트 DB 분리

**기존 `.env.local`의 `DATABASE_URL`은 공유 Neon DB를 가리킨다. 그대로 E2E에 쓰지 않는다.**

`tests/e2e/fixtures.ts`의 `resetE2eDatabase()`는 매 테스트 전에 다음 명령을 실행한다.

```sql
TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE;
```

따라서 일반 개발·공유·preview·운영 DB에 E2E URL을 연결하면 데이터가 삭제된다.
현재 보호장치는 DB 이름에 `e2e`가 있는지만 검사한다. 이름 검사만 통과했다고
안전하다고 판단하지 말고 **호스트·포트·DB 이름과 실제 용도**를 확인한다.
비밀번호와 전체 연결 문자열은 로그·문서·커밋에 남기지 않는다.

기본 권장 경로는 저장소 `compose.yaml`의 로컬 PostgreSQL 17에 전용 DB를 만드는 것이다.
Docker가 설치되고 실행 중이며 5432 포트를 다른 서비스가 사용하지 않는지 먼저 확인한다.

```bash
docker compose ps
docker compose up -d postgres
docker compose exec postgres psql -U tennis_mate -d tennis_mate -tAc "SELECT datname FROM pg_database WHERE datname = 'tennis_mate_e2e';"
```

DB가 없다면 한 번만 생성한다. 이미 있으면 E2E 전용인지 확인하고 재사용한다.

```bash
docker compose exec postgres psql -U tennis_mate -d tennis_mate -c 'CREATE DATABASE tennis_mate_e2e OWNER tennis_mate;'
```

위 구성에서만 사용할 수 있는 로컬 테스트 전용 URL:

```dotenv
E2E_DATABASE_URL=postgresql://tennis_mate:tennis_mate@127.0.0.1:5432/tennis_mate_e2e?schema=public
```

기존 앱용 DB 변수를 영구 변경하지 않는다. `.env.local`에는 E2E 변수만 추가하거나,
실행 셸에 E2E 변수만 전달한다. 이 파일은 커밋하지 않는다.
Docker를 사용할 수 없으면 기존 로컬 PostgreSQL을 확인한다. 그것도 없을 때는
필요한 실행 환경만 사용자에게 구체적으로 설명한다. 임의로 공유 Neon DB를 대체재로
선택하거나 유료 리소스를 생성하지 않는다.

### 4.3 마이그레이션의 연결 대상 주의

`prisma.config.ts`는 **`DATABASE_URL_UNPOOLED`를 `DATABASE_URL`보다 먼저 사용한다.**
마이그레이션할 때 하나만 덮어쓰면 `.env.local`에 남아 있는 공유 DB로 향할 수 있다.
아래 예시는 직전 절의 로컬 전용 DB에만 적용한다.

```bash
export E2E_DATABASE_URL='postgresql://tennis_mate:tennis_mate@127.0.0.1:5432/tennis_mate_e2e?schema=public'
DATABASE_URL="$E2E_DATABASE_URL" DATABASE_URL_UNPOOLED="$E2E_DATABASE_URL" npm run db:migrate:deploy
npm run db:generate
npm run e2e:install
npm run e2e -- --list
```

`.env.local`에만 적은 값은 위 셸의 `$E2E_DATABASE_URL`로 자동 전달되지 않는다.
위 export를 실행하거나 해당 환경에서 안전하게 로드한다.
현재 Playwright 설정은 `.env.local`을 직접 읽지만 일반 셸은 그렇지 않다.

### 4.4 개발 서버·인증의 함정

- E2E 주소는 `http://127.0.0.1:3100`이다. 기존 3000 개발 서버에 연결하지 않는다.
- `playwright.config.ts`는 서버를 직접 시작하고 `reuseExistingServer: false`를 사용한다.
- 3100이 점유돼 있으면 프로세스의 실행 경로·주인을 확인한다. 다른 작업 서버를 무작정 종료하지 않는다.
- 3000과 3100이라도 같은 checkout에서 Next 빌드 산출물을 공유할 수 있다. 개발 서버와
  빌드/E2E를 동시에 실행해 충돌하지 않도록 실행 순서를 조정한다. 필요시 산출물
  분리는 테스트 전용 범위에서 해결하고 기존 환경 설정을 훼손하지 않는다.
- E2E는 실제 카카오 로그인 대신 `signInAs()`가 테스트 전용 Auth.js JWT 쿠키를 넣는다.
  테스트 계정은 host/applicant/outsider/operator 네 개다. 운영 인증 우회 기능을 추가하지 않는다.
- DB 픽스처를 초기화하므로 `workers: 1`, `fullyParallel: false`를 유지한다.

## 5. 1차 임무: 기존 브라우저 테스트를 실제로 통과시키기

명령:

```bash
npm run e2e
```

현재 `tests/e2e/match-flow.spec.ts`에는 다음 5개 테스트가 있다.

1. 모바일 코트 매칭 제목·하단 메뉴 유지.
2. 일반 매칭 개설·참가 신청·수락·채팅·제3자 차단.
3. 코트 매칭 AUTO 신청 → 입금 알림 → 운영자 확정 → 채팅.
4. 코트 매칭의 일반 목록 제외와 옛 상세 주소 리다이렉트.
5. 과거 `COURT_TBD` 이력·채팅·완료 유지 및 새 신청 차단.

실패를 분석할 때 구분할 것:

- DB·인증·서버 부팅 실패인지, 실제 제품 동작 결함인지, 옛 테스트 선택자 문제인지 먼저 판단한다.
- WDS Modal의 접근성 이름, 같은 이름의 버튼 여러 개, 날짜·시간 휠 입력을 우선 확인한다.
  일반 매칭 테스트에는 `getByLabel(...).fill(...)`이 남아 있다. 실제 UI가 버튼·휠로
  바뀌었다면 현재 사용자 조작으로 테스트를 고친다. 테스트 때문에 UI를 옛 구조로 되돌리지 않는다.
- 대기 시간을 길게 늘려서 숨기지 말고 응답·화면 상태를 기다린다.
- 오류가 난 화면의 스크린샷, console/pageerror, 실패 API 응답, DB의 실제 상태를 대조한다.
- 제품 결함을 발견하면 재현 테스트와 함께 최소 범위로 수정한다. 기대값을 약하게 하거나
  `.skip`/`.only`, 무조건 성공하는 mock으로 바꿔 ‘통과’를 만들지 않는다.

초기 기본 픽스처는 10일 뒤 코트 매칭, AUTO, 최소/최대 2명, 혼복 남1·여1,
고정 참가비 36,000원이다. 향후 시간 경계·OPERATOR·환불 테스트에 그대로 재사용하면
조건이 맞지 않으므로 전용 픽스처 옵션을 추가한다.

## 6. 2차 임무: 코트 매칭 상태·권한 검증 확대

아래 표를 테스트 체크리스트로 사용한다. 모든 조합을 브라우저로 반복할 필요는 없다.
핵심 사용자 행동은 브라우저, 세부 권한·경계는 API/실제 DB 통합 테스트로 나눈다.

| 시나리오 | 기대 결과 |
| --- | --- |
| OPERATOR 신청 | PENDING. 아직 정산 계좌 미공개, 채팅 입장 불가 |
| 운영자 승인 | ACCEPTED, 입금 코드·기한 생성, 본인에게 계좌 공개 |
| 운영자 거절 | REJECTED. 자리 점유 없음 |
| AUTO 신청 | 즉시 ACCEPTED. 운영자에게 프로필 스냅샷·신청 메시지 추가 노출 없음 |
| 참가자 입금 알림 | 알림 기록만 생성. 아직 CONFIRMED 아님 |
| 운영자 입금 확인 | CONFIRMED, 채팅 멤버 생성, 참가자와 운영자 화면 상태 일치 |
| 중복 신청·확정 | 중복 레코드·중복 좌석·중복 멤버 없음. 정의된 충돌 응답 |
| 타 운영자·제3자 요청 | 승인·확정·환불 완료와 타인의 계좌 수정 불가 |
| 입금 기한 도달 | EXPIRED_UNPAID, 자리 반환, 요청 오류 뒤에도 DB 만료 상태 유지 |
| 시작 3시간 전 미달 | Match 취소, 취소 알림, 입금 이력이 있는 참가자는 환불 대기 |
| 판정 후 미달 상태 승인·확정 | 요청 실패. 취소 상태가 트랜잭션 rollback으로 사라지지 않음 |
| 판정 시점까지 최소 인원 충족 | 이후 추가 승인 가능. 입금 기한은 시작 30분 전 |
| 시작 30분 전 도달 | 새 신청·승인·입금 확인 불가. 남은 PENDING 취소 |
| 취소 후 계좌 입력 | 본인의 환불 대상 건만 가능. 완료 전 수정 가능 |
| 운영자 환불 완료 | 완료 시각 표시, 이후 계좌 수정 거절, 다른 참가자 정보 미노출 |
| 긴급 공급 철회 | AVAILABLE에 연결된 Match도 취소. CONFIRMED 신청자가 환불 대상에 남음 |
| 상태 보정 후 상세 | 상단 Slot 상태와 participation 상태, CTA가 서로 일치 |
| 일반 매칭 API 우회 | 코트 매칭을 코드·기한 없는 ACCEPTED로 만들거나 잘못 취소할 수 없음 |

추가로 모바일 390×844 기준에서 운영자 목록, 보낸 신청, 마이 페이지, 알림 링크가
같은 상태를 보여 주는지 확인한다. 오래된 탭·새로고침·서버 오류·빈 목록에서도
중복 조작이나 진행 불가능한 CTA가 생기는지 확인한다.

### 시간 테스트 구현 방향

- 실제로 3시간을 기다리지 않는다. 전용 DB의 시작 시각·기한·확정 시각을 목적에 맞게 만든다.
- `confirmedAt`은 최소 인원 판정 시점과의 관계까지 맞춰야 한다.
- 브라우저의 가짜 시계만 변경해도 서버 `new Date()`는 변하지 않는다.
- 정밀한 경계는 기존 `reconcileCourtMatch(prisma, matchId, at)`의 시간 인자를 활용할 수 있다.
  반드시 E2E 전용 Prisma 연결로 호출한다.
- 사용자 요청 경로 검증은 기한이 이미 지난 DB 픽스처를 만들고 실제 요청을 보낸다.
  production용 ‘시간 변경 API’나 인증 우회 테스트 엔드포인트를 추가하지 않는다.
- 외부 크론 호출·등록·변경은 하지 않는다. 시간 보정 함수 자체의 검증만 수행한다.

## 7. 3차 임무: 실제 PostgreSQL 동시성 검증

`src/server/domain/court-match-service.test.ts`는 실행 순서를 모사하는 단위 테스트다.
진짜 PostgreSQL의 `FOR UPDATE` 대기와 커밋 순서를 검증한 것은 아니다.

최소한 아래 경우를 **전용 DB에서 별도 연결/동시 트랜잭션**으로 확인한다.

1. 남은 한 자리에 서로 다른 두 사람이 동시에 AUTO 신청: 정확히 한 사람만 자리를
   얻고 ACCEPTED+CONFIRMED가 총 정원·성별 정원을 넘지 않는다.
2. OPERATOR 모드에서 마지막 자리를 두 신청에 동시에 승인: 한 건만 승인된다.
3. 같은 참가자의 중복 신청 또는 같은 입금 건의 중복 확정: 레코드·멤버십이 중복되지 않는다.
4. 환불 완료가 먼저 잠금을 획득: 기다리던 계좌 수정은 완료 여부를 다시 읽고 거절한다.
   기존 계좌는 완료 뒤 덮어써지지 않는다.
5. 계좌 수정이 먼저 커밋: 후속 완료 처리에서 최신 계좌 상태를 읽으며 완료 후 변경은 막는다.
6. Match 잠금을 기다리는 동안 판정 시점을 지나는 요청: 대기 전 시각으로 승인하지 않는다.

단순 `Promise.all()`만 쓰면 두 작업이 실제로 겹쳤는지 알 수 없다. 테스트용 별도
트랜잭션에서 Match 행 잠금을 먼저 보유한 뒤 요청들을 시작하고, 잠금 해제 순서를
제어하거나 실제 대기 상태를 확인하는 방식으로 재현한다. 풀의 연결 개수와 각
트랜잭션의 제한 시간을 고려하고, 실패 시에도 잠금·연결을 finally에서 정리한다.
서버 전체 시간/운영 데이터 변경이나 실제 이체는 필요하지 않다.

## 8. 코드 탐색 지도와 수정 시 함정

| 파일 | 역할·주의점 |
| --- | --- |
| `src/server/domain/court-match.ts` | 기한 계산, 상태 기준, 입력 스키마 |
| `src/server/domain/court-match-service.ts` | 신청·승인·입금·환불·시간 보정 |
| `src/server/domain/court-match-service.test.ts` | 신규 회귀 테스트, rollback을 모사하는 fixture |
| `src/server/domain/court-match.test.ts` | 기한 계산·기본 신청 테스트 |
| `src/server/domain/court-match-view.ts` | 참가자/운영자 응답, 개인정보 공개 범위, 상세 조회 시 보정 |
| `src/server/domain/court-slot-service.ts` | 시간 공개, 긴급 철회, 공개 Slot 표시 |
| `src/server/domain/match-service.ts` | 일반 매칭 경로 차단, 목록 구분, 기존 매칭 동작 |
| `src/server/domain/match-chat-service.ts` | 채팅 멤버십·읽기 전용 전환 |
| `src/features/partner/partner-session-detail.tsx` | 참가자 상세 |
| `src/features/partner/court-match-payment.tsx` | 참가자 입금·환불 UI |
| `src/features/partner/operator-court-match.tsx` | 운영자 승인·입금·환불 UI |
| `src/app/api/v1/partner-session-slots/[slotId]/route.ts` | 보정 후 Slot 재조회로 상단 상태 일치 |
| `tests/e2e/fixtures.ts` | 전용 DB 초기화·계정·공개 Slot fixture |
| `tests/e2e/match-flow.spec.ts` | 현재 브라우저 테스트 5개 |
| `playwright.config.ts`, `tests/e2e/e2e-environment.ts` | 서버 환경·전용 DB 검사 |

핵심 구조:

- `withCurrentCourtMatch()`는 잠금 → 시간 보정 → 요청 처리를 같은 트랜잭션 안에서 수행한다.
- 취소/기한 만료 거절은 트랜잭션에서 `{ error }` 결과로 반환하고 **커밋 이후** 예외를 던진다.
  이 부분을 콜백 내부 `throw`로 단순화하면 취소·만료까지 rollback되는 결함이 재발한다.
- `reconcileLockedCourtMatch()`는 이미 Match 잠금을 보유한 호출자용이다.
- 환불 계좌 수정과 완료 모두 `lockApplicationMatch()`를 거쳐 같은 Match 행을 잠근다.
- 진행 판정은 `countConfirmed(..., getJudgementAt(startsAt))`로 `confirmedAt <= 판정 시점`을 센다.
- `ALLOCATED`나 `ACCEPTED`를 단독 조건으로 쓰는 코드를 만나면 구 모델 가정인지 확인한다.
- 조회 시 보정과 권한 검사 순서에서 문제가 드러나면 실제 재현 근거로 최소 범위를 고친다.
  개인정보 공개 범위를 넓혀 테스트를 통과시키지 않는다.

관련 API:

```text
GET  /api/v1/partner-session-slots/{slotId}
GET  /api/v1/operator/court-matches/{matchId}
POST /api/v1/court-matches/{matchId}/applications
POST /api/v1/court-match-applications/{id}/decision       { accept: boolean }
POST /api/v1/court-match-applications/{id}/deposit        { depositorName }
POST /api/v1/court-match-applications/{id}/confirm
PUT  /api/v1/court-match-applications/{id}/refund-account { bank, accountNumber, accountHolder }
POST /api/v1/court-match-applications/{id}/refund
```

새 프레임워크·프로덕션 의존성·인증 방식 변경은 필요하지 않다. 코드를 수정하기
전에는 `AGENTS.md`가 안내하는 설치된 Next.js 문서도 확인한다.

## 9. 정책 정리는 검증 이후, 구현 전에는 사용자 결정 필요

검증을 마치면 파일럿 전에 남은 정책을 표로 정리해 사용자에게 제안한다.

- 입금한 참가자가 불참하거나 노쇼한 경우의 환불 여부.
- 시설 폐쇄·코트 사용 불가·현장 사고 등 문제의 책임 주체.
- 운영자와 참가자가 이견을 보일 때 문의 접수 및 처리 절차.
- 옛 모델 `PARTNER_COURT` 데이터의 장기 유지/정리 방침.

현재 확정된 것과 미정인 것을 구분하고, 권장안·간단한 대안·화면/API 영향만 제시한다.
임의의 환불 비율·노쇼 패널티·수락 후 취소 정책을 만들거나 옛 데이터를 삭제하지 않는다.
이 정책 질문 때문에 독립적으로 가능한 E2E·동시성 검증을 먼저 멈출 필요는 없다.

## 10. 작업 순서와 완료 보고

작업을 작은 단위로 나누어 진행한다.

1. 현재 코드·문서·환경 확인 → 전용 E2E DB와 Chromium 준비.
2. 기존 브라우저 테스트 5개 실행 → 환경 문제와 제품 결함을 구분해 수정.
3. OPERATOR·시간 경계·취소·환불·권한 시나리오 추가 및 검증.
4. 실제 PostgreSQL 동시성 검증 → 필요한 결함만 수정.
5. `npm run check`, 관련 DB 통합 테스트, 전체 `npm run e2e` 실행.
6. 실행 방법·신규 테스트·발견한 결함과 남은 정책을 관련 문서에 갱신.

기존 269개 테스트의 숫자를 고정 목표로 삼지 않는다. 신규 테스트가 추가되면 실제
개수를 보고한다. 실패한 테스트를 삭제해서 숫자만 맞추지 않는다.
같은 checkout의 Next 개발 서버와 빌드를 겹쳐 실행하지 않는다.

완료 보고에는 아래를 반드시 포함한다.

- 발견한 결함과 사용자에게 달라지는 동작.
- 실행한 검사·테스트 개수·통과 여부.
- 실제 DB의 동시 실행까지 검증했는지, 단위 모사만 했는지.
- 주요 브라우저 경로와 실패 시 추적 자료 위치. 자료에는 실제 개인정보가 없어야 한다.
- 남은 미정 정책과 크론 보류 상태.
- 변경 파일, 커밋/푸시 여부, 실제 배포 여부를 각각 구분.

**이번 임무의 완료 기준:** 실제 전용 DB로 기존·추가 핵심 흐름이 통과하고, 입금/환불/
정원 동시 처리 결과가 올바르며, 타입·린트·단위/API·빌드 검사가 통과하는 것.
크론 보류와 미확정 운영 정책은 명시적으로 남긴다. 실행 환경이 끝내 없으면
‘완료’라고 하지 말고 재현 가능한 실패 정보와 필요한 조치만 보고한다.

이 문서 자체는 운영 배포·요금제 변경·공유 DB 초기화를 승인하는 문서가 아니다.
커밋·푸시 등의 저장소 작업은 사용자가 해당 세션에서 요청한 범위를 확인해서 진행한다.

## 11. Claude에게 전달할 시작 프롬프트

> `docs/03-4-codex-to-claude-verification-handoff.md`를 전체 읽고 이어서 작업해줘.
> 제품 정책은 `docs/03-2-court-match-operator-hosted-redesign.md`가 정본이야.
> 코드 기준은 main의 `394e5f1`이지만 이후 변경이 있으면 보존해줘.
> 전용 로컬 E2E DB를 준비하고 기존 브라우저 테스트부터 실행한 뒤,
> 운영자 승인·취소·환불·실제 PostgreSQL 동시성 검증과 필요한 버그 수정을 진행해줘.
> 공유/운영 DB는 테스트에 사용하지 마. 크론 작업은 내가 명시적으로 재개하기 전까지
> 보류야. Vercel Pro 전환이나 Cloudflare 연동도 진행하지 마.
> 정책이 미정인 부분은 임의로 구현하지 말고, 검증을 진행하면서 질문할 사항만 정리해줘.

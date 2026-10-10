# Rally On

테니스 초보자가 실력 차이에 대한 부담을 덜고, 자신과 비슷한 사람을 찾아 함께
칠 약속을 잡도록 돕는 모바일 우선 웹앱입니다.

Core MVP에서는 카카오 로그인·온보딩, 추천 매칭 탐색·상세, 이미 예약한 외부 코트로 만드는
매칭 등록, 신청·수락·거절, 서비스 내 Match 채팅, 모집 마감·취소·완료 처리를 제공합니다.
코트를 아직 확보하지 못했다면 운영자가 준비한 시간을 사용하는 `코트 매칭`에서 세션을 엽니다.
새 `COURT_TBD` 매칭은 만들 수 없으며, 기존 기록은 이력과 기존 참여자 채팅을 위해 보존합니다.

현재는 **M9: 제한된 사용자 테스트 준비** 단계입니다. 참여자 운영 방법과 관찰 양식은
[M9 제한된 사용자 테스트 운영 가이드](docs/07-m9-limited-user-test.md)를 참고하세요.

## 기술 구성

- Node.js 22.12 이상, npm
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4
- PostgreSQL 17, Prisma ORM 7, Zod 4, Vitest 4, Playwright
- 배포: Vercel + Neon PostgreSQL

## 빠른 시작: 로컬 PostgreSQL

### 1. 준비물

- Node.js 22.12 이상
- Docker Desktop 또는 Docker Engine + Compose
- 카카오 로그인을 시험하려면 [Kakao Developers](https://developers.kakao.com/) 앱의 REST API 키와 Client Secret

### 2. 저장소 복제와 의존성 설치

```bash
git clone https://github.com/jsl0319/rally-on.git
cd rally-on
npm ci
```

`npm ci`가 끝나면 `postinstall` 스크립트가 Prisma Client를 자동 생성합니다.

### 3. 환경 변수 준비

```bash
cp .env.example .env.local
```

`.env.local`에 로컬 DB와 본인의 카카오 개발용 값을 입력합니다. 실제 키는 절대
커밋하지 않습니다.

```dotenv
DATABASE_URL=postgresql://tennis_mate:tennis_mate@localhost:5432/tennis_mate?schema=public
AUTH_SECRET=<32바이트_이상_무작위_문자열>
AUTH_KAKAO_ID=<카카오_REST_API_키>
AUTH_KAKAO_SECRET=<카카오_Client_Secret>
CRON_SECRET=<32바이트_이상_무작위_문자열>
APP_BASE_URL=http://localhost:3000
```

로컬 Kakao 앱 Redirect URI도 아래 주소로 등록합니다.

```text
http://localhost:3000/api/auth/callback/kakao
```

### 4. DB 초기화와 앱 실행

```bash
docker compose up -d
npm run db:validate
npm run db:migrate:deploy
npm run db:seed
npm run db:seed:m3
npm run dev
```

- 앱: <http://localhost:3000>
- DB 상태: <http://localhost:3000/api/health>

상태 API는 DB 연결에 성공하면 `200`과 `database: "connected"`를 반환합니다.

## Vercel + Neon으로 실행

Vercel 프로젝트 접근 권한이 있는 경우, 연결된 Neon 환경 변수를 가져와 같은
코드를 실행할 수 있습니다.

```bash
vercel link
vercel env pull .env.local --environment=development
npm run db:validate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Neon은 앱 런타임에 풀링된 `DATABASE_URL`을 사용합니다. 마이그레이션은
`DATABASE_URL_UNPOOLED`가 있으면 이를 우선 사용하며, 없으면 일반
`DATABASE_URL`로 동작합니다.

Production 배포는 다음과 같습니다.

```bash
vercel --prod
```

Production Kakao 앱에는 실제 Vercel 도메인의 다음 경로를 Redirect URI로
등록해야 합니다.

```text
https://<your-vercel-domain>/api/auth/callback/kakao
```

## 검증

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

한 번에 모두 실행하려면 다음 명령을 사용합니다.

```bash
npm run check
```

CI도 Node.js 22에서 Prisma Client 생성, 린트, 타입 검사, 테스트, 빌드를
수행합니다.

### 브라우저 E2E

E2E는 실제 카카오 계정이나 운영 DB를 사용하지 않습니다. 별도 PostgreSQL DB를 만들고
이름에 반드시 `e2e`를 포함한 뒤 `.env.local`에 설정합니다. 테스트는 이 전용 DB를
초기화하므로 production·preview·일반 개발 DB URL은 지정할 수 없습니다.

```dotenv
E2E_DATABASE_URL=postgresql://tennis_mate:tennis_mate@localhost:5432/tennis_mate_e2e?schema=public
```

로컬에 DB가 없으면 저장소의 compose로 띄우고 e2e 전용 DB를 하나 만듭니다.

```bash
docker compose up -d postgres
docker compose exec postgres psql -U tennis_mate -d tennis_mate \
  -c 'CREATE DATABASE tennis_mate_e2e OWNER tennis_mate;'
```

Docker가 없다면 Homebrew로도 됩니다. 기본 포트와 자동 시작을 건드리지 않으려고
전용 포트에 전용 클러스터를 따로 띄웁니다.

```bash
brew install postgresql@17
PGBIN="$(brew --prefix postgresql@17)/bin"
"$PGBIN/initdb" -D ~/.rally-on-e2e-pg -U postgres --auth=trust -E UTF8 --locale=C
"$PGBIN/pg_ctl" -D ~/.rally-on-e2e-pg -o "-p 55432 -k /tmp -c listen_addresses=127.0.0.1" \
  -l ~/.rally-on-e2e-pg/server.log start
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres \
  -c "CREATE ROLE tennis_mate LOGIN PASSWORD 'tennis_mate' SUPERUSER;" \
  -c 'CREATE DATABASE tennis_mate_e2e OWNER tennis_mate;'
```

이때 `E2E_DATABASE_URL`의 포트는 `55432`입니다. 클러스터는 재부팅하면 꺼지므로
다시 쓸 때 위 `pg_ctl ... start`만 실행하면 됩니다.

그다음 전용 DB에 migration을 적용하고 Chromium을 설치합니다. 아래 명령의
`$E2E_DATABASE_URL`은 셸 변수이므로, `.env.local`에만 적어 뒀다면 이 줄에서는
값을 직접 넣거나 먼저 `export` 해야 합니다.

```bash
DATABASE_URL="$E2E_DATABASE_URL" DATABASE_URL_UNPOOLED="$E2E_DATABASE_URL" npm run db:migrate:deploy
npm run e2e:install
npm run e2e
```

`npm run e2e` 자체는 `.env.local`을 읽으므로 셸 변수가 없어도 됩니다.

> **주의:** 테스트는 시작할 때 이 DB의 `users`·`regions`를 `TRUNCATE ... CASCADE`
> 합니다. `E2E_DATABASE_URL`에 개발·운영 DB를 넣으면 데이터가 지워집니다. DB 이름에
> `e2e`가 없으면 실행을 막지만, 값을 넣기 전에 한 번 더 확인해 주세요.

`npm run e2e`는 로컬 `127.0.0.1:3100`에서 앱을 실행하고, 390×844 기준의 테스트
계정 네 개로 일반 매칭 개설·신청·수락·채팅 권한, 코트 매칭의 신청·입금 알림·운영자
확정, 옛 기록 보존, 하단 메뉴 프레임을 확인합니다.

포트 3000에 개발 서버를 띄워 둔 채로 실행하지 마세요. 같은 저장소의 `.next` 산출물을
공유해 테스트가 불안정해집니다.

### 실제 DB 통합 테스트

`tests/db/court-match-flow.test.ts`는 코트 매칭의 권한·상태 경계와 **실제 PostgreSQL
행 잠금 아래의 동시 실행**을 검증합니다. 브라우저 없이 도메인 함수를 직접 호출하며,
E2E와 같은 전용 DB를 씁니다(같은 방식으로 `users`·`regions`를 `TRUNCATE` 합니다).

```bash
export E2E_DATABASE_URL='postgresql://tennis_mate:tennis_mate@127.0.0.1:55432/tennis_mate_e2e?schema=public'
npx vitest run tests/db/court-match-flow.test.ts
```

`E2E_DATABASE_URL`이 없으면 이 파일은 통째로 건너뜁니다. 그래서 DB 없이 `npm run check`
만 돌리면 이 테스트는 실행되지 않습니다. 코트 매칭을 고칠 때는 위 변수를 넣고 함께
돌려 주세요.

### 금융 개인정보 보존 점검

`npm run privacy:audit:financial`은 코트 매칭의 계좌 원문 보유 건수와 보존·추가 검토
사유를 집계하는 내부용 **읽기 전용** 명령입니다. `RETENTION_AUDIT_DATABASE_URL`을
별도로 설정해야 하며 `.env.local`이나 앱의 DB 연결을 자동으로 사용하지 않습니다.
이름·계좌번호·개별 금액·사용자 ID는 출력하지 않고 데이터를 변경하지 않습니다.

삭제 가능 여부를 승인하는 명령은 아닙니다. 최종 대조·원문별 보존 기록을 반영하되,
미해결 업무가 없는 경우에도 별도 보존 근거 검토가 필요하다고 표시합니다. 출력 항목과
대상 범위는 [개인정보 처리 정책안 §11](docs/03-19-personal-data-retention-policy-proposal.md#11-2026-10-09-후속-구현-범위-금융-원문-보존-점검)을 참고하세요.

### 코트 매칭 손으로 확인하기

코트 매칭은 운영자 승인·계좌이체·입금 확인이 얽혀 있어 화면에서 한 번 지나가 보는 게
빠릅니다. 개발 DB에 upsert로만 쓰는 시드가 있습니다(아무것도 지우지 않습니다).

```bash
# 시드 운영자가 코트 매칭을 연다. 내 계정으로 로그인해 참가 신청을 확인한다.
npm run db:seed:court-match

# 내 계정이 운영자가 된다. 승인·입금 확인·환불 화면을 확인한다.
SEED_OPERATOR_USER_ID=<내 user id> npm run db:seed:court-match
```

실행하면 참가자 화면(`/partner-sessions/{slotId}`)과 운영자 화면
(`/partner/court-matches/{matchId}`) 주소를 출력합니다. 신청은 승인 대기·입금 알림
완료·참가 확정 세 가지 상태로 미리 들어가 있어 운영자 화면이 비어 있지 않습니다.

## 자주 쓰는 DB 명령

```bash
npm run db:generate
npm run db:validate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:seed
npm run db:seed:m3
npm run db:studio
```

로컬 PostgreSQL 컨테이너를 멈추되 데이터는 유지하려면 다음을 실행합니다.

```bash
docker compose stop
```

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 앱 런타임용 PostgreSQL 연결 문자열 |
| `DATABASE_URL_UNPOOLED` | Neon 마이그레이션용 직접 연결 문자열(선택) |
| `AUTH_SECRET` | Auth.js 세션 서명 비밀값 |
| `AUTH_KAKAO_ID` | 카카오 REST API 키 |
| `AUTH_KAKAO_SECRET` | 카카오 Client Secret |
| `KAKAO_REST_API_KEY` | 카카오맵 장소 검색용 서버 전용 REST API 키(선택). 기본적으로 `AUTH_KAKAO_ID`를 재사용하며, 다른 카카오 앱 키를 쓸 때만 설정 |
| `CRON_SECRET` | 기존 Vercel 일일 Cron 인증 비밀값 |
| `RECONCILE_CRON_SECRET` | Cloudflare 상태 보정 전용 비밀값. 다른 정리 API에는 사용할 수 없음 |
| `APP_BASE_URL` | 로컬 애플리케이션 기준 URL |
| `E2E_DATABASE_URL` | Playwright 전용 PostgreSQL 연결 문자열. DB 이름에 `e2e` 필수 |

실제 값은 `.env.local` 또는 Vercel 환경 변수로만 관리합니다. `.env.example`은
필수 키를 알리기 위한 빈 템플릿입니다.

### 코트 매칭 자동 처리

**2026-10-10 사용자 결정: 보류를 해제하고 무료 크론을 도입합니다.**
Cloudflare Worker(`ops/cron`)가 전용 키로 `/api/cron/reconcile-matches`를 호출하는
15분 주기 구성을 사용합니다. 실제 활성화·검증 상태와 재실행/중지 절차는
[무료 크론 운영 문서](docs/03-23-free-cron-operations.md)를 따릅니다.
입금 확인 기한 만료, 시작 3시간 전 최소 구성 미달 취소, 시작 90분 전 신청 마감,
일반 매칭 시작 시 마감과 채팅 종료를 기존 도메인 규칙으로 처리합니다.
크론은 기한 자체를 연장하지 않으며, 무접속 상태의 처리·알림은 다음 실행까지 늦어질 수 있습니다.
상세 조회·참가 관련 요청의 즉시 판정과 Vercel의 기존 일일 작업도 유지합니다.
로컬·미리보기 서버에는 운영 예약 실행을 연결하지 않습니다.

## 저장소에 포함하지 않는 파일

`.gitignore`는 실제 환경 변수, Vercel·Neon 연결 정보, `node_modules`, Next.js
빌드 결과, 로컬 에이전트 파일, 생성된 Prisma Client를 제외합니다. 스키마,
마이그레이션, 지역 seed, 문서, CI 설정은 저장소에 포함합니다.

## 주요 구조

```text
src/
  app/                 # App Router 화면과 Route Handler
  features/profile/    # M2 온보딩 화면과 클라이언트 상태
  server/auth/         # 현재 사용자·계정 접근 확인
  server/domain/       # 입력 검증과 프로필 트랜잭션
  server/db/           # Prisma 연결
  server/env.ts        # 환경 변수 검증
prisma/                # 스키마, 마이그레이션, 지역 seed
docs/                  # 제품·화면·데이터·API 설계 문서
.github/workflows/     # CI
```

제품 범위와 정책은 `docs/`, 개발 작업 원칙은 `AGENTS.md`를 기준으로 합니다.


## 금융 대조·보존 기록과 DB 시간대

운영자 참가자 관리와 배정된 거래 인계 화면의 **최종 대조·보존 기록**에서 은행 대조 사실, 필요한 정보 범위, 보존 사유·업무 참조·재검토일을 기록합니다. 재검토일 경과는 자동 해제가 아니며 해제도 개인정보 삭제를 실행하지 않습니다. [상세 정책과 검증](docs/03-20-financial-reconciliation-records.md).

`privacy:audit:financial`을 포함한 새 기능은 `20261010010000_financial_review_records` 마이그레이션 적용 후 사용합니다. 원문·메모 없이 대조 지문과 보존 범위만 조회하며, 보고서는 계속 삭제 불가 상태를 반환합니다.

Prisma 연결은 `src/server/db/prisma-adapter.ts`의 공통 생성 함수를 사용합니다. 기존 URL 옵션을 보존하고 마지막에 `timezone=UTC`를 적용해 서버 기본 시간대에 따른 날짜 변환 오차를 막습니다. 새 DB 클라이언트도 같은 함수를 사용하고, 기존 개발 서버는 재시작해야 합니다. 과거 저장 시각을 자동 보정하지 않습니다.

## 운영 환경과 복구

2026-10-10부터 Vercel Production은 Neon `main`, Preview·Development와 이 작업 공간의 `.env.local`은 별도 `development` 브랜치를 사용합니다. 두 브랜치의 DB 암호도 다릅니다. 개발 DB에는 운영 사용자·거래를 복사하지 않고 지역 기준 데이터만 초기화했습니다. 개발과 미리보기는 같은 비운영 DB를 공유하므로 파괴적인 테스트에는 기존 전용 `E2E_DATABASE_URL`을 사용합니다.

DB 대상을 바꿀 때는 **`DATABASE_URL`과 `DATABASE_URL_UNPOOLED`를 모두 확인**하세요. Prisma 마이그레이션은 unpooled 값을 우선합니다. 기존에 실행 중이던 개발 서버는 재시작해야 바뀐 설정을 읽습니다. 과거 배포는 환경변수 변경으로 재설정되지 않으므로 오래된 미리보기 URL을 개발 테스트용으로 사용하지 않습니다.

운영 변경 전 백업·별도 복원 검증과 관리자 권한 확인 절차는 [소규모 운영 점검](docs/03-21-small-pilot-operations-readiness.md#6-2026-10-10-승인된-후속-실행-기록)을 따릅니다. 백업 파일은 개인정보를 포함하므로 Git·채팅·공개 아티팩트에 올리지 않습니다. 크론 보류는 유지합니다.

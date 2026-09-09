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
계정 두 개로 신청·수락·채팅 권한과 하단 메뉴 프레임을 확인합니다.

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
| `CRON_SECRET` | 운영 매칭 상태 보정 Cron의 요청 인증 비밀값 |
| `APP_BASE_URL` | 로컬 애플리케이션 기준 URL |
| `E2E_DATABASE_URL` | Playwright 전용 PostgreSQL 연결 문자열. DB 이름에 `e2e` 필수 |

실제 값은 `.env.local` 또는 Vercel 환경 변수로만 관리합니다. `.env.example`은
필수 키를 알리기 위한 빈 템플릿입니다.

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

# Rally On API 명세

## 1. 문서 정보

| 항목 | 내용 |
| --- | --- |
| 문서명 | Rally On API Specification |
| 문서 상태 | Draft v0.1 |
| 구현 범위 | Core MVP |
| 기준 문서 | `02-prd.md`, `03-screen-spec.md`, `04-erd.md` |
| 후속 문서 | `06-development-plan.md` |

이 문서는 Rally On Core MVP의 클라이언트와 서버 사이 HTTP 계약을 정의한다. Court Partner Pilot과 Court Commerce API는 별도 섹션으로 구분한다. Court Partner Pilot은 필수 후속 단계지만, 해당 구현이 시작되기 전까지 엔드포인트를 활성화하지 않는다.

## 2. 설계 목표

1. 화면이 필요한 정보를 추가 계산이나 여러 번의 우회 요청 없이 받을 수 있게 한다.
2. 매칭 신청과 수락의 핵심 규칙을 서버에서 일관되게 검증한다.
3. 데이터베이스 필드와 사용자에게 보여줄 파생 값을 구분한다.
4. 상태 충돌을 일반 오류와 구분하여 사용자가 최신 상태를 확인할 수 있게 한다.
5. Core MVP에 필요하지 않은 범용 API와 후속 단계 API를 미리 구현하지 않는다.

## 3. API 범위

### 3.1 Core MVP 활성 범위

- 현재 사용자와 온보딩 상태 조회
- 닉네임 확인·수정
- 테니스 프로필 생성·조회·수정
- 지역 목록 조회
- 추천 매칭과 일반 매칭 목록 조회
- 매칭 상세 조회
- 이미 예약된 외부 코트의 매칭 등록
- 같이 치기 신청
- 받은 신청 조회와 수락·거절
- 보낸 신청 조회와 대기 신청 철회
- 내가 만든 매칭 조회
- 한 명 이상 수락된 매칭의 조기 마감
- 매칭 취소
- 일정 종료 후 모집자의 매칭 완료 확인
- 수락된 멤버에게 매칭별 서비스 내 채팅방 공개

### 3.2 Core MVP에서 확정하지 않는 API

- Auth.js가 관리하는 카카오 로그인·콜백 엔드포인트
- 공개 후 매칭 일정·코트 정보 수정
- 수락 후 신청자의 참가 취소
- 후기, 신고와 차단
- 코트 운영자, 제휴 코트 예약, 결제·환불·정산

카카오 인증의 실제 경로는 프로젝트 초기화 시 Auth.js 구성과 공식 호환성을 확인하여 README에 기록한다. 이 문서의 `/api/v1` 경로는 인증 프레임워크가 관리하는 로그인·콜백 경로와 분리된 제품 API다.

## 4. 공통 HTTP 계약

### 4.1 Base Path

```text
/api/v1
```

모든 요청과 응답은 별도 표시가 없으면 `application/json`을 사용한다.

### 4.2 인증

- 인증이 필요한 API는 서버가 검증한 세션의 User를 사용한다.
- 클라이언트가 보낸 `userId`, `hostUserId`, `applicantUserId`를 권한 판단에 사용하지 않는다.
- 첫 인증 공급자는 카카오다. 쿠키 이름과 세션 저장 방식은 Auth.js 구성을 확정할 때 정한다.
- 비로그인 첫 화면의 메이트 이용·운영자 등록 선택은 같은 카카오 세션을 만든다. 선택값을 API 요청이나 사용자 영구 역할로 저장하지 않는다. 메이트 이용은 기존 테니스 프로필 온보딩으로, 운영자 등록은 활성 계정 확인 뒤 OP01으로 이어진다.
- `/partner/apply`, `/partner/application`으로 돌아가는 인증은 일반 테니스 프로필 온보딩을 선행 조건으로 두지 않는다. 운영 권한은 세션이나 클라이언트 선택값이 아니라 `CourtOperatorApplication` 상태로 별도 판단한다.
- 비로그인 요청은 `401 UNAUTHENTICATED`를 반환한다.
- 정지 또는 탈퇴 계정은 인증 성공 여부와 별개로 제품 API 접근을 차단한다.

### 4.3 필드 표기

- JSON 필드명은 `camelCase`를 사용한다.
- ID는 UUID 문자열이다.
- 시각은 UTC 오프셋이 포함된 ISO 8601 문자열로 전달한다.
- 날짜·시간을 비즈니스 판단에 사용할 때는 `startsAt`, `endsAt`을 사용한다.
- 금액은 원 단위 정수이며 필드명에 `Krw`를 붙인다.
- 선택하지 않은 값은 생략하거나 `null`로 전달할 수 있으나, 서버 응답은 각 DTO에서 정한 형태를 유지한다.

예:

```json
{
  "startsAt": "2026-08-22T01:00:00.000Z",
  "endsAt": "2026-08-22T03:00:00.000Z",
  "totalCourtFeeKrw": 40000
}
```

서울 화면에서는 위 시각을 `2026년 8월 22일 오전 10시~12시`로 표시한다.

### 4.4 성공 응답

단건 응답은 리소스를 직접 반환한다.

```json
{
  "id": "0198...",
  "status": "OPEN"
}
```

생성 성공은 `201 Created`, 조회·수정·상태 전환 성공은 `200 OK`, 응답 본문이 없는 로그아웃 같은 작업은 `204 No Content`를 사용한다.

### 4.5 목록 응답과 페이지네이션

목록은 cursor 기반 페이지네이션을 사용한다.

```json
{
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNext": false
  }
}
```

- 기본 `limit`은 20, 최대 50이다.
- cursor는 클라이언트가 해석하지 않는 문자열이다.
- 동일 cursor를 다시 요청하면 가능한 한 같은 정렬 기준을 적용한다.
- 시간순 목록은 `startsAt`과 `id`를 함께 정렬 키로 사용한다.

### 4.6 오류 응답

```json
{
  "error": {
    "code": "MATCH_ALREADY_CLOSED",
    "message": "아쉽지만 방금 모집이 마감됐어요.",
    "fieldErrors": [],
    "requestId": "req_01..."
  }
}
```

`message`는 사용자에게 바로 보여줄 수 있는 한국어 기본 문구다. 클라이언트는 분기 처리를 `message`가 아니라 안정적인 `code`로 수행한다.

| HTTP | 용도 | 예시 코드 |
| ---: | --- | --- |
| 400 | JSON 형식·쿼리 형식 오류 | `INVALID_REQUEST` |
| 401 | 로그인 필요 | `UNAUTHENTICATED` |
| 403 | 권한 또는 온보딩 부족 | `FORBIDDEN`, `ONBOARDING_REQUIRED` |
| 404 | 없거나 노출할 수 없는 리소스 | `MATCH_NOT_FOUND` |
| 409 | 현재 상태와 충돌 | `MATCH_ALREADY_CLOSED`, `NO_REMAINING_SPOTS` |
| 422 | 필드 검증 실패 | `VALIDATION_FAILED` |
| 429 | 요청 제한 초과 | `RATE_LIMITED` |
| 500 | 예상하지 못한 서버 오류 | `INTERNAL_ERROR` |

필드 오류 예:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "입력한 내용을 다시 확인해 주세요.",
    "fieldErrors": [
      {
        "field": "endsAt",
        "code": "MUST_BE_AFTER_START",
        "message": "종료 시간은 시작 시간보다 늦어야 해요."
      }
    ],
    "requestId": "req_01..."
  }
}
```

### 4.7 상태 충돌 응답

상태가 바뀌어 요청을 처리할 수 없는 경우 `409 Conflict`와 함께 화면 갱신에 필요한 최소 최신 상태를 제공할 수 있다.

```json
{
  "error": {
    "code": "NO_REMAINING_SPOTS",
    "message": "방금 마지막 자리가 채워졌어요.",
    "requestId": "req_01...",
    "currentState": {
      "matchStatus": "CLOSED",
      "remainingSpots": 0,
      "version": 4
    }
  }
}
```

### 4.8 낙관적 잠금

상태를 바꾸는 요청은 대상 리소스의 `expectedVersion`을 받을 수 있다. 서버는 최신 상태를 트랜잭션 안에서 다시 검증하며, 버전이 다르면 `409 VERSION_CONFLICT`를 반환한다.

버전은 권한이나 상태 검증을 대체하지 않는다.

### 4.9 재시도와 중복 요청

- 신청 생성은 `(matchId, applicantUserId)` 유일 제약으로 중복을 방지한다.
- 수락·거절·철회·취소 요청은 같은 최종 상태에 대한 재요청이면 현재 리소스를 반환할 수 있다.
- 서로 다른 최종 상태로 이미 전환된 경우 `409 APPLICATION_STATE_CONFLICT`를 반환한다.
- 매칭 생성은 요청의 `clientRequestId`와 세션 User를 묶어 멱등성을 보장한다. 같은 키의 재요청은 새 Match를 만들지 않고 기존 Match를 반환한다.

### 4.10 요청 제한

- `/api/v1`의 인증된 요청은 계정별로 60초 동안 최대 120개까지 허용한다.
- 제한을 초과하면 `429 Too Many Requests`와 `RATE_LIMITED`를 반환한다. 응답의 `Retry-After` 헤더는 다음 요청 가능 시점까지의 초 단위 값이다.
- 이 제한은 로그인·권한 검증 뒤에 적용하며, 요청 본문이나 개인정보를 제한 키로 저장하지 않는다.

## 5. 공통 Enum

### 5.1 테니스 프로필

```text
ExperienceRange = UNDER_3_MONTHS | MONTHS_3_TO_6 | MONTHS_6_TO_12 | YEARS_1_TO_2 | YEARS_2_PLUS
RallyLevel = STARTING | SHORT_RALLY | COMFORTABLE_RALLY | STANDARD_RALLY
GameExperience = NONE | KNOWS_RULES | PLAYED_FEW | CAN_PLAY
PlayPurpose = CASUAL_HIT | RALLY_PRACTICE | STROKE_PRACTICE | GAME_INTRO | GAME
```

### 5.2 매칭

```text
CourtSource = EXTERNAL_RESERVED | COURT_TBD | PARTNER_COURT
PartnerPreference = COMPLETE_BEGINNER_WELCOME | SIMILAR_LEVEL | GAME_CAPABLE
MatchStatus = OPEN | CLOSED | COMPLETED | EXPIRED | CANCELLED
ApplicationStatus = PENDING | ACCEPTED | REJECTED | WITHDRAWN | CANCELLED
```

새 일반 매칭 생성 API는 `EXTERNAL_RESERVED`만 허용한다. `PARTNER_COURT`는 Court Partner Pilot에서만 `courtSlotId`와 함께 허용한다. `COURT_TBD` enum 값은 기존 Match 응답을 호환하기 위한 이력 값이며, 새 `POST /api/v1/matches` 요청에 보내면 `422 VALIDATION_FAILED`를 반환한다.

### 5.3 Court Partner Pilot 시간 공급

```text
CourtSlotVisibility = PRIVATE | PUBLIC
CourtSlotStatus = DRAFT | AVAILABLE | ALLOCATED | ENDED | BLOCKED | CANCELLED
CourtSupplyIncidentCode = SCHEDULE_UNAVAILABLE | FACILITY_CLOSED | SAFETY_RISK | NATURAL_DISASTER | INFORMATION_REVIEW
CourtSupplyIncidentImpact = NONE | CANCEL_MATCH
CourtSupplyIncidentStatus = REQUESTED | WITHDRAWN | REVIEWED | REJECTED
```

`visibility`는 시간대가 일반 회원에게 보이는지를, `status`는 세션 개설·상세 이동·읽기 전용 여부를 정한다. Pilot에서 새 Slot은 `DRAFT`·`PRIVATE`로 시작하고, 한 번 공개한 Slot은 상태가 바뀌어도 `PUBLIC`을 유지한다. `PUBLIC`은 예약 가능·운영자 승인 대기 상태가 아니다. 공개 Slot은 사용자 표시 필드를 수정·재공개할 수 없고, 오류는 `BLOCKED` 후 새 `DRAFT`로 정정한다. 세션 모집자의 시작 전 취소는 연결 Slot을 자동 재공개하지 않으며, 운영자가 실제 공급 가능 여부를 확인한 뒤 연결 Match가 `CANCELLED`인 `ALLOCATED` Slot만 `BLOCKED`로 중지할 수 있다.

## 6. 공통 응답 모델

### 6.1 RegionSummary

```json
{
  "code": "SEOUL-MAPO",
  "name": "마포구",
  "parent": {
    "code": "SEOUL",
    "name": "서울"
  }
}
```

### 6.2 TennisProfileView

```json
{
  "experienceRange": "MONTHS_6_TO_12",
  "experienceLabel": "6개월~1년",
  "rallyLevel": "COMFORTABLE_RALLY",
  "rallyLevelLabel": "편하게 랠리할 수 있어요",
  "gameExperience": "NONE",
  "gameExperienceLabel": "아직 안 해봤어요",
  "playPurposes": [
    {
      "code": "RALLY_PRACTICE",
      "label": "랠리 연습"
    }
  ],
  "activityRegion": {
    "code": "SEOUL-MAPO",
    "name": "마포구",
    "parentCode": "SEOUL"
  },
  "nearbyRegionAllowed": true,
  "version": 3,
  "updatedAt": "2026-08-12T08:20:00.000Z"
}
```

내부 정렬값과 추천 점수는 응답하지 않는다.

### 6.3 MatchCardView

```json
{
  "id": "0198...",
  "title": "천천히 랠리 연습해요",
  "status": "OPEN",
  "statusLabel": "모집 중",
  "startsAt": "2026-08-22T01:00:00.000Z",
  "endsAt": "2026-08-22T03:00:00.000Z",
  "region": {
    "code": "SEOUL-MAPO",
    "name": "마포구"
  },
  "court": {
    "source": "EXTERNAL_RESERVED",
    "sourceLabel": "모집자가 코트를 예약했어요",
    "name": "마포 테니스장",
    "image": {
      "url": null,
      "sourceLabel": null,
      "fallback": "TENNIS_COURT_ILLUSTRATION"
    }
  },
  "playPurposes": [
    {
      "code": "RALLY_PRACTICE",
      "label": "랠리 연습"
    }
  ],
  "partnerPreference": "COMPLETE_BEGINNER_WELCOME",
  "beginnerWelcome": true,
  "recruitCount": 2,
  "acceptedCount": 1,
  "remainingSpots": 1,
  "estimatedTotalParticipants": 3,
  "estimatedFeePerPersonKrw": 13334,
  "recommendationReasons": [
    {
      "code": "SAME_PLAY_PURPOSE",
      "label": "둘 다 랠리 연습을 원해요."
    }
  ]
}
```

예약 코트와 Partner Court Match의 예상 1인 비용은 `ceil(totalCourtFeeKrw / (recruitCount + 1))`로 계산하고 사용자가 수정할 수 없다. Partner Court Match의 전체 비용은 연결 CourtSlot에서만 읽는다. 과거 `COURT_TBD`의 `estimatedFeePerPersonKrw`는 계속 `null`이며, 기존 참여자의 이력·채팅·완료 처리를 위해 응답을 유지한다.

### 6.4 MatchDetailView

`MatchCardView`의 모든 필드에 다음 정보를 추가한다.

과거 `COURT_TBD` 응답에서는 `court.name`, `court.address`, `totalCourtFeeKrw`, `additionalCostNote`, `estimatedFeePerPersonKrw`가 모두 `null`이고 `court.sourceLabel`은 `코트와 비용을 함께 정해요`다. 이 표시는 기존 참여자의 이력·채팅·완료 처리에서만 사용하며, 공개 목록·신규 생성·신청 유도에는 사용하지 않는다.

모든 Match 응답의 `court.image`는 `url`, `sourceLabel`, `fallback`을 제공한다. 사진이 없으면 `url`과 `sourceLabel`은 `null`이며 클라이언트는 `TENNIS_COURT_ILLUSTRATION`을 표시한다. `url`은 비공개 객체 URL이 아니라 인증·권한을 확인하는 같은 출처의 사진 읽기 API다. 외부 예약 사진의 `sourceLabel`은 `모집자 제공 사진`, 제휴 코트 사진의 값은 `운영자 제공 사진`이다. 사진은 예약 검증이나 Rally On 보증을 뜻하지 않는다.

`PARTNER_COURT` 응답에서는 `court.sourceLabel`이 `Rally On에서 준비한 코트예요`이고, `court.participationNote`가 `참가 신청은 세션을 연 모집자에게 보내요.`다. Match 응답에는 `courtSlotId`와 운영자 내부 식별자를 응답하지 않으며 코트명·주소·시각·전체 비용은 연결 Slot에서 서버가 조합한다. 공개 Slot 목록 응답은 별도 `PublicCourtSlotView`만 사용한다.

```json
{
  "court": {
    "source": "EXTERNAL_RESERVED",
    "sourceLabel": "모집자가 코트를 예약했어요",
    "name": "마포 테니스장",
    "address": "서울 마포구 ...",
    "courtNumber": "2번 코트"
  },
  "totalCourtFeeKrw": 40000,
  "additionalCostNote": "조명비 포함",
  "introduction": "빠르지 않게 편하게 쳐요.",
  "partnerPreferenceLabel": "완전 초보도 좋아요",
  "host": {
    "nickname": "지선",
    "tennisProfile": {
      "experienceRange": "MONTHS_6_TO_12",
      "experienceLabel": "6개월~1년",
      "rallyLevel": "COMFORTABLE_RALLY",
      "rallyLevelLabel": "편하게 랠리할 수 있어요",
      "gameExperience": "NONE",
      "gameExperienceLabel": "아직 안 해봤어요",
      "playPurposes": [
        {
          "code": "RALLY_PRACTICE",
          "label": "랠리 연습"
        }
      ],
      "activityRegion": {
        "code": "SEOUL-MAPO",
        "name": "마포구",
        "parentCode": "SEOUL"
      },
      "nearbyRegionAllowed": true
    }
  },
  "viewer": {
    "relation": "NONE",
    "canApply": true,
    "applyBlockedReason": null,
    "applicationId": null,
    "canComplete": false
  },
  "contact": null,
  "version": 3,
  "createdAt": "2026-08-12T08:20:00.000Z"
}
```

`viewer.relation` 값:

```text
NONE | HOST | APPLICANT
```

`applyBlockedReason` 후보:

```text
ONBOARDING_REQUIRED | OWN_MATCH | ALREADY_APPLIED | MATCH_NOT_OPEN | MATCH_STARTED | NO_REMAINING_SPOTS
```

비로그인 사용자는 이 API를 호출할 수 없다. `contact`는 모집자 또는 연결 Application이 `ACCEPTED`인 신청자에게만 반환한다. 새 Match는 다음 형태다.

```json
{
  "type": "IN_APP_CHAT",
  "conversationStatus": "OPEN",
  "href": "/chats/0198...",
  "label": "채팅방 열기"
}
```

그 외 사용자에게는 `null`이며 존재 여부도 별도 필드로 노출하지 않는다. `viewer.canComplete`는 모집자이면서 `status = CLOSED`이고 `endsAt <= now`일 때만 true다.

### 6.5 MatchApplicationView

```json
{
  "id": "0198...",
  "status": "PENDING",
  "statusLabel": "검토 중",
  "message": "천천히 랠리하고 싶어요.",
  "applicant": {
    "nickname": "테니스새싹",
    "profileSnapshot": {
      "schemaVersion": 1,
      "profileVersion": 3,
      "experienceRange": "MONTHS_6_TO_12",
      "experienceLabel": "6개월~1년",
      "rallyLevel": "SHORT_RALLY",
      "rallyLevelLabel": "몇 번씩 주고받을 수 있어요",
      "gameExperience": "NONE",
      "gameExperienceLabel": "아직 안 해봤어요",
      "playPurposes": [
        {
          "code": "RALLY_PRACTICE",
          "label": "랠리 연습"
        }
      ],
      "activityRegion": {
        "code": "SEOUL-MAPO",
        "name": "마포구",
        "parentCode": "SEOUL"
      },
      "nearbyRegionAllowed": true
    }
  },
  "match": {
    "id": "0198...",
    "title": "천천히 랠리 연습해요",
    "status": "OPEN",
    "startsAt": "2026-08-22T01:00:00.000Z",
    "endsAt": "2026-08-22T03:00:00.000Z",
    "courtSource": "EXTERNAL_RESERVED",
    "courtName": "마포 테니스장",
    "regionName": "마포구",
    "estimatedFeePerPersonKrw": 13334
  },
  "createdAt": "2026-08-12T08:30:00.000Z",
  "decidedAt": null,
  "withdrawnAt": null,
  "cancelledAt": null
}
```

신청자 프로필은 현재 프로필이 아니라 신청 당시 스냅샷을 사용한다. 닉네임은 현재 User에서 읽으며 연락처는 포함하지 않는다.

본인 신청 응답에서는 `status = ACCEPTED`일 때만 `match.contact`을 포함한다. 방 진입 경로와 상태를 반환하며 PENDING·REJECTED·WITHDRAWN·CANCELLED에서는 `null`이다.

## 7. 현재 사용자 API

### 7.1 현재 사용자 조회

```http
GET /api/v1/me
```

인증: 필수

응답 `200 OK`:

```json
{
  "id": "0198...",
  "nickname": "지선",
  "nicknameConfirmed": true,
  "status": "ACTIVE",
  "onboardingCompleted": true,
  "tennisProfile": {
    "experienceRange": "MONTHS_6_TO_12",
    "experienceLabel": "6개월~1년",
    "rallyLevel": "COMFORTABLE_RALLY",
    "rallyLevelLabel": "편하게 랠리할 수 있어요",
    "gameExperience": "NONE",
    "gameExperienceLabel": "아직 안 해봤어요",
    "playPurposes": [],
    "activityRegion": null,
    "nearbyRegionAllowed": true,
    "version": 3,
    "updatedAt": "2026-08-12T08:20:00.000Z"
  }
}
```

온보딩 전에는 `tennisProfile`이 `null`이다.

`onboardingCompleted`는 닉네임 확인과 TennisProfile 저장이 모두 끝났을 때 true다.

### 7.2 닉네임 확인·수정

```http
PATCH /api/v1/me
```

인증: 필수

요청:

```json
{
  "nickname": "테니스새싹"
}
```

규칙:

- 앞뒤 공백 제거 후 2~12자, 한글·영문·숫자만 허용
- 정규화된 닉네임은 유일해야 한다.
- 최초 성공 시 `nicknameConfirmedAt`을 기록한다.
- 수정 성공 시 현재 User 응답을 반환한다.
- 중복이면 `409 NICKNAME_ALREADY_EXISTS`를 반환한다.

신규 카카오 로그인 사용자는 소셜 표시명을 기본값으로 보지만 이 API가 성공하기 전 테니스 프로필 온보딩을 시작할 수 없다.

## 8. 지역 API

### 8.1 지역 목록 조회

```http
GET /api/v1/regions?parentCode=SEOUL
```

인증: 필수

응답 `200 OK`:

```json
{
  "items": [
    {
      "code": "SEOUL-MAPO",
      "name": "마포구",
      "parent": {
        "code": "SEOUL",
        "name": "서울"
      }
    }
  ]
}
```

- `active = true`인 지역만 반환한다.
- `parentCode`를 생략하면 최상위 지역을 반환한다.
- `query`를 보내면 전국의 활성 시·군·구를 이름 기준으로 검색하며, 응답에 상위 시·도 표시명을 함께 반환한다.
- 지역 데이터는 자주 바뀌지 않으므로 짧은 서버 캐시를 적용할 수 있다.

## 9. 테니스 프로필 API

### 9.1 프로필 생성·온보딩 완료

```http
PUT /api/v1/me/tennis-profile
```

인증: 필수

요청:

```json
{
  "experienceRange": "MONTHS_6_TO_12",
  "rallyLevel": "COMFORTABLE_RALLY",
  "gameExperience": "NONE",
  "playPurposes": ["RALLY_PRACTICE", "CASUAL_HIT"],
  "activityRegionCode": "SEOUL-MAPO",
  "nearbyRegionAllowed": true,
  "expectedVersion": null
}
```

규칙:

- 닉네임 확인이 완료되어야 하며 아니면 `403 NICKNAME_CONFIRMATION_REQUIRED`다.
- 최초 생성은 `expectedVersion = null`이다.
- 수정은 현재 `expectedVersion`을 보낸다.
- `playPurposes`는 1~2개이며 중복될 수 없다.
- `activityRegionCode`는 활성화된 시·군·구 한 곳이어야 한다.
- `nearbyRegionAllowed`은 필수 boolean이다.
- `skillLabel`은 분류 규칙 확정 전 요청으로 받지 않는다.
- Profile, Region 연결, Purpose 연결과 `onboardingCompletedAt`을 한 트랜잭션으로 저장한다.

응답: `TennisProfileView`

주요 오류:

| 코드 | HTTP | 상황 |
| --- | ---: | --- |
| `INVALID_REGION` | 422 | 없거나 비활성 지역 |
| `TOO_MANY_PLAY_PURPOSES` | 422 | 플레이 목적 2개 초과 |
| `VERSION_CONFLICT` | 409 | 수정 중 프로필이 변경됨 |

`PUT`을 사용하지만 최초 생성과 수정은 동일한 자원 표현을 저장하므로 같은 경로를 사용한다.

## 10. 매칭 탐색 API

### 10.1 추천 매칭 조회

```http
GET /api/v1/matches/recommended?limit=5
```

인증 및 온보딩: 필수

응답: `MatchCardView` 목록

후보 조건:

- `status = OPEN`
- `startsAt > now`
- 남은 자리가 1개 이상
- 본인이 만든 매칭 제외
- 이미 신청한 매칭은 추천 기본 목록에서 제외하되, 별도 정책이 필요하면 변경

M3 초기 점수 기준:

| 조건 | 점수 예시 |
| --- | ---: |
| 랠리 수준 동일 | +40 |
| 랠리 수준 인접 | +25 |
| 플레이 목적 일치 | +30 |
| 활동 지역 동일 | +20 |
| 게임 경험 유사 | +10 |

동점은 `startsAt ASC`, `id ASC`로 정렬한다. API에는 점수를 노출하지 않는다.

추천 이유 code 후보:

```text
SAME_RALLY_LEVEL | NEAR_RALLY_LEVEL | SAME_PLAY_PURPOSE | SAME_REGION | SIMILAR_GAME_EXPERIENCE | BEGINNER_WELCOME
```

### 10.2 매칭 목록 조회

```http
GET /api/v1/matches?regionCode=SEOUL-MAPO&playPurpose=RALLY_PRACTICE&startsFrom=2026-08-12T00:00:00.000Z&cursor=...&limit=20
```

인증 및 온보딩: Core MVP 권장안은 필수

쿼리:

| 이름 | 필수 | 설명 |
| --- | ---: | --- |
| `regionCode` | X | 활성 지역 코드 |
| `playPurpose` | X | PlayPurpose 한 개 |
| `startsFrom` | X | 이 시각 이후 시작, 기본값 `now` |
| `cursor` | X | 다음 페이지 cursor |
| `limit` | X | 기본 20, 최대 50 |

Core 목록은 `OPEN`, 미래 일정, 남은 자리 있음만 반환하고 `startsAt ASC`, `id ASC`로 정렬한다.

### 10.3 매칭 상세 조회

```http
GET /api/v1/matches/{matchId}
```

인증 및 온보딩: Core MVP 권장안은 필수

응답: `MatchDetailView`

- 취소·완료·성사 없이 종료된 매칭도 권한이 있는 모집자와 신청자는 이력에서 상세를 볼 수 있다.
- 일반 목록에서 종료 상태를 노출할지는 별도 탐색 정책으로 정한다.
- `viewer`는 로그인 사용자와 현재 Application 상태를 기준으로 서버가 계산한다.
- 추천 이유가 없으면 빈 배열을 반환한다.

### 10.4 외부 예약 코트 사진 읽기

```http
GET /api/v1/matches/{matchId}/court-image
```

인증 및 온보딩: 필수

- 원본은 비공개 객체 저장소에서만 읽고, 이 경로가 권한 확인 뒤 스트림으로 반환한다.
- `OPEN` Match는 온보딩을 마친 이용자에게, 종료 상태는 모집자 또는 해당 Match 신청자에게만 반환한다.
- 사진이 없거나 권한이 없으면 객체 존재 여부를 드러내지 않고 `404 MATCH_NOT_FOUND`를 반환한다.
- `Content-Type`은 업로드 시 검증한 JPEG, PNG, WebP 중 하나이며 응답은 `Cache-Control: private`를 사용한다.

## 11. 매칭 등록·관리 API

### 11.0 외부 예약 코트 사진 업로드

```http
POST /api/v1/court-image-uploads
Content-Type: multipart/form-data
```

인증 및 온보딩: 필수

요청은 `file` 하나만 받는다. 서버는 JPEG, PNG, WebP만 허용하고 선언 MIME 타입과 파일 시그니처를 함께 검사하며, 4 MiB를 초과하거나 SVG·GIF·영상·문서는 거절한다. 원본은 Vercel Blob의 `private` 저장소에만 저장한다.

응답 `201 Created`:

```json
{
  "id": "0198d5a2-51f5-7be2-a044-6f68d37e61d1"
}
```

- 업로드한 모집자 본인만 이 `id`를 매칭 생성에 사용할 수 있다.
- 한 업로드는 한 Match에만 원자적으로 연결한다.
- 연결되지 않은 업로드는 24시간 뒤 정리한다. 업로드 경로·비공개 객체 URL·파일명은 응답하지 않는다.
- 사진 내용에 인물 얼굴·연락처·예약번호·예약 확인서가 보이지 않도록 업로드 전에 안내한다. 이 첫 단계는 실행 파일 형식을 허용하지 않는 파일 형식·크기·시그니처 검사이며, 별도 유료 악성코드 검사 서비스는 활성화하지 않는다.

### 11.1 외부 예약 코트 장소 검색

```http
GET /api/v1/court-place-search?q={query}
```

인증 및 온보딩: 필수

`q`는 공백 제거 후 2~80자다. 서버는 기본적으로 로그인에 쓰는 `AUTH_KAKAO_ID` REST API 키(필요하면 `KAKAO_REST_API_KEY`로 별도 지정)를 사용해 카카오맵 키워드 장소 검색을 호출하고, 최대 5개 결과만 반환한다. REST API 키와 카카오 원본 응답(전화번호·좌표·장소 URL 포함)은 브라우저에 반환하거나 저장하지 않는다.

응답 `200 OK`:

```json
{
  "items": [
    {
      "name": "마포 테니스장",
      "address": "서울특별시 마포구 ...",
      "roadAddress": "서울특별시 마포구 ..."
    }
  ]
}
```

- 검색 결과 선택은 매칭 생성 폼의 코트명·주소를 채우는 보조 수단일 뿐이며, 코트 예약·운영 여부를 검증하거나 저장하지 않는다. 사용자는 언제든 직접 수정할 수 있다.
- 검색 결과가 없으면 빈 `items`를 반환한다.
- 사용할 카카오 REST API 키가 설정되지 않았거나 카카오맵 조회가 실패하면 `503 COURT_PLACE_SEARCH_UNAVAILABLE`을 반환한다. 클라이언트는 직접 입력을 계속 제공한다.
- 사용자별 API rate limit과 300 ms 클라이언트 입력 지연을 적용하고, 응답에는 `Cache-Control: private, no-store`를 설정한다.

### 11.2 매칭 등록

```http
POST /api/v1/matches
```

인증 및 온보딩: 필수

요청:

```json
{
  "clientRequestId": "0198d5a2-51f5-7be2-a044-6f68d37e61d1",
  "title": "천천히 랠리 연습해요",
  "startsAt": "2026-08-22T01:00:00.000Z",
  "endsAt": "2026-08-22T03:00:00.000Z",
  "regionCode": "SEOUL-MAPO",
  "courtSource": "EXTERNAL_RESERVED",
  "externalCourt": {
    "name": "마포 테니스장",
    "address": "서울 마포구 ...",
    "courtNumber": "2번 코트",
    "imageUploadId": null
  },
  "recruitCount": 2,
  "playPurposes": ["RALLY_PRACTICE"],
  "partnerPreference": "COMPLETE_BEGINNER_WELCOME",
  "totalCourtFeeKrw": 40000,
  "additionalCostNote": "조명비 포함",
  "introduction": "빠르지 않게 편하게 쳐요."
}
```

서버 파생 값:

- `hostUserId`: 세션 User
- `status`: `OPEN`
- `beginnerWelcome`: `partnerPreference`로 계산
- `estimatedTotalParticipants`: `recruitCount + 1`
- `estimatedFeePerPersonKrw`: 전체 비용과 예상 총 참여 인원으로 나눈 뒤 1원 단위 올림
- `version`: 1

검증:

- 제목 1~80자
- `clientRequestId`는 UUID이며 모집자별 유일
- `startsAt < endsAt`이며 시작은 현재보다 미래
- 활성 `regionCode`
- `courtSource = EXTERNAL_RESERVED`이면 코트명 1~100자, 주소 1~255자, 비용 0 이상이 필수이고 코트 번호는 최대 50자다. 새 일반 매칭에는 이 출처가 필수다.
- `imageUploadId`는 모집자 본인의 `PENDING` 단일 업로드만 허용하며 Match 생성 트랜잭션 안에서 `ATTACHED`로 전환한다. 다른 사용자의 업로드, 이미 연결·정리 중·삭제된 업로드는 `409 COURT_IMAGE_UPLOAD_UNAVAILABLE`이다.
- `courtSource = COURT_TBD`는 신규 요청에 허용하지 않는다. 과거 `COURT_TBD` Match에는 새 신청을 만들 수 없고, 기존 참여자의 이력·채팅·완료 처리만 허용한다. 코트를 확보하지 못한 사용자는 공개 Partner Slot을 확인하는 `GET /api/v1/partner-session-slots` 흐름을 사용한다.
- 예약 코트의 코트 번호에 예약번호나 연락처를 넣지 않도록 클라이언트에서 안내하고 서버에서도 명백한 형식을 제한한다.
- `recruitCount >= 1`
- 플레이 목적 1~2개, 중복 불가
- 전체 코트 비용 0 이상
- 추가 비용 안내 최대 200자, 소개 최대 300자
- 모든 Match는 서비스 내 채팅을 사용하며 외부 오픈채팅 URL을 받거나 저장하지 않는다.

응답 `201 Created`: `MatchDetailView`

`Location: /api/v1/matches/{matchId}` 헤더를 제공한다.

같은 모집자가 동일한 `clientRequestId`로 재요청하면 요청 내용이 같을 때 기존 Match를 `200 OK`로 반환한다. 내용이 다르면 `409 IDEMPOTENCY_KEY_REUSED`를 반환한다.

### 11.3 내가 만든 매칭 목록

```http
GET /api/v1/me/hosted-matches?status=OPEN&cursor=...&limit=20
```

인증: 필수

`status`는 선택이며 여러 상태를 쉼표로 전달할 수 있다.

각 항목은 `MatchCardView`에 다음 필드를 추가한다.

```json
{
  "pendingApplicationCount": 2,
  "acceptedCount": 1
}
```

정렬 권장안:

1. 검토할 신청이 있는 미래 매칭
2. 그 외 미래 매칭
3. 지난 매칭

각 그룹 안에서는 가까운 일정 우선이다.

### 11.4 매칭 취소

```http
POST /api/v1/matches/{matchId}/cancel
```

인증: 모집자만

요청:

```json
{
  "expectedVersion": 3,
  "reason": null
}
```

Core MVP에서 취소 사유를 필수로 받지 않는다. 서버는 한 트랜잭션에서 다음을 수행한다.

1. 모집자 권한과 Match version을 확인한다.
2. 취소 가능한 상태인지 확인한다.
3. Match를 `CANCELLED`로 전환한다.
4. `PENDING`, `ACCEPTED` Application을 `CANCELLED`로 전환한다.
5. `cancelledAt`을 기록한다.

외부 코트 예약은 자동 취소되지 않으며 응답에도 이를 명시한다.

```json
{
  "id": "0198...",
  "status": "CANCELLED",
  "cancelledAt": "2026-08-13T02:00:00.000Z",
  "notice": "외부에서 예약한 코트는 별도로 취소해야 해요.",
  "version": 4
}
```

주요 오류:

- `403 MATCH_HOST_REQUIRED`
- `409 MATCH_STATE_CONFLICT`
- `409 VERSION_CONFLICT`

### 11.5 조기 모집 마감

```http
POST /api/v1/matches/{matchId}/close
```

인증: 모집자만

요청:

```json
{
  "expectedVersion": 3
}
```

규칙:

- Match가 `OPEN`이어야 한다.
- ACCEPTED 신청이 한 건 이상이어야 한다.
- Match를 `CLOSED`로 바꾸고 `closedAt`을 기록한다.
- 남은 PENDING 신청을 `CANCELLED`로 바꾸고 사용자에게 `모집이 마감됐어요`라고 표시한다.
- CLOSED Match를 다시 OPEN으로 바꾸는 API는 제공하지 않는다.

### 11.6 매칭 완료

```http
POST /api/v1/matches/{matchId}/complete
```

인증: 모집자만

요청:

```json
{
  "expectedVersion": 4
}
```

- Match가 `CLOSED`이고 `endsAt <= now`여야 한다.
- 성공 시 `COMPLETED`, `completedAt`과 증가한 version을 반환한다.
- OPEN·EXPIRED·CANCELLED 또는 일정 종료 전 요청은 `409 MATCH_NOT_COMPLETABLE`이다.

### 11.7 매칭 수정·모집 재개

공개 후 일정·코트 수정과 CLOSED Match의 모집 재개는 참가자에게 미치는 영향이 크므로 Core MVP에서 범용 `PATCH /matches/{id}` 또는 `/reopen` API를 만들지 않는다.

## 12. 신청 API

### 12.1 같이 치기 신청

```http
POST /api/v1/matches/{matchId}/applications
```

인증 및 온보딩: 필수

요청:

```json
{
  "message": "천천히 랠리하고 싶어요."
}
```

`message`는 선택이며 공백 제거 후 최대 200자다.

서버는 트랜잭션 안에서 다음을 검증한다.

1. Match가 존재하고 `OPEN`인지
2. `startsAt > now`인지
3. 신청자가 모집자가 아닌지
4. 동일 Match에 기존 Application이 없는지
5. ACCEPTED 수가 `recruitCount`보다 작은지
6. 신청자 TennisProfile이 완성되어 있는지
7. 신청 당시 profileSnapshot 생성이 가능한지

응답 `201 Created`: `MatchApplicationView`

주요 오류:

| 코드 | HTTP | 상황 |
| --- | ---: | --- |
| `ONBOARDING_REQUIRED` | 403 | 프로필 미완료 |
| `OWN_MATCH_APPLICATION_NOT_ALLOWED` | 409 | 본인 매칭 |
| `APPLICATION_ALREADY_EXISTS` | 409 | 철회·거절 포함 기존 신청 있음 |
| `MATCH_ALREADY_CLOSED` | 409 | 모집 마감 |
| `MATCH_ALREADY_ENDED` | 409 | 시작 시간이 지남 |
| `MATCH_CANCELLED` | 409 | 취소된 매칭 |
| `NO_REMAINING_SPOTS` | 409 | 남은 자리 없음 |

### 12.2 받은 신청 목록

```http
GET /api/v1/matches/{matchId}/applications?status=PENDING&cursor=...&limit=20
```

인증: 해당 Match 모집자만

응답: `MatchApplicationView` 목록

- 기본 정렬은 `createdAt ASC`, `id ASC`다.
- `status`를 생략하면 모든 신청을 반환한다.
- Match 요약과 `pendingApplicationCount`, `acceptedCount`, `remainingSpots`를 목록 메타데이터로 함께 반환할 수 있다.

```json
{
  "match": {
    "id": "0198...",
    "title": "과거 코트 미정 매칭 예시",
    "status": "OPEN",
    "court": {
      "source": "COURT_TBD",
      "sourceLabel": "코트와 비용을 함께 정해요",
      "name": null
    },
    "recruitCount": 2,
    "acceptedCount": 1,
    "remainingSpots": 1,
    "version": 3
  },
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNext": false
  }
}
```

다른 사용자의 신청 목록에는 `404 MATCH_NOT_FOUND`를 반환하여 리소스 존재 여부를 불필요하게 노출하지 않는다.

### 12.3 신청 수락

```http
POST /api/v1/applications/{applicationId}/accept
```

인증: 연결된 Match 모집자만

요청:

```json
{
  "expectedMatchVersion": 3
}
```

서버는 하나의 트랜잭션에서 Match를 잠그거나 version 조건으로 갱신한다.

1. 모집자 권한 확인
2. Match가 `OPEN`인지 확인
3. Application이 `PENDING`인지 확인
4. ACCEPTED 수 재계산
5. 자리가 있으면 Application을 `ACCEPTED`로 변경
6. 정원이 채워지면 Match를 `CLOSED`로 변경
7. Match가 CLOSED가 되면 남아 있는 PENDING 신청을 `CANCELLED`로 변경
8. `decidedAt`과 변경된 Match version 기록

응답:

```json
{
  "application": {
    "id": "0198...",
    "status": "ACCEPTED",
    "decidedAt": "2026-08-13T03:00:00.000Z"
  },
  "match": {
    "id": "0198...",
    "status": "CLOSED",
    "acceptedCount": 2,
    "remainingSpots": 0,
    "version": 4
  }
}
```

주요 오류:

- `403 MATCH_HOST_REQUIRED`
- `409 APPLICATION_STATE_CONFLICT`
- `409 MATCH_STATE_CONFLICT`
- `409 NO_REMAINING_SPOTS`
- `409 VERSION_CONFLICT`

동시에 마지막 자리를 수락하는 두 요청 중 하나만 성공해야 한다.

### 12.4 신청 거절

```http
POST /api/v1/applications/{applicationId}/reject
```

인증: 연결된 Match 모집자만

- `PENDING` 신청만 거절할 수 있다.
- 거절 전에도 시작 시각 기반 상태 보정을 수행한다. 이미 시작되어 `CLOSED` 또는 `EXPIRED`로 전환된 Match의 PENDING 신청은 `CANCELLED`로 유지하며 `REJECTED`로 바꾸지 않는다.
- Core MVP에서는 거절 사유를 요청받거나 신청자에게 노출하지 않는다.
- `REJECTED`와 `decidedAt`을 기록한다.
- `WHERE id = :applicationId AND status = 'PENDING'` 조건으로 원자적으로 전환한다.
- Match 정원에 영향을 주지 않으므로 Match version을 변경하지 않는다.

응답: 변경된 `MatchApplicationView`

### 12.5 보낸 신청 목록

```http
GET /api/v1/me/applications?status=PENDING,ACCEPTED&cursor=...&limit=20
```

인증: 필수

- `status`는 쉼표로 여러 값을 전달할 수 있다.
- 기본 정렬은 `createdAt DESC`, `id DESC`다.
- 취소된 Application은 연결 Match 상태를 함께 반환하여 모집자 취소와 성사 없이 종료를 구분한다.
- 응답은 신청자 본인의 `MatchApplicationView` 목록이다.

### 12.6 신청 철회

```http
POST /api/v1/applications/{applicationId}/withdraw
```

인증: 해당 Application 신청자만

요청 본문: 없음

- `PENDING`만 `WITHDRAWN`으로 전환할 수 있다.
- 수락된 신청의 취소에는 사용하지 않는다.
- 철회 후 재신청은 Core MVP에서 허용하지 않는다.
- 성공 시 `withdrawnAt`을 포함한 변경된 `MatchApplicationView`를 반환한다.

주요 오류:

- `403 APPLICATION_OWNER_REQUIRED`
- `409 APPLICATION_STATE_CONFLICT`

## 13. 권한 매트릭스

| API | 비로그인 | 온보딩 전 회원 | 온보딩 완료 회원 | 모집자·신청자 추가 조건 |
| --- | ---: | ---: | ---: | --- |
| `GET /me` | 불가 | 가능 | 가능 | 본인만 |
| `PATCH /me` | 불가 | 가능 | 가능 | 본인만 |
| `GET /regions` | 불가 | 가능 | 가능 | 없음 |
| `PUT /me/tennis-profile` | 불가 | 가능 | 가능 | 본인만 |
| `GET /matches/recommended` | 불가 | 불가 | 가능 | 본인 Match 제외 |
| `GET /matches` | 불가 | 불가 | 가능 | 본인 Match와 기존 신청 Match 제외 |
| `GET /matches/{id}` | 불가 | 권장안 불가 | 가능 | 종료 이력은 관련자 중심 |
| `POST /matches` | 불가 | 불가 | 가능 | 세션 User가 모집자 |
| `POST /matches/{id}/applications` | 불가 | 불가 | 가능 | 본인 Match 불가 |
| `GET /matches/{id}/applications` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자만 |
| `POST /applications/{id}/accept` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자만 |
| `POST /applications/{id}/reject` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자만 |
| `POST /applications/{id}/withdraw` | 불가 | 불가 | 일반 회원 불가 | 해당 신청자만 |
| `GET /me/applications` | 불가 | 가능 | 가능 | 본인 신청만 |
| `GET /me/hosted-matches` | 불가 | 가능 | 가능 | 본인 Match만 |
| `POST /matches/{id}/cancel` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자만 |
| `POST /matches/{id}/close` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자·수락자 1명 이상 |
| `POST /matches/{id}/complete` | 불가 | 불가 | 일반 회원 불가 | 해당 Match 모집자·일정 종료 후 |

비로그인 사용자는 서비스 소개와 카카오 로그인 경로만 접근한다.

## 14. 비즈니스 오류 코드

### 14.1 사용자·프로필

| 코드 | 의미 |
| --- | --- |
| `UNAUTHENTICATED` | 로그인 필요 |
| `ACCOUNT_NOT_ACTIVE` | 정지·탈퇴 계정 |
| `ONBOARDING_REQUIRED` | 프로필 완료 필요 |
| `NICKNAME_CONFIRMATION_REQUIRED` | 테니스 질문 전 닉네임 확인 필요 |
| `NICKNAME_ALREADY_EXISTS` | 닉네임 중복 |
| `INVALID_REGION` | 잘못되거나 비활성 지역 |
| `TOO_MANY_PLAY_PURPOSES` | 플레이 목적 최대 개수 초과 |
| `VERSION_CONFLICT` | 리소스가 다른 요청으로 변경됨 |
| `RATE_LIMITED` | 짧은 시간에 너무 많은 요청 발생 |

### 14.2 매칭

| 코드 | 의미 |
| --- | --- |
| `MATCH_NOT_FOUND` | 없거나 조회 권한 없는 매칭 |
| `MATCH_HOST_REQUIRED` | 모집자 권한 필요 |
| `MATCH_ALREADY_CLOSED` | 모집 마감 |
| `MATCH_ALREADY_ENDED` | 시작 시간이 지남 |
| `MATCH_CANCELLED` | 모집자 취소 |
| `MATCH_EXPIRED` | 수락자 없이 성사되지 않고 종료 |
| `MATCH_STATE_CONFLICT` | 현재 상태에서 행동 불가 |
| `MATCH_CLOSE_REQUIRES_ACCEPTED_APPLICATION` | 수락자 없이 조기 마감 시도 |
| `MATCH_NOT_COMPLETABLE` | 완료할 수 없는 상태 또는 시각 |
| `NO_REMAINING_SPOTS` | 남은 자리 없음 |
| `UNSUPPORTED_COURT_SOURCE` | Core에서 지원하지 않는 코트 출처 |
| `LEGACY_MATCH_NOT_JOINABLE` | 과거 코트 미정 Match에는 새로 신청할 수 없음 |
| `PARTNER_SLOT_NOT_AVAILABLE` | 공개되지 않았거나 세션에 연결할 수 없는 Slot |
| `PARTNER_SLOT_ALREADY_ALLOCATED` | 다른 Partner Court Match가 먼저 연결한 Slot |
| `PARTNER_SLOT_CAPACITY_EXCEEDED` | 모집자를 포함한 인원이 해당 코트 시간의 최대 인원을 초과 |
| `IDEMPOTENCY_KEY_REUSED` | 같은 clientRequestId를 다른 내용으로 재사용 |

### 14.3 신청

| 코드 | 의미 |
| --- | --- |
| `APPLICATION_NOT_FOUND` | 없거나 조회 권한 없는 신청 |
| `APPLICATION_ALREADY_EXISTS` | 기존 신청 존재 |
| `OWN_MATCH_APPLICATION_NOT_ALLOWED` | 본인 매칭 신청 |
| `APPLICATION_OWNER_REQUIRED` | 신청자 본인 권한 필요 |
| `APPLICATION_STATE_CONFLICT` | 현재 상태에서 전환 불가 |

### 14.4 Court Partner Pilot

| 코드 | 의미 |
| --- | --- |
| `BUSINESS_REGISTRATION_CERTIFICATE_REQUIRED` | 필수 사업자등록증 없음 |
| `OPERATOR_APPLICATION_EVIDENCE_UNAVAILABLE` | 타인 소유·삭제됨·이미 연결됨 등 사용할 수 없는 증빙 |
| `COURT_SLOT_NOT_FOUND` | 없거나 운영자 소유가 아닌 Slot |
| `COURT_SLOT_STATE_CONFLICT` | 현재 Slot 상태에서 행동 불가 |
| `COURT_SLOT_PUBLIC_IMMUTABLE` | 공개했거나 연결된 Slot은 직접 수정 불가 |
| `COURT_SLOT_OVERLAP` | 같은 CourtUnit의 활성 시간과 겹침 |
| `OPERATOR_PUBLISH_APPROVAL_REQUIRED` | 공개 승인 권한 필요 |
| `OPERATOR_SUPPLY_RESTRICTED` | 반복 철회 검토가 끝날 때까지 새 공개·세션 연결 불가 |
| `COURT_SUPPLY_INCIDENT_NOT_ALLOWED` | 연결 Slot이 아니거나 허용되지 않은 철회 사유 |

## 15. 서버 파생 값과 단일 진실 공급원

| 응답 값 | 계산 기준 | DB에 별도 저장 |
| --- | --- | ---: |
| `beginnerWelcome` | `partnerPreference = COMPLETE_BEGINNER_WELCOME` | 아니요 |
| `estimatedTotalParticipants` | `recruitCount + 1` | 아니요 |
| `estimatedFeePerPersonKrw` | `ceil(totalCourtFeeKrw / estimatedTotalParticipants)` | 아니요 |
| `acceptedCount` | `ACCEPTED` Application 수 | 아니요 |
| `remainingSpots` | `recruitCount - acceptedCount`, 최소 0 | 아니요 |
| `pendingApplicationCount` | `PENDING` Application 수 | 아니요 |
| `court.sourceLabel` | CourtSource 문구 매핑 | 아니요 |
| `statusLabel` | 상태별 사용자 문구 매핑 | 아니요 |
| `recommendationReasons` | 추천 규칙과 현재 사용자 프로필 | 아니요 |
| `viewer.canApply` | 인증·프로필·관계·상태·정원 | 아니요 |
| `viewer.canComplete` | 모집자·CLOSED·`endsAt <= now` | 아니요 |

파생 값은 서버 도메인 계층 한 곳에서 계산해 목록·상세·신청 API가 같은 규칙을 사용하게 한다.

## 16. 트랜잭션과 동시성

### 16.1 신청 생성과 수락

- 신청 생성 시 Match 상태, 시작 시각, 정원과 중복 신청을 같은 처리 흐름에서 검증한다.
- 신청 수락 시 Match row 잠금 또는 원자적 version 갱신을 사용한다.
- Application 상태 갱신과 Match 마감은 같은 트랜잭션에서 처리한다.
- DB 유일 제약과 트랜잭션 실패를 사용자용 `409` 코드로 변환한다.

### 16.2 취소와 자동 상태 전환

- Match 취소와 연결 Application 취소는 같은 트랜잭션에서 처리한다.
- `PARTNER_COURT` Match를 모집자가 취소해도 연결 `ALLOCATED` Slot은 자동으로 바꾸거나 다시 열지 않는다. 운영자만 취소된 연결을 확인한 뒤 별도 `POST /block`으로 `BLOCKED` 처리하고 새 `DRAFT`를 만들 수 있다.
- 시작 시각이 지난 `OPEN` Match는 수락자가 있으면 `CLOSED`, 없으면 `EXPIRED`로 전환한다.
- `EXPIRED` 전환 시 `PENDING` Application을 `CANCELLED`로 바꾼다.
- 정원 충족, 조기 마감 또는 수락자가 있는 Match의 시작 시각 도달 시 남은 `PENDING` Application을 `CANCELLED`로 바꾼다.
- 자동 전환 작업이 반복 실행되어도 결과가 달라지지 않아야 한다.
- 상태 전이는 일반 Match 조회·변경 요청의 트랜잭션 보정과 production 전용 내부 Cron endpoint(`/api/cron/reconcile-matches`)가 같은 도메인 함수를 호출한다. Cron은 `CRON_SECRET` Bearer 인증이 없으면 실행하지 않는다.

### 16.3 응답 일관성

- 쓰기 성공 응답은 트랜잭션 커밋 후 상태를 기준으로 만든다.
- `acceptedCount`와 `remainingSpots`는 상태 변경과 동일한 데이터 스냅샷에서 계산한다.
- 캐시된 목록이 오래되어도 쓰기 API는 DB 최신 상태로 다시 검증한다.

## 17. 검증 규칙 요약

| 필드 | 규칙 |
| --- | --- |
| `playPurposes` | 1~2개, 중복 불가 |
| `nickname` | 공백 제거 후 2~12자, 한글·영문·숫자, 정규화 후 유일 |
| `activityRegionCode` | 활성 시·군·구 한 곳 |
| `nearbyRegionAllowed` | 필수 boolean |
| `title` | 선택, 이전 클라이언트 호환용. 제공 시 공백 제거 후 1~80자, 생략 시 코트명에서 내부 생성 |
| `startsAt`, `endsAt` | 미래 시작, 시작 < 종료 |
| `regionCode` | 활성 Region |
| `externalCourt.name` | 1~100자 |
| `externalCourt.address` | 1~255자 |
| `externalCourt.courtNumber` | 최대 50자, 예약번호·연락처 금지 안내 |
| `recruitCount` | 1 이상의 정수 |
| `totalCourtFeeKrw` | 0 이상의 정수 |
| `additionalCostNote` | 최대 200자 |
| `introduction` | 최대 300자 |
| `clientRequestId` | UUID, 모집자별 유일 |
| Application `message` | 선택, 최대 200자 |

클라이언트와 서버가 같은 Schema 정의를 공유할 수 있더라도 서버 검증을 생략하지 않는다.

## 18. 캐시 정책

| API | 권장 정책 |
| --- | --- |
| `GET /regions` | 짧은 공개 캐시 또는 서버 캐시 가능 |
| 추천 목록 | 사용자별 응답이므로 공유 캐시 금지 |
| 일반 매칭 목록 | 로그인 사용자별 파생 값이 있으면 공유 캐시 금지 |
| 매칭 상세 | `viewer`, 추천 이유가 포함되므로 공유 캐시 금지 |
| 내 프로필·활동 | `private, no-store` |
| 모든 쓰기 API | 캐시 금지 |

닉네임·프로필 수정, 매칭 생성·신청·수락·거절·철회·조기 마감·완료·취소 후 관련 목록과 상세 데이터를 무효화한다.

## 19. 보안과 개인정보

- 사용자 입력 ID로 권한을 신뢰하지 않고 세션 User와 DB 관계를 확인한다.
- 다른 사용자의 이메일, 인증 공급자 ID와 전화번호를 API 응답에 포함하지 않는다.
- 메시지·신고 설명은 방 멤버 또는 내부 심사자에게 필요한 범위에서만 반환하고, 오류·로그·분석 이벤트에 넣지 않는다.
- 신청 프로필 스냅샷에는 인증정보와 연락처를 저장하거나 반환하지 않는다.
- 외부 코트 예약 번호와 예약 확인 이미지를 받지 않는다.
- 에러 로그에는 세션·토큰·개인정보와 신청 메시지 원문을 남기지 않는다.
- 사용자 입력 문자열은 길이를 제한하고 출력 시 안전하게 렌더링한다.
- 상태 변경 API에는 CSRF 방어가 적용된 인증 구성을 사용한다.
- 목록 API는 과도한 수집을 막기 위해 요청 제한과 최대 page size를 적용한다.

## 20. 분석 이벤트 경계

분석 이벤트는 API의 성공 여부와 분리한다. 클라이언트 이벤트가 API 상태를 변경하지 않으며, 서버는 핵심 성공 이벤트를 필요할 때만 기록한다.

| 사용자 행동 | 성공 판단 기준 |
| --- | --- |
| 온보딩 완료 | Profile 트랜잭션 커밋 |
| 매칭 등록 | Match 생성 커밋 |
| 같이 치기 신청 | Application 생성 커밋 |
| 신청 수락·거절 | Application 상태 전환 커밋 |
| 신청 철회 | `WITHDRAWN` 전환 커밋 |
| 조기 모집 마감 | Match CLOSED와 PENDING Application 취소 커밋 |
| 매칭 완료 | Match COMPLETED 전환 커밋 |
| 매칭 취소 | Match와 연결 Application 취소 커밋 |

이벤트 이름은 `03-screen-spec.md`를 기준으로 하며 API 요청 수를 사용자 행동 수로 직접 사용하지 않는다.

## 21. Core MVP API 목록

| Method | Path | 목적 | 인증 |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | 현재 사용자·온보딩 상태 | 회원 |
| PATCH | `/api/v1/me` | 닉네임 확인·수정 | 회원 |
| GET | `/api/v1/regions` | 활성 지역 조회 | 회원 |
| PUT | `/api/v1/me/tennis-profile` | 프로필 생성·수정 | 회원 |
| GET | `/api/v1/matches/recommended` | 추천 매칭 | 온보딩 완료 |
| GET | `/api/v1/matches` | 매칭 탐색 | 온보딩 완료 |
| GET | `/api/v1/matches/{matchId}` | 매칭 상세 | 온보딩 완료 |
| POST | `/api/v1/matches` | 외부 예약 코트 매칭 등록 | 온보딩 완료 |
| GET | `/api/v1/me/hosted-matches` | 내가 만든 매칭 | 회원 |
| POST | `/api/v1/matches/{matchId}/close` | 한 명 이상 수락 후 조기 마감 | 모집자 |
| POST | `/api/v1/matches/{matchId}/cancel` | 매칭 취소 | 모집자 |
| POST | `/api/v1/matches/{matchId}/complete` | 일정 종료 후 완료 확인 | 모집자 |
| POST | `/api/v1/matches/{matchId}/applications` | 같이 치기 신청 | 온보딩 완료 |
| GET | `/api/v1/matches/{matchId}/applications` | 받은 신청 | 모집자 |
| POST | `/api/v1/applications/{applicationId}/accept` | 신청 수락 | 모집자 |
| POST | `/api/v1/applications/{applicationId}/reject` | 신청 거절 | 모집자 |
| GET | `/api/v1/me/applications` | 보낸 신청 | 회원 |
| POST | `/api/v1/applications/{applicationId}/withdraw` | 신청 철회 | 신청자 |

## 22. Court Partner Pilot API 확장 방향

이 섹션은 Core MVP 구현 대상이 아니며 Court Partner Pilot 구현 시작 시 활성화한다.

### 22.0 운영자 자율 등록·검증 API — Pilot 첫 수직 단위

Pilot의 현재 수직 단위에서는 다음 계약을 활성화한다. 인증된 활성 회원이면 테니스 프로필 온보딩과 관계없이 신청할 수 있다. 코트·시간대·제휴 코트 세션과 내부 검토 API는 별도 권한으로 분리하며, 사업자등록증은 신청 제출 전에 비공개 업로드한다.

```text
POST /api/v1/operator-application-evidence-uploads
POST /api/v1/operator-applications
GET  /api/v1/operator-applications/me
PATCH /api/v1/operator-applications/{applicationId}
POST /api/v1/operator-applications/{applicationId}/retry-verification
```

#### `POST /api/v1/operator-application-evidence-uploads`

인증: 활성 계정. 일반 테니스 프로필 온보딩은 요구하지 않는다.

요청은 `multipart/form-data`의 `file` 하나만 허용한다. PDF·JPEG·PNG, 10 MiB 이하와 서버의 파일 서명을 모두 통과해야 하며, 다른 필드·파일 여러 개·클라이언트가 지정한 소유자 식별자는 거절한다. 객체는 비공개 저장소에 UUID 경로로 저장하고 응답에는 객체 URL·파일명 대신 불투명 업로드 ID만 반환한다.

```json
{ "id": "0198..." }
```

`PENDING` 업로드는 24시간 안에 신청에 연결되지 않으면 삭제한다. 업로드 ID는 같은 신청자가 제출 또는 수정 요청에 한 번만 사용할 수 있다.

#### `POST /api/v1/operator-applications`

신청자는 다음 정보를 제출한다. 원문 사업자 정보는 검증 어댑터 호출에만 사용하고 일반 DB·로그·응답에 포함하지 않는다.

```json
{
  "businessName": "마포 테니스파크",
  "businessRegistrationNumber": "1234567890",
  "businessOpenedOn": "2024-01-02",
  "representativeName": "홍길동",
  "venueName": "마포 테니스파크",
  "venueAddress": "서울특별시 마포구 월드컵로 00",
  "businessRegistrationCertificateUploadId": "0198..."
}
```

- 로그인한 활성 회원만 요청할 수 있다. 온보딩 완료는 요구하지 않는다.
- 사업자등록번호는 숫자 10자리, 개업일은 `YYYY-MM-DD`, 대표자명·사업자명·테니스장명·주소는 길이와 빈 값을 서버에서 검증한다.
- `businessRegistrationCertificateUploadId`는 현재 사용자 소유의 `PENDING` 업로드 한 건이어야 한다. 신청 생성 또는 수정 트랜잭션이 이를 `ATTACHED`로 원자적으로 연결하며, 누락·삭제됨·타인 소유·이미 사용된 증빙은 서버가 거절한다.
- 서버는 원문을 저장하지 않고, 비밀키 HMAC 중복 키와 검증 결과만 보관한다. `verificationInputRef`는 비공개 입력 저장소가 승인되기 전까지 비워 둔다. 입력 원문과 외부 공급자 응답 전문은 오류 응답·로그에 넣지 않는다.
- 기본 수동 제공자는 외부 확인을 호출하지 않고 `UNAVAILABLE`을 반환한다. 이 경우 `REVIEW_REQUIRED`와 `retryAvailable: true`를 반환한다. 실제 국세청·주소·장소 공급자 키를 설정하거나 호출하지 않는다.
- 신청자 본인의 진행 중인 신청이 있으면 `409 OPERATOR_APPLICATION_ALREADY_ACTIVE`다. `REJECTED` 또는 `CHANGES_REQUESTED` 신청은 새 입력으로 다시 제출한다.

응답 `201 Created`와 아래 조회 응답은 같은 `OperatorApplicationView`를 반환한다.

```json
{
  "id": "0198...",
  "status": "REVIEW_REQUIRED",
  "statusLabel": "추가 확인이 필요해요",
  "businessVerificationStatus": "UNAVAILABLE",
  "venueVerificationStatus": "UNAVAILABLE",
  "venue": { "name": "마포 테니스파크", "address": "서울특별시 마포구 월드컵로 00" },
  "canCreatePrivateDraft": false,
  "canPublish": false,
  "retryAvailable": true,
  "nextAction": "정보를 다시 확인하거나 추가 확인을 요청해 주세요.",
  "updatedAt": "2026-08-24T01:00:00.000Z"
}
```

#### `GET /api/v1/operator-applications/me`

신청자 본인의 가장 최근 신청을 반환한다. 신청 이력이 없으면 `404 OPERATOR_APPLICATION_NOT_FOUND`다. 반환 DTO에는 사업자등록번호, 개업일, 대표자명, 담당자 연락처, 증빙 객체 참조·파일명·원문을 포함하지 않는다. 신청 화면 재제출을 위해 같은 신청에 이미 연결된 증빙의 불투명 식별자와 `ATTACHED` 여부만 반환할 수 있다.

#### `PATCH /api/v1/operator-applications/{applicationId}`

신청자 본인만 `REVIEW_REQUIRED`, `CHANGES_REQUESTED`, `REJECTED` 상태의 신청을 새 입력으로 보완할 수 있다. 새 입력으로 자동 확인을 다시 시작하며 원문은 저장하지 않는다. 다른 상태면 `409 OPERATOR_APPLICATION_STATE_CONFLICT`다.

#### `POST /api/v1/operator-applications/{applicationId}/retry-verification`

신청자 본인만 `REVIEW_REQUIRED` 또는 `DRAFT_ACCESS_GRANTED` 상태에서 다시 확인을 요청할 수 있다. 검증 원문을 일반 DB에 보관하지 않으므로 첫 구현은 `409 OPERATOR_APPLICATION_RESUBMISSION_REQUIRED`로 새 입력 제출을 안내한다. 암호화된 비공개 입력 저장소와 공급자 설정이 승인되면 이 경로에서 제한된 자동 재시도를 활성화한다.

등록 요청은 사업자등록번호, 개업일, 대표자명, 사업장명, 테니스장명, 도로명주소와 필수 사업자등록증 업로드 식별자를 받는다. 실제 제공자를 연결할 때는 서버만 국세청 사업자등록정보 API와 주소·장소 API를 호출하며 외부 API 키나 원문 응답을 클라이언트에 반환하지 않는다. 운영 권한 보완 증빙은 조건부 별도 계약으로만 추가하며, 공개 URL을 요청·응답에 넣지 않는다.

응답은 `applicationStatus`, `businessVerificationStatus`, `venueVerificationStatus`, `canCreatePrivateDraft`, `canPublish`, 사용자 문구와 다음 행동만 제공한다. 사업자 확인 완료는 `canCreatePrivateDraft: true`만 부여할 수 있다. `VERIFIED` 사업자, `MATCHED` 장소·주소, 활성 동일 장소 운영자 부재를 모두 충족하거나 운영 검토가 승인하기 전에는 `canPublish: false`이며 코트·Slot 공개 API를 허용하지 않는다.

외부 API 장애와 신규 사업자 반영 지연은 `UNAVAILABLE`로 구분해 제한된 서버 재시도를 수행하고, 계속 실패하면 검토·수정 경로를 안내한다. 국세청 진위 불일치 또는 휴·폐업은 정정 후 새 신청 경로를 안내한다. 사업자번호·대표자명·주소 전문, 장소 검색 원문과 공급자 응답은 오류 응답과 로그에 포함하지 않는다. 이 엔드포인트에는 일반 등록 API보다 엄격한 로그인 사용자·동일 신청·입력 해시 단위 속도 제한을 적용한다.

운영 검토용 API는 일반 운영자 API와 분리하며 `User.role = INTERNAL_REVIEWER`인 활성 계정만 호출한다. 이 역할은 로그인한 일반 사용자가 API나 화면에서 자신에게 부여할 수 없고, Pilot의 초기 심사자는 서비스 외 보호된 DB 절차로만 지정한다. 심사자는 자신의 신청을 조회하거나 판정할 수 없다.

```text
GET  /api/internal/operator-applications?status=REVIEW_REQUIRED
GET  /api/internal/operator-applications/{applicationId}/business-registration-certificate
POST /api/internal/operator-applications/{applicationId}/review
```

`GET /api/internal/operator-applications`는 기본값 `status=REVIEW_REQUIRED`의 cursor 목록을 반환한다. `REVIEW_REQUIRED`, `PUBLISH_APPROVED`, `SUSPENDED`만 조회할 수 있다. 목록 항목에는 `id`, `status`, `businessName`, `venue.name`, `venue.address`, 사업자·장소 확인 상태, `submittedAt`, 안전한 Court 상태만 포함한다. 사업자등록번호·개업일·대표자명·운영자 연락처·증빙 참조·외부 제공자 응답은 반환하지 않는다.

`GET /api/internal/operator-applications/{applicationId}/business-registration-certificate`는 `INTERNAL_REVIEWER`만 호출한다. 연결된 `ATTACHED` 사업자등록증을 같은 출처에서 `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`로 중계한다. URL·파일명·객체 참조를 JSON으로 반환하지 않으며, 일반 회원·증빙 없는 신청에는 안전한 `404`를 반환한다.

`POST /api/internal/operator-applications/{applicationId}/review`는 다음 요청을 받는다.

```json
{ "decision": "APPROVE_PUBLISH", "reasonCode": "MANUAL_VERIFIED" }
```

`decision`은 `APPROVE_PUBLISH`, `REQUEST_CHANGES`, `REJECT` 중 하나이고, `reasonCode`는 `MANUAL_VERIFIED`, `INFORMATION_INCOMPLETE`, `BUSINESS_UNVERIFIED`, `VENUE_UNVERIFIED`, `OPERATING_AUTHORITY_UNCONFIRMED`, `DUPLICATE_VENUE` 중 하나다. 승인에는 `MANUAL_VERIFIED`만 허용한다. 서버는 현재 `ATTACHED` 사업자등록증, `REVIEW_REQUIRED` 상태와 심사자·신청자 분리를 확인하고, 승인 시 같은 정규화 장소의 다른 `PUBLISH_APPROVED` 신청이 없는지 같은 트랜잭션에서 확인한다. 성공 시 신청자용 `OperatorApplicationView`를 반환한다.

각 판정은 심사자 ID·결정·사유 코드·시각만 변경 불가 감사 이력으로 남긴다. 첫 Pilot은 자유 메모와 증빙 원문을 저장하지 않는다. 자신의 신청은 `403 INTERNAL_REVIEWER_SELF_REVIEW_FORBIDDEN`, 이미 판정된 신청은 `409 OPERATOR_APPLICATION_STATE_CONFLICT`, 다른 승인 신청과 장소가 겹치면 `409 VENUE_ALREADY_ACTIVE`다.

```text
POST /api/internal/operator-applications/{applicationId}/suspend
POST /api/internal/courts/{courtId}/deactivate
```

두 API는 `INTERNAL_REVIEWER`만 호출하며, 본문은 `BUSINESS_UNVERIFIED`, `VENUE_UNVERIFIED`, `OPERATING_AUTHORITY_UNCONFIRMED`, `SAFETY_REVIEW`, `VENUE_CLOSED` 중 하나인 `reasonCode`만 받는다. 첫 API는 현재 `PUBLISH_APPROVED` 신청만 `SUSPENDED`로 전환하고 감사 이력에 `SUSPEND_PUBLISH`와 선택형 안전 사유를 남긴다. 둘째 API는 현재 `ACTIVE` Court만 `INACTIVE`로 전환하고 Court 상태 이력에 심사자·전후 상태·선택형 안전 사유·시각을 남긴다. 두 조치 모두 새 Slot 공개·새 Partner Court Match 연결·대표 사진의 보호된 공개를 즉시 막고 `ATTACHED` 사진의 `expiresAt`을 30일 뒤로 설정한다. 기존 Match·MatchApplication·Slot 상태는 바꾸지 않는다. 실제 공급 불가는 기존 supply-incident API로만 취소한다. 자신이 신청한 운영자 또는 이미 중지·비활성화된 대상은 각각 `403 INTERNAL_REVIEWER_SELF_REVIEW_FORBIDDEN`, `409 OPERATOR_APPLICATION_STATE_CONFLICT` 또는 `409 COURT_STATE_CONFLICT`다.

### 22.1 일반 회원·세션 모집자 API

일반 참가자는 기존 Match 목록·상세·참가 신청 API를 사용한다. 제휴 코트 세션은 `courtSource=PARTNER_COURT` 필터로 조회한다. 공개 Slot에는 안전한 상태·코트·시간·비용·이용 안내만 반환하고, 운영자 내부 메모·연락처·사업자 정보·상태 변경 사유 원문은 반환하지 않는다.

```text
GET  /api/v1/matches?courtSource=PARTNER_COURT
GET  /api/v1/matches/{matchId}
POST /api/v1/matches/{matchId}/applications
GET  /api/v1/partner-session-slots
GET  /api/v1/partner-session-slots/{slotId}
GET  /api/v1/partner-session-slots/available
POST /api/v1/matches  (courtSource=PARTNER_COURT, courtSlotId)
```

`GET /partner-session-slots`는 인증된 일반 회원에게 `PUBLIC` Slot의 읽기 전용 상태를 반환한다. 상태별 행동은 `AVAILABLE`의 세션 개설, `ALLOCATED`의 연결 세션 상세 이동, 그 외 상태의 읽기 전용뿐이다. 이 API는 코트 예약 탐색 API가 아니며 운영자 연락처·예약 승인 CTA·결제 정보를 제공하지 않는다.

`GET /partner-session-slots/{slotId}`는 목록 카드에서 진입하는 상세용으로, 온보딩을 마친 일반 회원에게 해당 `PUBLIC` Slot 하나의 동일한 안전한 표시 필드를 반환한다. `PRIVATE` Slot 또는 형식이 잘못된 식별자는 존재 여부를 구분하지 않고 `404 PARTNER_SLOT_NOT_AVAILABLE` 또는 입력 오류로 처리한다. 상태별 행동·권한은 목록과 같으며, 운영자 연락처·내부 메모·예약 승인·결제 정보는 반환하지 않는다.

예시 `PublicCourtSlotView`:

```json
{
  "id": "0198...",
  "status": "ALLOCATED",
  "statusLabel": "세션 모집 중",
  "statusChangedAt": "2026-08-24T01:00:00.000Z",
  "startsAt": "2026-08-28T10:00:00.000Z",
  "endsAt": "2026-08-28T12:00:00.000Z",
  "court": {
    "name": "마포 테니스파크",
    "courtNumber": "2번 코트",
    "address": "서울특별시 마포구 ...",
    "image": {
      "url": null,
      "sourceLabel": null,
      "fallback": "TENNIS_COURT_ILLUSTRATION"
    }
  },
  "totalCourtFeeKrw": 40000,
  "maxParticipantCount": 4,
  "usageNote": "실내 전용 테니스화를 준비해 주세요.",
  "session": {
    "matchId": "0198...",
    "status": "OPEN",
    "statusLabel": "세션 모집 중"
  },
  "availableAction": "VIEW_SESSION"
}
```

`GET /partner-session-slots/available`은 온보딩 완료 일반 회원이 세션을 열 때만 사용한다. `visibility = PUBLIC`, `status = AVAILABLE`, 시작 전인 Slot의 코트·시간·비용·현장 최대 인원·이용 안내만 반환하며, 응답의 행동 문구는 `이 시간으로 세션 열기`다. 참가자에게 보이는 코트 예약 탐색 API가 아니다.

저장된 대표 사진이 있으면 `PublicCourtSlotView.court.image.url`은 `/api/v1/partner-courts/{courtId}/image`, `sourceLabel`은 `운영자 제공 사진`이다. 이 URL은 비공개 객체 URL이 아니라 인증·온보딩을 확인하는 같은 출처의 읽기 API이며, 사진이 없으면 두 값은 `null`이고 클라이언트는 `fallback = TENNIS_COURT_ILLUSTRATION`을 표시한다. 사진 없음과 사진 자체는 공급 상태, 예약 가능 여부 또는 Rally On의 예약 보증을 의미하지 않는다.

### 22.0.1 운영자 대표 코트 사진 API

```text
GET    /api/v1/operator/courts/{courtId}/images
POST   /api/v1/operator/courts/{courtId}/images             multipart/form-data: file
PUT    /api/v1/operator/courts/{courtId}/images             { imageIds, representativeImageId }
GET    /api/v1/operator/courts/{courtId}/images/{imageId}   protected stream
DELETE /api/v1/operator/courts/{courtId}/images/{imageId}
GET    /api/v1/partner-courts/{courtId}/image                protected representative stream
GET    /api/cron/cleanup-operator-court-images
```

운영자 관리 API는 `PUBLISH_APPROVED`이며 해당 Court를 소유한 사용자에게만 허용한다. `POST`는 JPEG·PNG·WebP 한 파일, 10 MiB 이하, 서버 시그니처 검사를 통과한 비공개 `PENDING` 업로드의 불투명 ID만 반환한다. `PUT`은 같은 소유자·Court의 `PENDING` 또는 `ATTACHED` 사진만 최대 3장 원자적으로 저장하며 대표는 저장 목록에 반드시 포함된다. 목록에서 제외하거나 `DELETE`한 사진은 즉시 `REPLACED`로 전환해 공개·운영자 목록에서 제거한다. 원본 객체 URL·저장 경로·파일명은 어떤 응답에도 포함하지 않는다.

`GET /partner-courts/{courtId}/image`는 온보딩을 마친 이용자에게 공개 Slot·Partner Court Match에 쓰이는 `ATTACHED` 대표 사진만 `Cache-Control: private`로 스트림한다. 운영자 전용 개별 사진 읽기도 소유권을 확인한 뒤 같은 방식으로 스트림한다. `PENDING`·`REPLACED`·삭제된 사진, 비승인 또는 `SUSPENDED` 운영자 Court, `INACTIVE` Court, 권한 없는 요청은 존재 여부를 구분하지 않는 오류로 처리한다. 정리 작업은 24시간 지난 `PENDING`, 즉시 삭제 대상 `REPLACED`, 비활성화·승인 중지에서 30일 보관 기한이 지난 `ATTACHED` 사진을 원자적으로 점유한 뒤 비공개 객체와 메타데이터를 삭제한다.

`POST /api/v1/matches`의 Pilot 확장은 다음을 받는다.

```json
{
  "courtSource": "PARTNER_COURT",
  "courtSlotId": "0198...",
  "clientRequestId": "0198...",
  "title": "편하게 랠리해요",
  "recruitCount": 3,
  "partnerPreference": "SIMILAR_LEVEL",
  "playPurposes": ["RALLY_PRACTICE"]
}
```

서버는 Slot row를 잠그고 `visibility = PUBLIC`, `AVAILABLE`, 시작 전인지와 활성 Match 부재를 확인한 뒤 Match 생성과 `ALLOCATED` 전환을 하나의 트랜잭션으로 처리한다. `recruitCount + 1`이 Slot의 현장 최대 인원을 넘으면 `409 PARTNER_SLOT_CAPACITY_EXCEEDED`다. 클라이언트가 코트명·주소·시각·전체 비용·현장 최대 인원을 보내거나 바꾸는 것을 허용하지 않는다. 상태 충돌은 `409 PARTNER_SLOT_ALREADY_ALLOCATED`이며, MatchApplication을 만들지 않는다.

실제 공급 불가로 취소된 Partner Court Match의 상세와 활동 응답은 영향 대상인 모집자·`PENDING`·`ACCEPTED` 신청자에게만 아래 안전한 안내를 포함한다. 외부 발송·운영자 연락처·원문 사유는 이 응답에 포함하지 않는다.

```json
{
  "supplyNotice": {
    "code": "COURT_SUPPLY_WITHDRAWN",
    "message": "코트 운영 사정으로 이 제휴 코트 세션이 취소됐어요.",
    "occurredAt": "2026-08-28T08:30:00.000Z",
    "delivery": "IN_APP"
  }
}
```

### 22.2 운영자 측 후보 API

```text
GET   /api/v1/operator/courts
POST  /api/v1/operator/courts
GET   /api/v1/operator/slots
POST  /api/v1/operator/courts/{courtId}/slots
PATCH /api/v1/operator/slots/{slotId}
POST  /api/v1/operator/slots/{slotId}/publish
POST  /api/v1/operator/slots/{slotId}/block
POST  /api/v1/operator/slots/{slotId}/supply-incidents
```

운영자 API는 자신의 Court·CourtSlot 공개 여부·공급 상태만 변경한다. `DRAFT_ACCESS_GRANTED`와 `PUBLISH_APPROVED` 신청자는 Court와 비공개 Slot 초안을 만들 수 있지만, 공개와 공개 Slot 중지는 `PUBLISH_APPROVED`만 할 수 있다. Slot 등록은 현장 최대 인원을 필수로 받으며 첫 등록 시 `courtUnitName`으로 실제 코트 면을 지정하거나 만든다. CourtUnit 별도 관리와 수정 API는 다음 단위로 남긴다. 공개한 Slot의 상태 변경은 안전한 상태 문구와 `statusChangedAt`을 일반 회원에게 반환하고, 내부 사유 원문은 반환하지 않는다. MatchApplication 수락·거절, 일반 사용자 예약 요청, 예약 승인 API를 제공하지 않는다.

`POST /api/v1/operator/courts`는 `DRAFT_ACCESS_GRANTED` 또는 `PUBLISH_APPROVED` 신청에 연결된 한 시설만 생성할 수 있다. 다른 지점·주소를 새로 등록하려는 요청은 기존 Court를 수정하거나 복제하지 않고 새 운영자 신청 흐름으로 보낸다.

현재 활성 계약의 요청 본문은 다음과 같다. Court의 이름·주소·정규화 장소 키는 승인 신청의 장소 정보를 서버가 복사하므로 클라이언트가 보낼 수 없다.

```json
POST /api/v1/operator/courts
{ "regionCode": "SEOUL-MAPO" }

POST /api/v1/operator/courts/{courtId}/slots
{
  "courtUnitName": "2번 코트",
  "startsAt": "2026-08-28T10:00:00.000Z",
  "endsAt": "2026-08-28T12:00:00.000Z",
  "priceKrw": 40000,
  "maxParticipantCount": 4,
  "usageNote": "실내 전용 테니스화를 준비해 주세요."
}
```

Slot 생성 결과는 항상 `visibility = PRIVATE`, `status = DRAFT`다. `GET /api/v1/operator/slots`는 본인 Slot의 날짜·상태 필터 목록과 연결 세션의 안전한 요약만 반환한다. `PATCH /api/v1/operator/slots/{slotId}`는 `DRAFT`의 전체 필드와 `expectedVersion`만 받고, `AVAILABLE` 이후에는 `409 COURT_SLOT_PUBLIC_IMMUTABLE`을 반환한다. `POST /publish`는 빈 본문으로 이를 `PUBLIC`·`AVAILABLE`로 원자 전환한다. `POST /block`은 아직 Match에 연결되지 않은 `AVAILABLE` Slot 또는 연결 Match가 모집자 취소로 `CANCELLED`인 `ALLOCATED` Slot만 `BLOCKED`로 전환한다. 후자의 전이는 운영자 본인의 명시적 확인이 필요하고 Match·Application·Incident·운영자 제한을 바꾸지 않는다. `BLOCKED`에는 재공개 엔드포인트를 제공하지 않는다.

`POST /api/v1/operator/slots/{slotId}/supply-incidents`는 `ALLOCATED` Slot에서만 운영상 문제를 접수한다.

```json
{ "code": "SCHEDULE_UNAVAILABLE", "expectedVersion": 4 }
```

`INFORMATION_REVIEW`는 검토 요청만 만들고 Slot·Match를 바꾸지 않는다. `SCHEDULE_UNAVAILABLE`, `FACILITY_CLOSED`, `SAFETY_RISK`, `NATURAL_DISASTER`는 확인 단계를 거친 실제 공급 불가로만 받으며, 서버는 Incident·`ALLOCATED → CANCELLED`·연결 `Match.CANCELLED`·모집자/PENDING/ACCEPTED 대상 인앱 안내를 하나의 트랜잭션으로 만든다. 이 API는 대체 시간 지정, 시간·가격 변경, 운영자 연락처 공개, 실시간 채팅을 제공하지 않는다. 운영자 귀책 철회가 정책 임계치에 도달하면 새 Slot 공개와 `AVAILABLE → ALLOCATED`는 `403 OPERATOR_SUPPLY_RESTRICTED`다. 상태 경쟁은 `409 COURT_SLOT_STATE_CONFLICT`, 시간 겹침은 `409 COURT_SLOT_OVERLAP`, 공개 권한 부재는 `403 OPERATOR_PUBLISH_APPROVAL_REQUIRED`다.

### 22.3 Pilot 전에 확정할 계약

- 운영자 인증과 직원 권한
- 내부 운영 검토자 권한, 심사 SLA와 이의·보완 처리 기준
- 사업자·증빙 원문 보관 기간과 삭제 절차, 재확인 알림 채널
- 검증 공급자별 장애·할당량 초과 시 재시도와 수동 검토 전환 기준
- 코트 면별 현장 최대 인원과 시간 전환·정리 버퍼의 등록 기준
- 운영자가 현장에서 확인할 세션 대표자 정보와 개인정보 최소 공개 범위
- 코트 정보와 운영자 연락처 공개 범위
- 인앱 안내 이외 푸시·문자·카카오 알림의 동의, 발송 계약, 실패 재시도와 긴급 운영 절차
- 운영자 사진의 신고·권리 침해 처리 절차

## 23. Court Commerce API 확장 방향

Court Commerce는 설계 완료·미구현 단계다. 일반 사용자의 `CourtBooking` 모델이나 운영자 참가 승인 API를 만들지 않으며, 상세 정책·데이터 모델·구현 게이트는 `07-court-commerce-design.md`를 따른다. 아래 경로는 PG 계약, 법무/세무, 취소·환불 정책과 sandbox 검증이 끝난 뒤에만 활성 계약이 된다.

| 메서드·경로 | 권한 | 계약 목적 |
| --- | --- | --- |
| `GET /api/v1/operator/commerce-account` | 본인 운영자 | PG 온보딩·Commerce 활성·30일 수수료 무료 기간 상태 조회 |
| `POST /api/v1/operator/commerce-account/onboarding-link` | `PUBLISH_APPROVED` 운영자 | PG의 온보딩 시작 URL 요청. 계좌·PG 키를 본문으로 받지 않음 |
| `GET /api/v1/operator/commerce-settlements` | 본인 운영자 | PG 지급 결과와 대사된 정산 요약 조회 |
| `PUT /api/v1/operator/slots/{slotId}/commerce-policy` | 해당 Draft Slot 운영자 | 코트 이용 총액·요금표 버전·24시간 취소 정책 스냅샷 설정. 공개 후에는 `409` |
| `POST /api/v1/partner-session-checkout-holds` | 온보딩 완료 일반 회원 | 유료 `AVAILABLE` Slot의 단일 15분 홀드와 **모집자 코트 이용 총액** 결제 주문 생성 |
| `GET /api/v1/partner-session-checkout-holds/{holdId}` | 해당 모집자 | 결제 확인 중·만료·Match 생성 결과 조회 |
| `DELETE /api/v1/partner-session-checkout-holds/{holdId}` | 해당 모집자 | PG 승인 전 홀드·미결제 주문 취소 |
| `POST /api/v1/commerce/payments/{paymentId}/checkout` | 해당 모집자 | 코트 이용 총액 결제의 제공자 결제 시작 정보 요청 |
| `GET /api/v1/matches/{matchId}/commerce-payment` | 해당 모집자 | 서버가 확인한 모집자 결제·환불 상태 조회 |
| `POST /api/v1/matches/{matchId}/minimum-participant-decision` | 해당 모집자 | 24시간 마감 전 최소 인원 미달 세션을 현재 인원으로 진행하거나 취소 |
| `POST /api/v1/matches/{matchId}/commerce-cancellations` | 해당 모집자 | 24시간 전 전액 취소 요청. 서버가 결제·마감 시각·권한을 검증 |
| `POST /api/v1/webhooks/{provider}/commerce` | PG 서명 | 승인·취소·환불·지급 결과의 멱등 처리 |

`POST /partner-session-checkout-holds`에는 모집자별 `clientRequestId`가 필수다. 단순 예약 요청이 아니며, 서버는 한 Slot의 유효 홀드를 하나만 만들고 PG 승인 결과가 확인될 때에만 `AVAILABLE → ALLOCATED`, Match와 모집자 결제기록을 하나의 트랜잭션으로 확정한다. 홀드 만료·취소·실패면 Match를 만들지 않는다.

참가자 결제 초대·참가자 비용 수납 API는 제공하지 않는다. 기존 `MatchApplication`은 모집자의 수락·거절만으로 `ACCEPTED`가 되며, 실제 수락 참가자는 기존 규칙에 따라 Match 채팅에 입장한다. 참가자 화면에는 코트 이용 총액, 예상 1인 부담 참고값, `현장에서 함께 정산해요`만 안전하게 반환한다.

웹훅은 제공자 서명, 이벤트 ID, 주문·결제 참조와 **모집자 코트 이용 총액**을 검증한다. 클라이언트 리다이렉트의 성공 값만으로 결제 상태를 변경하지 않으며, 제공자 이벤트와 결제·환불 참조는 DB에서 유일해야 한다. 사용자·운영자 응답에는 카드번호, 계좌번호, PG 원문 오류, 참가자 간 현장 정산 정보와 타인의 정산 정보를 반환하지 않는다.

## 23.1 서비스 내 Match Chat API 확장 방향

Match Chat MVP는 모든 Match의 유일한 연락 수단이다. 공개 출시는 보관·파기와 신고 운영 게이트를 통과한 뒤에만 진행한다. 기존 외부 연락 링크 열은 migration에서 제거하고, 진행 중이며 수락자가 있는 Match는 방·멤버십으로 전환한다. 범용 DM·사용자 검색·일반 파일 전송·WebSocket 경로를 만들지 않는다.

| 메서드·경로 | 권한 | 계약 목적 |
| --- | --- | --- |
| `GET /api/v1/matches/{matchId}/conversation` | 모집자 또는 `ACCEPTED` 참가자 | 방 상태·안전한 멤버 닉네임·내 미확인 수 조회 |
| `GET /api/v1/matches/{matchId}/conversation/messages?before=cursor` | 방 멤버 | `(createdAt, id)` 커서 기반 과거 메시지 30개와, 호출자 최신 일반 발신 메시지의 제한된 미확인 인원 수 조회 |
| `POST /api/v1/matches/{matchId}/conversation/image-uploads` | 발신 가능한 방 멤버 | JPEG·PNG·WebP 1장(5 MiB 이하)을 비공개 `PENDING` 객체로 업로드하고 불투명 ID 반환 |
| `DELETE /api/v1/matches/{matchId}/conversation/image-uploads/{imageUploadId}` | 해당 발신자 | 아직 연결되지 않은 비공개 업로드 즉시 삭제 요청 |
| `POST /api/v1/matches/{matchId}/conversation/messages` | 발신 가능한 방 멤버 | 1~500자 `body` 또는 최대 3개의 `imageUploadIds`(둘 중 하나 필수), `clientRequestId`로 메시지 생성 |
| `GET /api/v1/matches/{matchId}/conversation/messages/{messageId}/images/{imageUploadId}` | 방 멤버 | 연결된 가시 사진만 권한 확인 뒤 같은 출처에서 private 스트림으로 반환 |
| `POST /api/v1/matches/{matchId}/conversation/read` | 방 멤버 | 내 마지막 읽은 커서 갱신. 다른 멤버의 읽은 시각·누가 읽었는지는 반환하지 않음 |
| `POST /api/v1/matches/{matchId}/conversation/messages/{messageId}/reports` | 방 멤버 | 선택형 사유와 짧은 설명으로 메시지 신고 |
| `GET /api/v1/me/conversations?role=HOST\|PARTICIPANT` | 방 멤버 | 채팅 탭의 내가 만든/신청한 Match 방 목록, 내 미확인 수 조회 |
| `GET /api/internal/chat-reports` | `INTERNAL_REVIEWER` | 대기 신고 조회 |
| `POST /api/internal/chat-reports/{reportId}/actions` | `INTERNAL_REVIEWER` | 메시지 숨김·발신 중지·방 읽기 전용을 감사 이력과 함께 적용 |

권한 없는 요청에는 방 존재 여부를 노출하지 않고 `404 MATCH_CONVERSATION_NOT_FOUND`를 반환한다. 사진 업로드는 선언 MIME 타입·5 MiB·JPEG/PNG/WebP 바이너리 시그니처를 모두 검사하고, 원본 파일명·객체 URL·객체 참조를 반환하지 않는다. `PENDING` 업로드는 전송 실패에서 즉시 삭제를 시도하며 미연결 상태로 남아도 24시간 뒤 정리한다. 연결된 사진은 해당 메시지의 가시성·채팅 보관·파기 정책을 따르고, 메시지 숨김 뒤에는 반환하지 않는다. 주요 오류 코드는 `MATCH_CONVERSATION_NOT_OPEN`, `CHAT_MEMBER_REQUIRED`, `CHAT_SENDING_SUSPENDED`, `CHAT_MESSAGE_INVALID`, `CHAT_IMAGE_TYPE_NOT_ALLOWED`, `CHAT_IMAGE_SIZE_INVALID`, `CHAT_IMAGE_SIGNATURE_INVALID`, `CHAT_IMAGE_UPLOAD_INVALID`, `CHAT_MESSAGE_RATE_LIMITED`, `CHAT_MESSAGE_DUPLICATE`, `CHAT_REPORT_DUPLICATE`다. 메시지·신고 원문은 오류 응답, 분석, 로그에 넣지 않는다.

메시지 목록 응답의 `lastSentMessageRead`는 호출자가 보낸 최신 `USER` 메시지에 대해서만 `{ messageId, unreadOtherMemberCount }` 또는 `null`을 반환한다. `unreadOtherMemberCount`는 현재 방의 다른 멤버 중 읽음 커서가 해당 메시지 이후가 아닌 사람 수이며, 0이면 화면은 숫자를 숨긴다. 이 응답은 읽은 시각·누가 읽었는지·다른 메시지의 읽음 상태를 반환하지 않는다.

첫 전달 방식은 채팅 화면 전면 상태의 5초 폴링이다. 메시지 발신에는 낙관 표시와 서버 확인을 사용하며, `clientRequestId`로 재시도를 합친다. 이 폴링은 `lastSentMessageRead`의 미확인 인원 수도 갱신한다. WebSocket·Redis·새 프로덕션 의존성은 별도 승인 없이 추가하지 않는다.

새 Match 생성·상세·신청 응답은 `contact`로 `conversationStatus`와 안전한 방 진입 경로만 반환한다. 외부 URL과 연락 수단 union은 제공하지 않으며, 첫 수락 전에는 `conversationStatus = NOT_CREATED`만 보이고 실제 방 경로·멤버는 반환하지 않는다.

## 24. API 테스트 시나리오

### 24.1 인증과 권한

1. 비로그인 사용자의 인증 필요 API 호출
2. 온보딩 미완료 사용자의 추천·등록·신청
3. 다른 사용자의 신청 목록 조회
4. 신청자가 수락 API 호출
5. 모집자가 아닌 사용자가 매칭 취소

### 24.2 입력 검증

1. 존재하지 않거나 비활성 지역
2. 플레이 목적 0개·3개·중복 값
3. 주 활동 지역 없음·두 개
4. 과거 시작 시각과 종료가 빠른 일정
5. 0명 모집과 음수 비용
6. 너무 긴 제목·코트명·신청 메시지
7. Pilot 비활성 Core API에 `PARTNER_COURT` 전송
8. 잘못된 clientRequestId와 다른 payload로 키 재사용
9. HTTPS가 아니거나 `open.kakao.com`이 아닌 연락 링크

### 24.3 상태와 동시성

1. 같은 사용자의 신청 두 요청 동시 전송
2. 마지막 자리에 대한 두 수락 요청 동시 전송
3. 신청 생성과 모집 마감이 동시에 발생
4. 수락과 신청 철회가 동시에 발생
5. Match 취소와 신청 수락이 동시에 발생
6. 이미 취소·마감·완료·성사 없이 종료된 Match 신청
7. 오래된 `expectedVersion`으로 상태 변경
8. 자동 상태 전환 작업의 중복 실행
9. 수락자 없이 조기 마감 요청
10. 일정 종료 전 완료 요청과 종료 후 중복 완료 요청

### 24.4 Court Partner Pilot

1. `PUBLISH_APPROVED`가 아닌 운영자의 Court·Slot 공개 시도
2. 온보딩 미완료 사용자의 제휴 코트 세션 Slot 조회·개설 시도
3. 같은 `AVAILABLE` Slot으로 동시에 두 Partner Court Match 생성 요청
4. `AVAILABLE`·`ALLOCATED` Slot의 시간·가격·코트·정원·이용 안내 수정과 `BLOCKED` 재공개 시도
5. 운영자가 MatchApplication 수락·거절 API를 호출하는 경우
6. 참가자가 CourtSlot 상태 변경 API를 호출하는 경우
7. `PARTNER_COURT` Match에 클라이언트가 코트명·주소·시간·비용을 함께 보내는 경우
8. 이미 배정된 Slot의 재시도와 `clientRequestId` 멱등 응답
9. `INFORMATION_REVIEW` 접수가 Slot·Match 상태를 바꾸지 않는 경우
10. 실제 공급 불가 접수가 Incident·Slot 취소·Match 취소·대상 인앱 안내를 하나의 트랜잭션으로 만드는 경우
11. 최근 30일 2회 또는 시작 24시간 이내 1회 운영자 귀책 철회 후 새 공개·세션 연결을 거절하는 경우
12. 세션 모집자 취소 뒤 `ALLOCATED` Slot 자동 재공개를 거절하고, 운영자만 취소된 Match 연결을 확인한 뒤 `BLOCKED`로 중지하는 경우

### 24.5 Court Commerce

1. `ACTIVE` Commerce 계정이 아닌 운영자의 유료 Slot 공개와 Commerce 정책 설정
2. 같은 유료 Slot에 대한 동시 홀드·서로 다른 `clientRequestId` 요청·홀드 만료 뒤 재요청
3. 결제 실패·사용자 취소·홀드 만료 뒤 Match와 `ALLOCATED` Slot이 생기지 않는 경우
4. 승인 웹훅 재전송·늦은 승인·중복 리다이렉트가 Payment·Match·환불을 중복 만들지 않는 경우
5. 유료 Match에 모집자 외 결제 행·참가자 결제 초대·참가자 비용 수납 API가 생기지 않는 경우
6. 시작 24시간 전의 정확한 마감 시각까지 모집자 전액 취소를 허용하고, 이후 자동 환불 요청을 거절하는 경우
7. 최소 인원 미달에서 모집자의 진행·취소 결정과 무응답 자동 취소가 Match·결제·환불을 한 번만 전환하는 경우
8. 운영자 공급 철회가 모집자 결제 한 건에 전액 환불을 만들고, 참가자에게 안전한 인앱 안내를 남기는 경우
9. 운영자별 첫 성공 유료 모집자 승인부터 30일 미만은 플랫폼 수수료 0%, 이후는 5%이며 PG 수수료는 모두 운영자 부담으로 기록되는 경우
10. 다른 운영자·모집자·참가자가 Commerce 계정, 결제, 정산, webhook 결과를 조회·변경하려는 경우
11. PG 서명이 없거나 결제 참조·금액이 다른 webhook을 거절하는 경우

### 24.6 서비스 내 Match Chat

1. 첫 `ACCEPTED` 전환과 MatchConversation·모집자/참가자 멤버 생성이 하나의 트랜잭션으로 끝나는 경우
2. PENDING·거절·철회·취소 신청자, 운영자, 제3자의 방·메시지·멤버 조회와 발신 시도
3. 동시에 수락된 참가자와 방 멤버가 중복 생성되지 않는 경우
4. 같은 `clientRequestId` 재전송, 동시 메시지, 커서 페이지 경계의 중복·누락 여부
5. `READ_ONLY`, 발신 중지, 빈 메시지·501자 메시지·속도 제한의 서버 거절
6. Match 취소·공급 철회·`endsAt + 24시간`이 시스템 안내와 읽기 전용 전환을 한 작업으로 처리하는 경우
7. 신고자가 방 멤버가 아닌 경우, 같은 메시지의 중복 신고, 일반 사용자의 내부 조치 API 호출
8. 메시지·신고 원문이 API 오류, 일반 응답, 로그·분석 이벤트에 없는지 확인

### 24.7 응답과 개인정보

1. 목록·상세의 예상 비용 계산 일치
2. 목록·상세·수락 응답의 남은 자리 계산 일치
3. 프로필 수정 후 받은 신청에서 신청 당시 스냅샷 유지
4. Application 응답에 이메일·연락처·인증 ID가 없는지 확인
5. 직접 예약 코트가 제휴 코트 세션 문구로 표시되지 않는지 확인
6. Partner Court Match가 `Rally On에서 준비한 코트예요`와 모집자 참가 신청 안내를 반환하는지 확인
7. PENDING·REJECTED 사용자가 채팅방을 받지 않는지 확인
8. 모집자와 ACCEPTED 신청자만 채팅방을 받는지 확인
9. 공급 철회 인앱 안내가 모집자·PENDING·ACCEPTED에게만 반환되고 운영자 원문 사유·연락처가 없는지 확인

## 25. 확정 정책과 남은 확장 계약

Core MVP는 카카오 로그인, 닉네임 확인, 로그인 후 탐색, 조기 마감, 모집자 완료 확인, clientRequestId 멱등성과 1원 단위 비용 올림을 활성 계약으로 사용한다. Match Chat MVP는 모든 Match에 적용하며, 외부 오픈채팅 링크 계약은 제공하지 않는다.

| 후속 항목 | Core 처리 | 확장 시 API 영향 |
| --- | --- | --- |
| 공개 후 일정·코트 수정 | 지원하지 않음 | Match PATCH, 변경 이력과 수락자 동의 필요 |
| CLOSED 모집 재개 | 지원하지 않음 | `/reopen`과 대기 신청 복구 정책 필요 |
| 수락 후 참가 취소 | 운영 문의 | 별도 Application 상태·이력·취소 API 필요 |
| 철회·거절 후 재신청 | 지원하지 않음 | 유일 제약·재신청 API 정책 변경 |
| 신고·차단 | 비공개 MVP 운영 문의 | 공개 출시 전 신고 API와 권한 모델 검토 |
| 서비스 내 Match Chat | 새 `IN_APP_CHAT` Match에 소스 구현, 기존 카카오 링크 호환 및 공개 출시 게이트 유지 | `08-in-app-match-chat-design.md`의 Conversation·Message·Report·Moderation API와 보관 정책 |
| 플레이 상태 이름 | 응답하지 않음 | 분류 규칙 확정 후 DTO 확장 |

## 26. 다음 단계

`06-development-plan.md`에서는 다음 내용을 확정한다.

- 기술 조합과 프로젝트 초기화 범위
- DB migration과 seed 순서
- API·화면 구현 순서
- 핵심 도메인 서비스와 검증 경계
- 자동 상태 전환 방식
- 테스트 전략과 완료 기준
- 각 개발 단계의 시연 가능한 결과물

프로젝트가 초기화되고 실제 실행 명령과 환경 변수가 확정된 후에 `README.md`를 작성한다.

## 2026-09-07 매칭 개설 계약 변경

`POST /api/v1/matches`: `title`은 이전 클라이언트 호환용 선택 값이다. 생략하면 서버에서 코트명 앞 80자로 내부 title을 생성한다. `gameType`은 MIXED_DOUBLES/MENS_DOUBLES/WOMENS_DOUBLES/SINGLES/RALLY/OTHER 중 하나이며 이전 클라이언트 호환을 위해 생략·null을 허용한다. `settlementAccount`는 생략·null 또는 `{bank, accountNumber, accountHolder}` 객체다. bank와 accountHolder는 공백 제거 후 1~50자, accountNumber는 공백 제거 후 숫자·하이픈 5~40자이고 숫자를 포함해야 한다. 일부만 입력하면 422로 거절한다. 재시도의 동일성 비교에 게임 유형과 계좌 세 항목을 포함한다.

목록과 상세의 `gameType` 응답은 `{code, label}` 또는 null이다. 정산 계좌는 목록에 포함하지 않는다. 상세 `settlementAccount`는 모집자 또는 해당 Match의 ACCEPTED 신청자에게만 객체로 반환하고 그 외에는 null이다. 인증·온보딩·기존 상세 접근 권한은 유지한다. 결제·정산 관련 후속 단계의 계좌 미반환 규칙은 PG/운영자 계좌에 적용되며, 이 명시적인 참가자 간 계좌 안내는 별도 계약이다.

### 2026-09-08 게임 유형 정리

새 개설·게임 유형 필터는 MIXED_DOUBLES(혼복), MENS_DOUBLES(남복), WOMENS_DOUBLES(여복), OTHER(기타)만 허용한다. 기존 SINGLES·RALLY·미지정 기록은 변경하지 않고 전체 목록·상세에서 기존 표시를 유지한다. 기타 필터는 OTHER만 조회하며 이전 유형을 임의로 기타로 합치지 않는다. GET /api/v1/matches의 gameType 쿼리로 실제 Match.gameType을 필터링하고 잘못된 유형은 400, 새 생성의 폐기된 유형은 422로 거절한다. 기존 playPurpose API 필터와 추천은 활동 목적 기준으로 유지하되 홈의 게임 유형 UI와 구분한다. 원하는 플레이의 랠리 연습은 별개 개념으로 유지한다.

### GET /api/v1/matches/{matchId}/directions

로그인·온보딩·요청 빈도 제한과 기존 Match 상세 조회 권한을 동일하게 적용한다. 요청자가 임의 주소를 전달하지 않으며 저장된 코트명·주소로만 조회한다. 서버 전용 카카오 REST API 키로 `search/address.json`에 정확 검색을 요청하고 좌표를 카카오맵 `link/to/{name},{latitude},{longitude}`로 반환한다.

- 성공: `{ "href": "https://map.kakao.com/link/to/..." }`, `Cache-Control: private, no-store`.
- 위치 미정·결과 없음·여러 결과·행정구역만 조회: 422 `DIRECTIONS_NOT_FOUND`.
- 키 없음·API 오류·시간 초과·잘못된 응답: 503 `DIRECTIONS_UNAVAILABLE`.
- 키와 외부 API 응답 본문은 클라이언트와 로그에 노출하지 않는다. 지도/좌표를 DB에 추가 저장하지 않는다.
- 공식 계약: https://developers.kakao.com/docs/ko/local/dev-guide#address-coord 및 https://apis.map.kakao.com/web/guide/#routeurl

# RallyOn — 데이터 상태값 명세

> MVP의 모임·참여·출석·후기 상태를 서버와 클라이언트가 일관되게 처리하기 위한 도메인 규칙. 마지막 갱신: 2026-07-14

## 1. 목적과 적용 범위

이 문서는 [프로젝트 브리프](../PROJECT_BRIEF.md)의 MVP 사용자 흐름을 구현하기 위한 엔터티, 상태값, 전환 규칙, 권한, 검증을 정의한다.

UI의 색상·컴포넌트·카피 규칙은 [디자인 시스템 명세](design-system.md)를 따른다.

## 2. 공통 규칙

- 시간은 UTC ISO-8601으로 저장하고 화면에서는 `Asia/Seoul` 기준으로 표시한다.
- 모든 엔터티에는 `id`, `createdAt`, `updatedAt`을 둔다.
- 상태 변경 요청은 서버가 현재 상태와 권한을 다시 검증한다.
- 상태 전환은 원자적으로 처리한다. 마지막 정원을 동시에 승인하는 경우 한 명만 승인된다.
- 취소·승인·출석·후기는 이전 값·새 값·실행자·시각을 감사 로그에 기록한다.
- 민감한 연락처와 정밀 위치는 참가 승인 전 응답에 포함하지 않는다.

## 3. 데이터 모델

### 3.1 사용자 `User`

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `phoneVerifiedAt` | datetime nullable | 모임 생성·신청 전 필수 |
| `preferredAreas` | `AreaId[]` | 1~3개 |
| `playLevel` | `PlayLevel` | 온보딩 필수 |
| `todayPurpose` | `Purpose` | 온보딩 필수, 탐색 기본값 |
| `formatPreference` | `PlayFormat` | 온보딩 필수 |
| `genderPreference` | enum nullable | 필요할 때만 사용 |
| `trustSummary` | computed | 후기·출석 기반 요약; 순위로 노출하지 않음 |

```ts
type PlayLevel = 'ball_not_over' | 'rally_3' | 'rally_5_plus' | 'game_intro';
type Purpose = 'rally' | 'serve' | 'game_intro' | 'beginner_game' | 'doubles_intro';
type PlayFormat = 'singles' | 'doubles' | 'any';
```

### 3.2 코트 `Court`

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `name` | string | 사용자에게 표시할 코트명 |
| `areaId` | `AreaId` | 정확한 거주지와 분리 |
| `environment` | `indoor \| outdoor` | 모임 카드에 표시 |
| `meetingPoint` | string nullable | 승인 후 참여자에게만 공개 |
| `reservationReference` | string nullable | MVP에서는 호스트 입력값, 외부 예약 연동 없음 |

### 3.3 모임 `Meeting`

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `hostId` | `UserId` | 생성자이며 호스트 |
| `templateId` | `MeetingTemplateId` | 표준 템플릿 우선 |
| `purpose` | `Purpose` | 필수 |
| `requiredLevelMin/Max` | `PlayLevel` | 기본 범위는 호스트 레벨의 ±1단계 |
| `format` | `singles \| doubles` | `any`는 생성 시 허용하지 않음 |
| `startsAt`, `endsAt` | datetime | 종료가 시작보다 뒤여야 함 |
| `areaId` | `AreaId` | 필수 |
| `courtStatus` | `CourtStatus` | 필수 |
| `courtId` | `CourtId` nullable | `secured`일 때 필수 |
| `capacity` | integer | 2 또는 4, 호스트 포함 |
| `estimatedCost` | money nullable | `secured`일 때 필수 |
| `settlementMethod` | enum nullable | `secured`일 때 필수 |
| `weatherPolicy` | string | `outdoor`일 때 필수 |
| `plan` | string | 템플릿 기본값을 제공하고 수정 가능 |
| `status` | `MeetingStatus` | 상태 전환 규칙 적용 |
| `reconfirmationDeadlineAt` | datetime nullable | `reconfirming` 진입 전 필수 |

```ts
type CourtStatus = 'needed' | 'secured';
type MeetingStatus =
  | 'draft'
  | 'waiting_for_court'
  | 'recruiting'
  | 'full'
  | 'reconfirming'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
```

### 3.4 참여 `Participation`

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `meetingId`, `userId` | ID | 같은 사용자·모임 조합은 하나만 허용 |
| `status` | `ParticipationStatus` | 아래 상태 전환을 따름 |
| `appliedAt` | datetime | 신청 시 기록 |
| `decidedAt` | datetime nullable | 승인·거절 시 기록 |
| `cancelledAt` | datetime nullable | 참여 취소 시 기록 |
| `reconfirmedAt` | datetime nullable | 참석 재확인 시 기록 |
| `attendance` | `AttendanceStatus` | 모임 종료 후 확정 |

```ts
type ParticipationStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
type AttendanceStatus = 'unknown' | 'attended' | 'no_show' | 'excused';
```

### 3.5 운영 데이터

| 엔터티 | 핵심 필드 | 규칙 |
| --- | --- | --- |
| `MeetingMessage` | `meetingId`, `authorId`, `body`, `pinnedAt` | 승인된 참여자와 호스트만 읽고 쓴다. 고정 공지는 호스트만 설정한다. |
| `Review` | `fromUserId`, `toUserId`, `punctuality`, `levelMatch`, `consideration`, `rematchIntent` | 출석한 참여자끼리 1회만 작성한다. 자유 텍스트는 MVP에서 제외한다. |
| `Report` | `reporterId`, `targetUserId`, `meetingId`, `reason`, `detail` | 검토 전 공개하지 않는다. |
| `Block` | `blockerId`, `blockedUserId` | 차단 즉시 상호 탐색·신청·채팅을 제한한다. |

## 4. 상태 전환 규칙

### 4.1 모임 상태

| 현재 | 조건 | 다음 | 실행 주체 |
| --- | --- | --- | --- |
| `draft` | 코트 미확보로 공개 | `waiting_for_court` | 호스트 |
| `draft` | 코트·시간·비용·정원·규칙 완성 | `recruiting` | 호스트 |
| `waiting_for_court` | 코트 확보 및 필수 정보 입력 | `recruiting` | 호스트 |
| `recruiting` | 승인된 참여자 수가 정원 도달 | `full` | 시스템 |
| `recruiting` / `full` | 재확인 시점 도래 | `reconfirming` | 시스템 또는 호스트 |
| `reconfirming` | 시작 시각 도래 | `in_progress` | 시스템 |
| `in_progress` | 종료 시각 경과 | `completed` | 시스템 |
| `draft`~`reconfirming` | 개최 불가 | `cancelled` | 호스트 또는 운영자 |

`waiting_for_court` 모임은 코트가 확정되기 전에는 `reconfirming` 또는 `in_progress`로 전환할 수 없다.

### 4.2 참여 상태

| 현재 | 조건 | 다음 | 실행 주체 |
| --- | --- | --- | --- |
| 없음 | 신청 조건 충족 | `pending` | 참여자 |
| `pending` | 레벨·목적·정원 확인 | `approved` | 호스트 |
| `pending` | 조건 불일치 또는 정원 마감 | `declined` | 호스트 |
| `pending` / `approved` | 취소 마감 전 사용자가 취소 | `cancelled` | 참여자 |
| `approved` | 참석 재확인 완료 | `approved` + `reconfirmedAt` | 참여자 |
| `approved` | 실제 참석 상호 확인 | `approved` + `attendance = attended` | 참여자/호스트/운영 규칙 |
| `approved` | 미참석 확인 | `approved` + `attendance = no_show` | 호스트/운영 규칙 |

승인된 참여자가 취소해 자리가 생기면 모임은 `full`에서 `recruiting`으로 돌아갈 수 있다. 시작 시각 이후의 참여 취소와 노쇼 처리는 정책 테이블을 따른다.

## 5. 권한과 검증

| 행동 | 권한 | 사전 검증 |
| --- | --- | --- |
| 모임 생성 | 본인인증 사용자 | 필수 정보, 시간·정원·레벨 범위 유효성 |
| 모임 신청 | 본인인증 사용자 | 모집 상태, 차단 여부, 정원, 레벨 기본 범위, 자기 모임 제외 |
| 신청 승인·거절 | 해당 모임 호스트 | 모임이 모집 상태, 신청이 `pending` |
| 채팅 | 호스트 또는 승인된 참여자 | 모임이 취소·종료 상태가 아님 |
| 공지 고정 | 해당 모임 호스트 | 승인된 참여자가 존재 |
| 참석 재확인 | 승인된 참여자 | 모임이 `reconfirming` |
| 출석 확인·후기 | 승인된 참여자 | 모임이 `completed`, 본인 참여 기록 존재 |
| 신고·차단 | 본인인증 사용자 | 대상·사유 필수 |

## 6. API/클라이언트 계약

- `Meeting` 조회 응답에는 사용자의 `participation` 상태와 허용 행동(`canApply`, `canCancel`, `canReconfirm`)을 함께 반환한다.
- 변경 요청은 멱등 키를 사용하거나 서버가 중복 요청을 감지한다.
- 모임 정원, 승인·취소·출석·후기는 트랜잭션으로 처리한다.
- 오류 응답은 사용자 행동이 가능한 코드로 분류한다. 예: `MEETING_FULL`, `COURT_NOT_SECURED`, `RECONFIRMATION_CLOSED`, `NOT_AUTHORIZED`.

## 7. 구현 완료 기준

- 코트 확보/미확보 모임이 데이터·상태 전환·API 응답에서 일관되게 구분된다.
- 신청 → 승인 → 채팅 → 재확인 → 출석 → 후기 흐름을 새로고침 후에도 동일한 상태로 재개할 수 있다.
- 권한 없는 사용자는 승인·채팅·출석·후기를 수행할 수 없다.
- 취소·노쇼·신고·차단 경로가 데이터와 API에 존재한다.
- 각 상태값은 [디자인 시스템 명세](design-system.md)의 배지·Empty·Error·Success 표현과 연결된다.

## 관련 문서

- [프로젝트 브리프](../PROJECT_BRIEF.md)
- [디자인 시스템 명세](design-system.md)

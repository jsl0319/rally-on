-- 일반 매칭의 신청이 신청자 뜻과 무관하게 정리되는 경로에 알림 종류를 만든다.
--
-- 지금까지 매칭 취소·모집 마감·시작 시각 경과는 신청을 조용히 CANCELLED로 바꾸기만
-- 했다. 수락까지 받은 사람이 취소 사실을 모른 채 코트에 나갈 수 있었다.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_EXPIRED';
-- 반대 방향도 마찬가지다. 참가자가 취소하면 모집자가 자리가 빈 것을 알아야 한다.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_PARTICIPANT_LEFT';

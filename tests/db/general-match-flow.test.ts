import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  acceptApplication,
  cancelMatch,
  closeMatch,
  createApplication,
  getHostedMatches,
  getSentApplications,
  reconcileStartedMatches,
  reopenMatch,
  withdrawApplication,
} from "@/server/domain/match-service";
import { getMyMatchConversations } from "@/server/domain/match-chat-service";
import { getProfile } from "@/server/domain/profile-service";

import { requireE2eDatabaseUrl } from "../e2e/e2e-environment";

/**
 * 일반 매칭(EXTERNAL_RESERVED)의 참가 취소와 다시 모집을 전용 DB에서 검증한다.
 *
 * 코트 매칭 테스트와 파일을 나눈 이유는 두 흐름의 픽스처가 서로 얽히지 않게 하기
 * 위해서다. 둘 다 users·regions를 TRUNCATE 하므로 같은 파일에 두면 한쪽을 고칠 때
 * 다른 쪽이 조용히 깨진다.
 */
const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ? requireE2eDatabaseUrl() : null;
const HOUR = 60 * 60 * 1000;

describe.skipIf(!databaseUrl)("일반 매칭 · 실제 DB", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE');
  });

  async function makeUser(nickname: string, gender: "MALE" | "FEMALE") {
    const user = await prisma.user.create({
      data: {
        nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date(),
        tennisProfile: {
          create: {
            experienceRange: "MONTHS_6_TO_12", rallyLevel: "SHORT_RALLY", gameExperience: "KNOWS_RULES", gender,
            purposes: { create: { purpose: "RALLY_PRACTICE" } },
          },
        },
      },
    });
    const profile = await getProfile(prisma, user.id);
    return { id: user.id, viewer: { id: user.id, profile: profile! } };
  }

  async function makeMatch(hostId: string, options: { recruitCount?: number; startsAt?: Date } = {}) {
    const startsAt = options.startsAt ?? new Date(Date.now() + 3 * 24 * HOUR);
    const match = await prisma.match.create({
      data: {
        hostUserId: hostId, clientRequestId: crypto.randomUUID(), title: "DB 일반 매칭",
        startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR),
        courtSource: "EXTERNAL_RESERVED",
        externalCourtName: "DB 테니스장", externalCourtAddress: "서울시 DB 마포구 1",
        recruitCount: options.recruitCount ?? 2,
        partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 24_000,
        purposes: { create: { purpose: "RALLY_PRACTICE" } },
      },
    });
    return match.id;
  }

  async function acceptedApplication(hostId: string, matchId: string, applicant: Awaited<ReturnType<typeof makeUser>>) {
    const applied = await createApplication(prisma, applicant.viewer, matchId, { message: null });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await acceptApplication(prisma, { id: hostId, profile: (await getProfile(prisma, hostId))! }, applied.id, { expectedMatchVersion: match.version });
    return applied.id;
  }

  it("수락된 참가자가 시작 전에 취소하면 자리가 돌아가고 대화방에서 빠진다", async () => {
    const host = await makeUser("모집자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 2 });
    const applicationId = await acceptedApplication(host.id, matchId, applicant);

    expect(await prisma.matchConversationMember.count({ where: { userId: applicant.id, conversation: { matchId } } })).toBe(1);

    await withdrawApplication(prisma, applicant.viewer, applicationId);

    const after = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applicationId } });
    expect(after.status).toBe("WITHDRAWN");
    expect(after.withdrawnAt).not.toBeNull();
    expect(await prisma.matchApplication.count({ where: { matchId, status: "ACCEPTED" } })).toBe(0);
    // 가지 않는 매칭의 준비 대화는 더 보지 않는다.
    expect(await prisma.matchConversationMember.count({ where: { userId: applicant.id, conversation: { matchId } } })).toBe(0);
    // 모집자에게는 방에 남는 안내 메시지가 자리가 비었다는 신호가 된다.
    const messages = await prisma.matchChatMessage.findMany({ where: { conversation: { matchId }, type: "SYSTEM" } });
    expect(messages.some((message) => message.body.includes("취소"))).toBe(true);
    // 채팅방을 열어야만 아는 신호로는 부족하다. 다시 모집할지 정해야 할 사람이다.
    const hostNotifications = await prisma.notification.findMany({ where: { userId: host.id, type: "MATCH_PARTICIPANT_LEFT" } });
    expect(hostNotifications).toHaveLength(1);
    expect(hostNotifications[0]?.href).toBe(`/activity/received/${matchId}`);
  });

  it("매칭을 취소하면 수락된 사람과 기다리던 사람 모두에게 알린다", async () => {
    const host = await makeUser("모집자", "MALE");
    const accepted = await makeUser("수락된 사람", "FEMALE");
    const waiting = await makeUser("대기하던 사람", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 3 });
    await acceptedApplication(host.id, matchId, accepted);
    await createApplication(prisma, waiting.viewer, matchId, { message: null });

    const open = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    const result = await cancelMatch(prisma, host.viewer, matchId, { expectedVersion: open.version, reason: null });
    // 알림을 실제로 남기기 전까지 이 응답 문구는 사실이 아니었다.
    expect(result.notice).toContain("신청한 사람들에게");

    const notified = await prisma.notification.findMany({ where: { type: "MATCH_CANCELLED" } });
    expect(notified.map((item) => item.userId).sort()).toEqual([accepted.id, waiting.id].sort());
    expect(notified[0]?.href).toBe("/activity/sent");
  });

  it("모집을 마감하면 기다리던 사람에게 알리고, 알림을 끈 사람은 건너뛴다", async () => {
    const host = await makeUser("모집자", "MALE");
    const accepted = await makeUser("수락된 사람", "FEMALE");
    const waiting = await makeUser("대기하던 사람", "FEMALE");
    const quiet = await makeUser("알림을 끈 사람", "FEMALE");
    await prisma.user.update({ where: { id: quiet.id }, data: { matchNotificationsEnabled: false } });
    const matchId = await makeMatch(host.id, { recruitCount: 3 });
    await acceptedApplication(host.id, matchId, accepted);
    await createApplication(prisma, waiting.viewer, matchId, { message: null });
    await createApplication(prisma, quiet.viewer, matchId, { message: null });

    const open = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await closeMatch(prisma, host.viewer, matchId, { expectedVersion: open.version });

    const notified = await prisma.notification.findMany({ where: { type: "MATCH_CLOSED" } });
    expect(notified.map((item) => item.userId)).toEqual([waiting.id]);
  });

  it("채팅 목록은 다가오는 매칭을 먼저 보여 주고 지난 매칭을 표시한다", async () => {
    const host = await makeUser("모집자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const soon = await makeMatch(host.id, { recruitCount: 2 });
    const over = await makeMatch(host.id, { recruitCount: 2 });
    await acceptedApplication(host.id, soon, applicant);
    await acceptedApplication(host.id, over, applicant);
    // 수락은 시작 전에만 되므로 방을 만든 뒤에 일정을 과거로 옮긴다.
    await prisma.match.update({
      where: { id: over },
      data: { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) },
    });

    const rooms = await getMyMatchConversations(prisma, applicant.id, "PARTICIPANT");

    expect(rooms.map((room) => room.match.id)).toEqual([soon, over]);
    expect(rooms.map((room) => room.match.finished)).toEqual([false, true]);
  });

  it("시작 시각이 지나 신청이 정리되면 기다리던 사람에게 알린다", async () => {
    const host = await makeUser("모집자", "MALE");
    const applicant = await makeUser("기다리던 사람", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 2 });
    await createApplication(prisma, applicant.viewer, matchId, { message: null });
    await prisma.match.update({
      where: { id: matchId },
      data: { startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) },
    });

    await getHostedMatches(prisma, host.viewer);

    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("EXPIRED");
    const notified = await prisma.notification.findMany({ where: { type: "MATCH_EXPIRED" } });
    expect(notified.map((item) => item.userId)).toEqual([applicant.id]);
  });

  it("이미 시작한 매칭과 남의 신청은 취소할 수 없다", async () => {
    const host = await makeUser("모집자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const outsider = await makeUser("제3자", "MALE");
    const matchId = await makeMatch(host.id);
    const applicationId = await acceptedApplication(host.id, matchId, applicant);

    await expect(withdrawApplication(prisma, outsider.viewer, applicationId))
      .rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND" });

    await prisma.match.update({ where: { id: matchId }, data: { startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) } });
    await expect(withdrawApplication(prisma, applicant.viewer, applicationId))
      .rejects.toMatchObject({ code: "MATCH_STARTED" });
  });

  it("정원이 차서 마감된 매칭은 취소로 자리가 비면 모집자가 다시 열 수 있다", async () => {
    const host = await makeUser("모집자", "MALE");
    const first = await makeUser("참가자1", "FEMALE");
    const second = await makeUser("참가자2", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 2 });
    const firstApplication = await acceptedApplication(host.id, matchId, first);
    await acceptedApplication(host.id, matchId, second);

    // 정원이 차면 서버가 마감한다.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("CLOSED");

    await withdrawApplication(prisma, first.viewer, firstApplication);
    // 자동으로 열지 않는다. 정원이 차서 닫힌 것과 모집자가 일부러 닫은 것을 구분할 수 없다.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("CLOSED");

    const hosted = await getHostedMatches(prisma, host.viewer);
    const hostedCard = hosted.find((item) => item.id === matchId);
    expect(hostedCard?.canReopen).toBe(true);

    const closed = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    // 화면이 이 값을 expectedVersion으로 그대로 보내므로 빠지면 모든 상태 변경 버튼이 막힌다.
    expect(hostedCard?.version).toBe(closed.version);
    const reopened = await reopenMatch(prisma, host.viewer, matchId, { expectedVersion: closed.version });
    expect(reopened).toMatchObject({ status: "OPEN", remainingSpots: 1 });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).closedAt).toBeNull();
  });

  it("자리가 없거나 모집자가 아니면 다시 모집할 수 없다", async () => {
    const host = await makeUser("모집자", "MALE");
    const other = await makeUser("다른 사람", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 1 });
    await acceptedApplication(host.id, matchId, applicant);

    const full = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(full.status).toBe("CLOSED");
    await expect(reopenMatch(prisma, host.viewer, matchId, { expectedVersion: full.version }))
      .rejects.toMatchObject({ code: "NO_REMAINING_SPOTS" });
    await expect(reopenMatch(prisma, other.viewer, matchId, { expectedVersion: full.version }))
      .rejects.toMatchObject({ code: "MATCH_HOST_REQUIRED" });
  });

  it("모집자가 직접 마감한 매칭도 다시 열 수 있고 정리된 대기 신청은 되살아나지 않는다", async () => {
    const host = await makeUser("모집자", "MALE");
    const accepted = await makeUser("수락된 사람", "FEMALE");
    const waiting = await makeUser("대기하던 사람", "FEMALE");
    const matchId = await makeMatch(host.id, { recruitCount: 3 });
    await acceptedApplication(host.id, matchId, accepted);
    const waitingApplication = await createApplication(prisma, waiting.viewer, matchId, { message: null });

    const open = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await closeMatch(prisma, host.viewer, matchId, { expectedVersion: open.version });
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: waitingApplication.id } })).status).toBe("CANCELLED");

    const closed = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await reopenMatch(prisma, host.viewer, matchId, { expectedVersion: closed.version });

    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("OPEN");
    // 이미 결과를 본 신청은 되살리지 않는다.
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: waitingApplication.id } })).status).toBe("CANCELLED");
  });
  it("화면 진입은 내 매칭만 보정하고 남의 매칭은 건드리지 않는다", async () => {
    const me = await makeUser("나", "MALE");
    const other = await makeUser("남", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");

    const mine = await makeMatch(me.id, { recruitCount: 2 });
    const theirs = await makeMatch(other.id, { recruitCount: 2 });
    // 둘 다 시작 시각이 지났지만 아직 OPEN이다. 크론이 하루 한 번이라 흔한 상태다.
    const started = new Date(Date.now() - HOUR);
    await prisma.match.updateMany({ where: { id: { in: [mine, theirs] } }, data: { startsAt: started, endsAt: new Date(Date.now() + HOUR) } });
    await prisma.matchApplication.create({
      data: { matchId: theirs, applicantUserId: applicant.id, applicantGender: "FEMALE", status: "PENDING", profileSnapshot: {}, profileSnapshotVersion: 1 },
    });

    await getHostedMatches(prisma, me.viewer);

    expect((await prisma.match.findUniqueOrThrow({ where: { id: mine } })).status).toBe("EXPIRED");
    // 남의 매칭은 그대로 둔다. 내 화면 한 번 여는 일이 서비스 전체를 훑지 않는다.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: theirs } })).status).toBe("OPEN");

    // 신청자 화면은 자기가 신청한 매칭을 보정한다.
    await getSentApplications(prisma, applicant.viewer);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: theirs } })).status).toBe("EXPIRED");
  });

  it("크론은 범위를 주지 않아 서비스 전체를 정리한다", async () => {
    const host = await makeUser("모집자", "MALE");
    const first = await makeMatch(host.id);
    const second = await makeMatch(host.id);
    await prisma.match.updateMany({ where: { id: { in: [first, second] } }, data: { startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) } });

    const summary = await reconcileStartedMatches(prisma);
    expect(summary.checked).toBeGreaterThanOrEqual(2);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: first } })).status).toBe("EXPIRED");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: second } })).status).toBe("EXPIRED");
  });
});

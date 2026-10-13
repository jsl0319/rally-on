import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { requireE2eDatabaseUrl } from "../e2e/e2e-environment";
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, listAnnouncements, listAdminAnnouncements, getAdminAnnouncement, announcementCreateSchema, announcementDeleteSchema } from "@/server/domain/announcement-service";
import { createSupportInquiry, actOnSupportInquiry, listSupportQueue } from "@/server/domain/support-service";

const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ? requireE2eDatabaseUrl() : null;
describe.skipIf(!databaseUrl)("서비스 관리 · 실제 DB", () => {
  let db: PrismaClient;
  beforeAll(() => { db = new PrismaClient({ adapter: createPrismaPg(databaseUrl!) }); });
  afterAll(async () => { await db?.$disconnect(); });
  beforeEach(async () => { await db.$executeRawUnsafe('TRUNCATE TABLE "users", "announcements" RESTART IDENTITY CASCADE'); });
  const user = (nickname: string, role: "MEMBER" | "INTERNAL_REVIEWER" = "MEMBER") => db.user.create({ data: { nickname, role, matchNotificationsEnabled: false } });
  const draft = () => ({ id: randomUUID(), title: "서비스 이용 안내", body: "테스트 공지 내용입니다.", isPinned: false });
  const action = (action: "CLAIM" | "REPLY" | "RESOLVE", expectedVersion: number) => ({ action, expectedVersion, body: "문의 내용 확인했습니다.", clientRequestId: randomUUID() });

  it("초안·숨김은 노출하지 않고 고정 순서와 최초 공개일을 보존한다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER");
    const first = await createAnnouncement(db, admin, draft());
    expect(first).toMatchObject({ status: "DRAFT", version: 1, publishedAt: null });
    expect((await listAnnouncements(db)).items).toEqual([]);
    const published = await updateAnnouncement(db, admin, first.id, { ...first, status: "PUBLISHED", expectedVersion: 1 });
    const second = await createAnnouncement(db, admin, { ...draft(), title: "중요 안내", isPinned: true });
    await updateAnnouncement(db, admin, second.id, { ...second, status: "PUBLISHED", expectedVersion: 1 });
    expect((await listAnnouncements(db)).items.map(i => i.id)).toEqual([second.id, first.id]);
    const hidden = await updateAnnouncement(db, admin, first.id, { ...published, status: "HIDDEN", expectedVersion: 2 });
    expect((await listAnnouncements(db)).items.map(i => i.id)).toEqual([second.id]);
    const again = await updateAnnouncement(db, admin, first.id, { ...hidden, status: "PUBLISHED", expectedVersion: 3 });
    expect(again.publishedAt).toBe(published.publishedAt);
    expect((await listAnnouncements(db)).items[0]).not.toHaveProperty("createdByUserId");
    expect((await listAdminAnnouncements(db, admin, { status: "PUBLISHED" })).items).toHaveLength(2);
    await expect(updateAnnouncement(db, admin, first.id, { ...again, status: "DRAFT", expectedVersion: 4 })).rejects.toMatchObject({ status: 409 });
  });

  it("동시 생성 재시도는 하나만 만들고 오래된 편집은 새 내용을 덮어쓰지 않는다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER"); const input = draft();
    const [a, b] = await Promise.all([createAnnouncement(db, admin, input), createAnnouncement(db, admin, input)]);
    expect(a.id).toBe(b.id); expect(await db.announcement.count()).toBe(1);
    const edits = await Promise.allSettled(["첫 수정", "다른 수정"].map(title => updateAnnouncement(db, admin, a.id, { ...a, title, expectedVersion: 1 })));
    expect(edits.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(edits.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "ANNOUNCEMENT_CONFLICT" } });
    expect((await getAdminAnnouncement(db, admin, a.id)).version).toBe(2);
    await expect(createAnnouncement(db, admin, { ...input, body: "동일 요청의 다른 내용" })).rejects.toMatchObject({ status: 409 });
  });

  it("일반 계정·권한 회수·비활성 관리자는 공지를 조회·변경할 수 없다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER"); const member = await user("회원");
    const item = await createAnnouncement(db, admin, draft());
    await expect(createAnnouncement(db, member, draft())).rejects.toMatchObject({ status: 403 });
    await expect(listAdminAnnouncements(db, member, {})).rejects.toMatchObject({ status: 403 });
    await expect(deleteAnnouncement(db, member, item.id, { expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { role: "MEMBER" } });
    await expect(getAdminAnnouncement(db, admin, item.id)).rejects.toMatchObject({ status: 403 });
    await expect(updateAnnouncement(db, admin, item.id, { ...item, status: "PUBLISHED", expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(deleteAnnouncement(db, admin, item.id, { expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { role: "INTERNAL_REVIEWER", status: "SUSPENDED" } });
    await expect(createAnnouncement(db, admin, draft())).rejects.toMatchObject({ status: 403 });
    await expect(deleteAnnouncement(db, admin, item.id, { expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    expect(await db.announcement.count()).toBe(1);
    expect(announcementCreateSchema.safeParse({ ...draft(), title: "  " }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...draft(), status: "PUBLISHED" }).success).toBe(false);
    expect(announcementDeleteSchema.safeParse({}).success).toBe(false);
    expect(announcementDeleteSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(announcementDeleteSchema.safeParse({ expectedVersion: 1, status: "PUBLISHED" }).success).toBe(false);
  });

  it.each(["DRAFT", "PUBLISHED", "HIDDEN"] as const)("%s 공지를 삭제하면 두 목록과 상세에서 사라지고 삭제 재시도는 안전하다", async status => {
    const admin = await user("관리자", "INTERNAL_REVIEWER");
    let item = await createAnnouncement(db, admin, draft());
    if (status !== "DRAFT") item = await updateAnnouncement(db, admin, item.id, { ...item, status, expectedVersion: item.version });
    const keep = await createAnnouncement(db, admin, draft());
    await deleteAnnouncement(db, admin, item.id, { expectedVersion: item.version });
    await deleteAnnouncement(db, admin, item.id, { expectedVersion: item.version });
    expect((await listAdminAnnouncements(db, admin, {})).items.map(i => i.id)).toEqual([keep.id]);
    expect((await listAnnouncements(db)).items).toEqual([]);
    await expect(getAdminAnnouncement(db, admin, item.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateAnnouncement(db, admin, item.id, { ...item, expectedVersion: item.version })).rejects.toMatchObject({ status: 404 });
  });

  it("오래된 화면의 삭제는 새 수정을 지우지 않으며 수정·삭제 경합도 한쪽만 성공한다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER");
    const item = await createAnnouncement(db, admin, draft());
    const edited = await updateAnnouncement(db, admin, item.id, { ...item, title: "보존할 새 내용", expectedVersion: item.version });
    await expect(deleteAnnouncement(db, admin, item.id, { expectedVersion: item.version })).rejects.toMatchObject({ status: 409 });
    expect((await getAdminAnnouncement(db, admin, item.id)).title).toBe("보존할 새 내용");
    const attempts = await Promise.allSettled([
      updateAnnouncement(db, admin, item.id, { ...edited, title: "동시 수정", expectedVersion: edited.version }),
      deleteAnnouncement(db, admin, item.id, { expectedVersion: edited.version }),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const remaining = await db.announcement.findUnique({ where: { id: item.id } });
    if (attempts[0].status === "fulfilled") expect(remaining?.title).toBe("동시 수정");
    else expect(remaining).toBeNull();
  });

  it("문의 접수·답변·추가 문의를 해당 담당자에게만 알리고 재시도는 중복하지 않는다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER"); const backup = await user("대체담당자", "INTERNAL_REVIEWER"); const member = await user("회원");
    const suspended = await user("중지담당자", "INTERNAL_REVIEWER"); await db.user.update({ where: { id: suspended.id }, data: { status: "SUSPENDED" } });
    const inquiry = await createSupportInquiry(db, member.id, { message: "사용자에게만 보이는 비공개 문의 원문입니다." });
    const received = await db.notification.findMany({ where: { type: "SUPPORT_INQUIRY_RECEIVED" } });
    expect(received.map(n => n.userId).sort()).toEqual([admin.id, backup.id].sort());
    expect(received[0].body).not.toContain("비공개 문의 원문");
    expect(received[0].href).toContain(inquiry.id);
    expect((await listSupportQueue(db, admin, "reviewer", { inquiryId: inquiry.id })).items).toHaveLength(1);
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", action("CLAIM", 1));
    const reply = action("REPLY", 2);
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", reply);
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", reply);
    expect(await db.notification.count({ where: { userId: member.id, type: "SUPPORT_INQUIRY_REPLIED" } })).toBe(1);
    expect((await listSupportQueue(db, admin, "reviewer", { status: "ACTION_REQUIRED" })).items).toHaveLength(0);
    await actOnSupportInquiry(db, member, inquiry.id, "member", action("REPLY", 3));
    expect((await db.notification.findMany({ where: { type: "SUPPORT_INQUIRY_UPDATED" } })).map(n => n.userId)).toEqual([admin.id]);
    expect((await listSupportQueue(db, admin, "reviewer", { status: "ACTION_REQUIRED" })).items).toHaveLength(1);
    await db.user.update({ where: { id: admin.id }, data: { role: "MEMBER" } });
    await actOnSupportInquiry(db, member, inquiry.id, "member", action("REPLY", 4));
    expect(await db.notification.count({ where: { userId: backup.id, type: "SUPPORT_INQUIRY_UPDATED" } })).toBe(1);
    const count = await db.notification.count();
    await expect(actOnSupportInquiry(db, admin, inquiry.id, "reviewer", action("REPLY", 5))).rejects.toMatchObject({ status: 403 });
    expect(await db.notification.count()).toBe(count);
  });

  it("본인 문의 알림을 자신에게 보내지 않고 해결 완료 알림은 회원에게 전달한다", async () => {
    const admin = await user("관리자", "INTERNAL_REVIEWER"); const member = await user("회원");
    const own = await createSupportInquiry(db, admin.id, { message: "관리자 본인의 로그인 문의입니다." });
    expect(await db.notification.count()).toBe(0);
    await expect(actOnSupportInquiry(db, admin, own.id, "reviewer", action("CLAIM", 1))).rejects.toMatchObject({ code: "SELF_REVIEW_NOT_ALLOWED" });
    const inquiry = await createSupportInquiry(db, member.id, { message: "사용 중 발생한 오류를 확인해 주세요." });
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", action("CLAIM", 1));
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", action("REPLY", 2));
    await actOnSupportInquiry(db, admin, inquiry.id, "reviewer", action("RESOLVE", 3));
    expect(await db.notification.count({ where: { userId: member.id, type: "SUPPORT_INQUIRY_RESOLVED" } })).toBe(1);
  });
});

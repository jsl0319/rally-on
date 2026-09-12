import { z } from "zod";

import { activeGameTypes } from "@/matches/game-type";
import { courtCompositionIssues } from "@/matches/court-composition";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const courtCreateInputSchema = z.object({
  regionCode: z.string().trim().min(1, "시설이 있는 시·군·구를 선택해 주세요."),
});

export type CourtCreateInput = z.infer<typeof courtCreateInputSchema>;

/**
 * 게스트 참가비를 받을 운영자 계좌. 시설당 한 벌만 두고, 코트 매칭을 공개할 때
 * 연결 Match로 값을 복사해 스냅샷을 남긴다(docs/03-2 §4.2).
 */
export const courtSettlementAccountInputSchema = z.object({
  bank: z.string().trim().min(1, "은행을 선택해 주세요.").max(50),
  accountNumber: z.string().trim().regex(/^[0-9-]{5,40}$/, "계좌번호는 숫자와 하이픈으로 5~40자 입력해 주세요.").refine((value) => /[0-9]/.test(value), "계좌번호를 확인해 주세요."),
  accountHolder: z.string().trim().min(1, "예금주를 입력해 주세요.").max(50),
});

export type CourtSettlementAccountInput = z.infer<typeof courtSettlementAccountInputSchema>;

export const courtSlotCreateInputSchema = z.object({
  courtUnitName: z.string().trim().min(1, "코트 면 이름을 입력해 주세요.").max(50, "코트 면 이름은 50자 이하여야 해요."),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  // 게스트 한 명이 내는 고정 참가비다. 코트 한 면의 총액이 아니라서 인원으로 나누지 않는다.
  priceKrw: z.number().int().min(0, "게스트 참가비는 0원 이상이어야 해요.").max(1_000_000, "게스트 참가비는 100만원 이하로 입력해 주세요."),
  // 운영자는 플레이어가 아니므로 정원에 자신을 포함하지 않는다.
  maxParticipantCount: z.number().int().min(2, "모집 정원은 2명 이상이어야 해요.").max(20, "모집 정원은 20명 이하로 입력해 주세요."),
  // 이 인원을 못 채우면 시작 3시간 전에 자동 취소한다.
  minParticipantCount: z.number().int().min(1, "최소 인원은 1명 이상이어야 해요."),
  gameType: z.enum(activeGameTypes),
  maleCapacity: z.number().int().min(0).max(20).nullable().optional(),
  femaleCapacity: z.number().int().min(0).max(20).nullable().optional(),
  approvalMode: z.enum(["AUTO", "OPERATOR"]),
  usageNote: z.string().trim().max(500, "이용 안내는 500자 이하여야 해요.").nullable().optional(),
}).superRefine((input, context) => {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  if (startsAt <= new Date()) {
    context.addIssue({ code: "custom", path: ["startsAt"], message: "시작 시간은 현재보다 미래여야 해요." });
  }
  if (startsAt >= endsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "종료 시간은 시작 시간보다 늦어야 해요." });
  }
  if (input.minParticipantCount > input.maxParticipantCount) {
    context.addIssue({ code: "custom", path: ["minParticipantCount"], message: "최소 인원은 모집 정원보다 많을 수 없어요." });
  }

  for (const issue of courtCompositionIssues(input)) {
    context.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
});

export type CourtSlotCreateInput = z.infer<typeof courtSlotCreateInputSchema>;

export const courtSlotIdSchema = z.string().uuid("코트 시간 정보를 다시 선택해 주세요.");

export const courtIdSchema = z.string().uuid("코트 정보를 다시 선택해 주세요.");

export const courtImageIdSchema = z.string().uuid("코트 사진을 다시 선택해 주세요.");

export const operatorCourtImageSaveInputSchema = z.object({
  imageIds: z.array(courtImageIdSchema).min(1, "대표 사진을 한 장 이상 저장해 주세요.").max(3, "코트 사진은 최대 3장까지 저장할 수 있어요."),
  representativeImageId: courtImageIdSchema,
}).superRefine((input, context) => {
  if (new Set(input.imageIds).size !== input.imageIds.length) {
    context.addIssue({ code: "custom", path: ["imageIds"], message: "같은 코트 사진을 한 번만 선택해 주세요." });
  }
  if (!input.imageIds.includes(input.representativeImageId)) {
    context.addIssue({ code: "custom", path: ["representativeImageId"], message: "대표 사진은 저장할 사진 중에서 선택해 주세요." });
  }
});

export type OperatorCourtImageSaveInput = z.infer<typeof operatorCourtImageSaveInputSchema>;

export const courtSlotUpdateInputSchema = courtSlotCreateInputSchema.extend({
  expectedVersion: z.number().int().positive("시간 정보를 다시 불러와 주세요."),
});

export type CourtSlotUpdateInput = z.infer<typeof courtSlotUpdateInputSchema>;

export const courtSlotListQuerySchema = z.object({
  status: z.enum(["DRAFT", "AVAILABLE", "ALLOCATED", "ENDED", "BLOCKED", "CANCELLED"]).optional(),
});

export type CourtSlotListQuery = z.infer<typeof courtSlotListQuerySchema>;

export const courtSupplyIncidentInputSchema = z.object({
  code: z.enum(["SCHEDULE_UNAVAILABLE", "FACILITY_CLOSED", "SAFETY_RISK", "NATURAL_DISASTER", "INFORMATION_REVIEW"]),
  expectedVersion: z.number().int().positive("시간 정보를 다시 불러와 주세요."),
});

export type CourtSupplyIncidentInput = z.infer<typeof courtSupplyIncidentInputSchema>;

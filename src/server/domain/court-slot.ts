import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const courtCreateInputSchema = z.object({
  regionCode: z.string().trim().min(1, "시설이 있는 시·군·구를 선택해 주세요."),
});

export type CourtCreateInput = z.infer<typeof courtCreateInputSchema>;

export const courtSlotCreateInputSchema = z.object({
  courtUnitName: z.string().trim().min(1, "코트 면 이름을 입력해 주세요.").max(50, "코트 면 이름은 50자 이하여야 해요."),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  // 게스트 한 명이 내는 고정 참가비다. 코트 한 면의 총액이 아니라서 인원으로 나누지 않는다.
  priceKrw: z.number().int().min(0, "게스트 참가비는 0원 이상이어야 해요.").max(1_000_000, "게스트 참가비는 100만원 이하로 입력해 주세요."),
  maxParticipantCount: z.number().int().min(2, "현장 최대 인원은 2명 이상이어야 해요."),
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

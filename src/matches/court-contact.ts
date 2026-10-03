import { z } from "zod";

export const courtContactPhoneSchema = z.string().trim().max(24)
  .regex(/^[0-9 ()-]+$/, "전화번호는 숫자와 하이픈으로 입력해 주세요.")
  .transform((value) => value.replace(/[ ()-]/g, ""))
  .refine((value) => /^(?:0[1-9]\d{7,10}|1[568]\d{6})$/.test(value), "국내 전화번호를 확인해 주세요.");

export const courtContactInputSchema = z.object({
  phone: courtContactPhoneSchema,
  hours: z.string().trim().min(1, "연락 가능 시간을 입력해 주세요.").max(80, "연락 가능 시간은 80자 이하로 입력해 주세요."),
  publicationAgreed: z.literal(true, { error: "전화번호 공개 범위를 확인해 주세요." }),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export const courtContactStopInputSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

export type CourtContact = { phone: string; hours: string };
export type CourtContactInput = z.infer<typeof courtContactInputSchema>;

export function formatCourtContactPhone(phone: string) {
  if (phone.length === 8) return `${phone.slice(0, 4)}-${phone.slice(4)}`;
  const areaLength = phone.startsWith("02") ? 2 : phone.startsWith("050") && phone.length === 12 ? 4 : 3;
  return `${phone.slice(0, areaLength)}-${phone.slice(areaLength, -4)}-${phone.slice(-4)}`;
}

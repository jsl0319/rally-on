import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "닉네임은 2자 이상이어야 해요.")
  .max(12, "닉네임은 12자 이하여야 해요.")
  .regex(/^[가-힣a-zA-Z0-9]+$/, "닉네임은 한글, 영문, 숫자만 사용할 수 있어요.");

export const profileInputSchema = z.object({
  gender: z.enum(["MALE", "FEMALE"], { error: "성별을 선택해 주세요." }),
  experienceRange: z.enum([
    "UNDER_3_MONTHS",
    "MONTHS_3_TO_6",
    "MONTHS_6_TO_12",
    "YEARS_1_TO_2",
    "YEARS_2_PLUS",
  ]),
  rallyLevel: z.enum([
    "STARTING",
    "SHORT_RALLY",
    "COMFORTABLE_RALLY",
    "STANDARD_RALLY",
  ]),
  gameExperience: z.enum(["NONE", "KNOWS_RULES", "PLAYED_FEW", "CAN_PLAY"]),
  playPurposes: z
    .array(
      z.enum([
        "CASUAL_HIT",
        "RALLY_PRACTICE",
        "STROKE_PRACTICE",
        "GAME_INTRO",
        "GAME",
      ]),
    )
    .min(1, "원하는 플레이를 하나 이상 선택해 주세요.")
    .max(2, "원하는 플레이는 최대 2개까지 선택할 수 있어요.")
    .refine((values) => new Set(values).size === values.length, "같은 플레이를 중복 선택할 수 없어요."),
  expectedVersion: z.number().int().positive().nullable(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const experienceLabels = {
  UNDER_3_MONTHS: "3개월 미만",
  MONTHS_3_TO_6: "3~6개월",
  MONTHS_6_TO_12: "6개월~1년",
  YEARS_1_TO_2: "1~2년",
  YEARS_2_PLUS: "2년 이상",
} as const;

export const rallyLabels = {
  STARTING: "아직 랠리가 어려워요",
  SHORT_RALLY: "몇 번씩 주고받을 수 있어요",
  COMFORTABLE_RALLY: "편하게 랠리할 수 있어요",
  STANDARD_RALLY: "일반적인 랠리도 가능해요",
} as const;

export const gameLabels = {
  NONE: "아직 해보지 않았어요",
  KNOWS_RULES: "규칙은 알고 있어요",
  PLAYED_FEW: "몇 번 해봤어요",
  CAN_PLAY: "게임을 진행할 수 있어요",
} as const;

export const purposeLabels = {
  CASUAL_HIT: "편하게 공 주고받기",
  RALLY_PRACTICE: "랠리",
  STROKE_PRACTICE: "스트로크 연습",
  GAME_INTRO: "게임 입문",
  GAME: "게임",
} as const;

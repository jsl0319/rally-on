"use client";

import { FormControl, FormField, FormLabel, FormMessage, TextField } from "@wanteddev/wds";
import { signIn } from "next-auth/react";
import { Check, ArrowLeft, TennisBall } from "@phosphor-icons/react";
import { WelcomeScreen } from "./welcome-screen";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ProfileGenderField } from "./profile-gender-field";
import type { Gender } from "@/matches/recruitment";

import { getSafeReturnTo, getStartAuthCallbackPath } from "@/navigation/return-to";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";

type Screen = "loading" | "login" | "error" | "nickname" | 0 | 1 | 2 | 3 | "result";
type ProfileDraft = {
  gender: Gender | null;
  nickname: string;
  experienceRange: "UNDER_3_MONTHS" | "MONTHS_3_TO_6" | "MONTHS_6_TO_12" | "YEARS_1_TO_2" | "YEARS_2_PLUS" | "";
  rallyLevel: "STARTING" | "SHORT_RALLY" | "COMFORTABLE_RALLY" | "STANDARD_RALLY" | "";
  gameExperience: "NONE" | "KNOWS_RULES" | "PLAYED_FEW" | "CAN_PLAY" | "";
  playPurposes: Array<"CASUAL_HIT" | "RALLY_PRACTICE" | "STROKE_PRACTICE" | "GAME_INTRO" | "GAME">;
  version: number | null;
};

type MeResponse = {
  nickname: string;
  nicknameConfirmed: boolean;
  onboardingCompleted: boolean;
  tennisProfile: null | {
    gender: Gender | null;
    experienceRange: ProfileDraft["experienceRange"];
    rallyLevel: ProfileDraft["rallyLevel"];
    gameExperience: ProfileDraft["gameExperience"];
    playPurposes: ProfileDraft["playPurposes"];
    version: number;
  };
};

const initialDraft: ProfileDraft = {
  gender: null,
  nickname: "",
  experienceRange: "",
  rallyLevel: "",
  gameExperience: "",
  playPurposes: [],
  version: null,
};

export const onboardingQuestions = [
  { key: "experienceRange", title: "테니스와 친해진 지\n얼마나 됐나요?", description: "정확하지 않아도 괜찮아요.", options: [
    ["UNDER_3_MONTHS", "3개월 미만", "이제 막 기본 동작을 배우고 있어요"],
    ["MONTHS_3_TO_6", "3~6개월", "공을 맞히는 감각을 익히고 있어요"],
    ["MONTHS_6_TO_12", "6개월~1년", "짧은 랠리를 연습하고 있어요"],
    ["YEARS_1_TO_2", "1~2년", "랠리와 게임을 조금씩 경험했어요"],
    ["YEARS_2_PLUS", "2년 이상", "초보 메이트와 편하게 치고 싶어요"],
  ] },
  { key: "rallyLevel", title: "요즘 랠리는\n어떤가요?", description: "가장 가까운 하나를 골라 주세요.", options: [
    ["STARTING", "아직 랠리가 어려워요", "공을 이어가는 연습을 하고 있어요"],
    ["SHORT_RALLY", "몇 번씩 주고받을 수 있어요", "천천히 치면 짧은 랠리가 가능해요"],
    ["COMFORTABLE_RALLY", "편하게 랠리할 수 있어요", "비슷한 수준끼리는 어느 정도 이어가요"],
    ["STANDARD_RALLY", "일반적인 랠리도 가능해요", "속도가 조금 있어도 주고받을 수 있어요"],
  ] },
  { key: "gameExperience", title: "테니스 게임도\n해봤나요?", description: "게임 실력을 평가하는 질문이 아니에요.", options: [
    ["NONE", "아직 해보지 않았어요", "게임보다 랠리가 편해요"],
    ["KNOWS_RULES", "규칙은 알고 있어요", "점수와 기본 진행 방식을 알아요"],
    ["PLAYED_FEW", "테니스 게임을 몇 번 해봤어요", "도움을 받으면 게임할 수 있어요"],
    ["CAN_PLAY", "게임을 진행할 수 있어요", "복식 게임을 부담 없이 즐길 수 있어요"],
  ] },
  { key: "playPurposes", title: "요즘 어떤 테니스를\n하고 싶나요?", description: "지금 원하는 플레이를 최대 2개 골라 주세요.", options: [
    ["CASUAL_HIT", "편하게 공 주고받기", "부담 없이 천천히 시작해요"],
    ["RALLY_PRACTICE", "랠리", "공을 길게 이어가고 싶어요"],
    ["STROKE_PRACTICE", "스트로크 연습", "포핸드와 백핸드를 반복해요"],
    ["GAME_INTRO", "게임 입문", "규칙을 익히며 천천히 해봐요"],
    ["GAME", "게임", "실전처럼 점수를 내며 즐겨요"],
  ] },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function responseBody(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
      ? body.error.message
      : "요청을 처리하지 못했어요. 다시 시도해 주세요.";
    throw new Error(message);
  }
  return body;
}

type M2OnboardingFlowProps = {
  onCompleted?: () => void;
  redirectWhenOnboarded?: boolean;
  returnTo?: string;
  skipTennisProfileOnboarding?: boolean;
};

export function M2OnboardingFlow({ onCompleted, redirectWhenOnboarded = false, returnTo = "/", skipTennisProfileOnboarding = false }: M2OnboardingFlowProps) {
  const router = useRouter();
  const safeReturnTo = getSafeReturnTo(returnTo);
  const [screen, setScreen] = useState<Screen>("loading");
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const meResponse = await fetch("/api/v1/me", { cache: "no-store" });
        if (meResponse.status === 401) {
          setScreen("login");
          return;
        }
        const me = await responseBody(meResponse) as MeResponse;
        if (skipTennisProfileOnboarding) {
          router.replace(safeReturnTo);
          return;
        }
        const profile = me.tennisProfile;
        const onboardingComplete = me.onboardingCompleted && profile !== null;
        setDraft({
          gender: profile?.gender ?? null,
          nickname: me.nickname,
          experienceRange: profile?.experienceRange ?? "",
          rallyLevel: profile?.rallyLevel ?? "",
          gameExperience: profile?.gameExperience ?? "",
          playPurposes: profile?.playPurposes ?? [],
          version: profile?.version ?? null,
        });
        if (onboardingComplete && redirectWhenOnboarded) {
          router.replace(safeReturnTo);
          return;
        }
        setScreen(!me.nicknameConfirmed ? "nickname" : onboardingComplete ? "result" : 0);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "서비스를 불러오지 못했어요.");
        setScreen("error");
      }
    })();
  }, [redirectWhenOnboarded, router, safeReturnTo, skipTennisProfileOnboarding]);

  const goBack = () => {
    setError("");
    if (screen === "nickname") setScreen("login");
    else if (typeof screen === "number") setScreen(screen === 0 ? "nickname" : screen - 1 as Screen);
    else if (screen === "result") setScreen(3);
  };

  const saveNickname = async () => {
    setLoading(true); setError("");
    try {
      await responseBody(await fetch("/api/v1/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: draft.nickname }) }));
      setScreen(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "닉네임을 저장하지 못했어요.");
    } finally { setLoading(false); }
  };

  const saveProfile = async () => {
    setLoading(true); setError("");
    try {
      const profile = await responseBody(await fetch("/api/v1/me/tennis-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: draft.gender,
          experienceRange: draft.experienceRange,
          rallyLevel: draft.rallyLevel,
          gameExperience: draft.gameExperience,
          playPurposes: draft.playPurposes,
          expectedVersion: draft.version,
        }),
      })) as { version: number };
      setDraft((current) => ({ ...current, version: profile.version }));
      setScreen("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필을 저장하지 못했어요.");
    } finally { setLoading(false); }
  };

  const togglePurpose = (purpose: ProfileDraft["playPurposes"][number]) => {
    setError("");
    setDraft((current) => {
      if (current.playPurposes.includes(purpose)) return { ...current, playPurposes: current.playPurposes.filter((item) => item !== purpose) };
      if (current.playPurposes.length >= 2) { setError("최대 2개까지 선택할 수 있어요."); return current; }
      return { ...current, playPurposes: [...current.playPurposes, purpose] };
    });
  };

  if (screen === "loading") return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5"><CourtRallyLoader className="max-w-[560px]" label="Rally On을 준비하고 있어요." /></main>;

  if (screen === "login") return <WelcomeScreen error={error} loading={loading} onOperator={() => {
    setLoading(true); setError("");
    void signIn("kakao", { callbackUrl: getStartAuthCallbackPath("OPERATOR", safeReturnTo) }).catch(() => {
      setError("카카오에 연결하지 못했어요. 다시 시도해 주세요.");
      setLoading(false);
    });
  }} onSignIn={() => {
    setLoading(true); setError("");
    void signIn("kakao", { callbackUrl: skipTennisProfileOnboarding ? safeReturnTo : getStartAuthCallbackPath("PLAYER", safeReturnTo) }).catch(() => {
      setError("카카오에 연결하지 못했어요. 다시 시도해 주세요.");
      setLoading(false);
    });
  }} />;

  if (screen === "error") return <ServiceCheckError onRetry={() => window.location.reload()} />;

  if (screen === "nickname") {
    const nicknameValid = /^[가-힣a-zA-Z0-9]{2,12}$/.test(draft.nickname.trim());
    return <FormShell step={1} onBack={goBack}><h1>어떤 이름으로<br />불러드릴까요?</h1><p>다른 메이트에게 보이는 닉네임이에요.</p><FormField className="mt-8"><FormLabel>닉네임</FormLabel><FormControl><TextField autoComplete="nickname" maxLength={12} onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))} value={draft.nickname} /></FormControl><FormMessage>2–12자 · 한글, 영문, 숫자를 사용할 수 있어요.</FormMessage></FormField>{error ? <ErrorMessage message={error} /> : null}<ActionButton disabled={!nicknameValid} loading={loading} onClick={() => void saveNickname()}>이 이름으로 시작할게요</ActionButton></FormShell>;
  }

  if (typeof screen === "number") {
    const question = onboardingQuestions[screen];
    const selected = question.key === "playPurposes" ? draft.playPurposes : draft[question.key as "experienceRange" | "rallyLevel" | "gameExperience"];
    const selectionDone = Array.isArray(selected) ? selected.length > 0 : Boolean(selected);
    // 성별은 마지막 화면에서 함께 받는 필수 항목이다.
    const canContinue = selectionDone && (screen !== 3 || draft.gender !== null);
    const options = "options" in question ? question.options : [];
    const selectOption = (value: string) => {
      if (question.key === "playPurposes") {
        togglePurpose(value as ProfileDraft["playPurposes"][number]);
        return;
      }
      setDraft((current) => ({
        ...current,
        [question.key]: value,
      }));
    };

    const questionContent = <ChoiceList options={options} selected={selected} onSelect={selectOption} />;

    return <FormShell step={screen + 2} onBack={goBack}><h1>{question.title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h1><p>{question.description}</p>{questionContent}{screen === 3 ? <ProfileGenderField onChange={(gender) => setDraft((current) => ({ ...current, gender }))} value={draft.gender} /> : null}{error ? <ErrorMessage message={error} /> : null}<ActionButton disabled={!canContinue} loading={loading} onClick={() => screen === 3 ? void saveProfile() : setScreen((screen + 1) as Screen)}>{screen === 3 ? "프로필 완성하기" : "다음"}</ActionButton></FormShell>;
  }

  const summary = onboardingQuestions.map((question) => {
    const value = draft[question.key];
    return question.options.filter(([code]) => Array.isArray(value) ? value.includes(code as never) : value === code).map(([, label]) => label).join(" · ");
  });
  return <FormShell step={STEP_COUNT} onBack={goBack} complete><div className="mt-4 grid size-16 place-items-center rounded-2xl bg-[var(--tm-tennis-ball)] text-[var(--tm-action-primary)]"><TennisBall size={38} weight="duotone" /></div><h1 className="mt-6">이제, 함께 칠<br />메이트를 만나볼까요?</h1><p>{draft.nickname}님의 플레이로 잘 맞는 매칭을 찾아드릴게요.</p><dl className="rally-card mt-7 divide-y divide-[var(--tm-border-subtle)] px-5">{summary.map((label, index) => <div className="py-4" key={index}><dt className="text-xs text-[var(--tm-text-secondary)]">{["테니스 경험", "랠리", "게임 경험", "원하는 플레이"][index]}</dt><dd className="mt-1 text-sm font-semibold">{label}</dd></div>)}</dl><ActionButton onClick={() => onCompleted ? onCompleted() : router.replace(safeReturnTo)}>나와 맞는 매칭 보기</ActionButton>{error ? <ErrorMessage message={error} /> : null}</FormShell>;
}

export function ChoiceList({ options, selected, onSelect }: { options: ReadonlyArray<readonly [string, string, string]>; selected: string | readonly string[]; onSelect: (value: string) => void }) {
  return <div className="mt-7 space-y-2.5">{options.map(([value, title, description]) => {
    const active = typeof selected === "string" ? selected === value : selected.includes(value);
    return <button aria-pressed={active} className="rally-choice" key={value} onClick={() => onSelect(value)} type="button"><span className="min-w-0 flex-1"><strong className="block text-[15px] font-semibold">{title}</strong><span className="mt-1 block text-[13px] leading-5 text-[var(--tm-text-secondary)]">{description}</span></span><span className="rally-choice-mark" aria-hidden>{active ? <Check size={14} weight="bold" /> : null}</span></button>;
  })}</div>;
}

function ServiceCheckError({ onRetry }: { onRetry: () => void }) {
  return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-6 py-12 text-[var(--tm-text-primary)]"><section className="w-full max-w-[420px]"><div role="alert"><h1 className="text-balance text-[28px] font-bold leading-tight">잠시 연결이 끊겼어요</h1><p className="mt-4 text-base leading-7 text-[var(--tm-text-secondary)]">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p></div><Button className="mt-8" fullWidth onClick={onRetry}>다시 연결하기</Button></section></main>;
}

/** 입력 화면 수. 닉네임 + 질문 네 개다. 막대와 숫자가 같은 값을 보게 한다. */
const STEP_COUNT = 5;

export function FormShell({ children, onBack, step, complete = false }: { children: React.ReactNode; onBack: () => void; step: number; complete?: boolean }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [step, complete]);
  return <main className="bg-[var(--tm-bg-page)] text-[var(--tm-text-primary)]"><section className="rally-form"><header className="flex items-center justify-between gap-4"><button aria-label="이전 화면으로 돌아가기" className="-ml-2 grid size-11 place-items-center rounded-full" onClick={onBack} type="button"><ArrowLeft size={23} /></button><span className="text-sm font-semibold">테니스 프로필</span><span className="text-xs tabular-nums text-[var(--tm-text-secondary)]">{complete ? "완료" : `${step} / ${STEP_COUNT}`}</span></header><div aria-label={`프로필 설정 ${step}/${STEP_COUNT}`} role="progressbar" aria-valuemin={0} aria-valuemax={STEP_COUNT} aria-valuenow={step} className="mt-5 flex gap-1.5">{Array.from({length:STEP_COUNT}, (_, i) => <span className={`h-1 flex-1 rounded-full ${i < step ? "bg-[var(--tm-action-primary)]" : "bg-[var(--tm-border-default)]"}`} key={i} />)}</div><div ref={content} tabIndex={-1} className="rally-form-content outline-none">{children}</div></section></main>;
}

function ActionButton({ children, disabled, loading, onClick }: { children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick: () => void }) {
  return <Button className="rally-form-actions" disabled={disabled} fullWidth loading={loading} onClick={onClick} size="large">{children}</Button>;
}

function ErrorMessage({ message }: { message: string }) {
  return <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{message}</p>;
}

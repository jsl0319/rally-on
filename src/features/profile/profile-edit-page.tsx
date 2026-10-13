"use client";

import { AccountPageHeader } from "@/components/navigation/account-page-header";
import { CaretDown, Check } from "@phosphor-icons/react";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSafeReturnTo } from "@/navigation/return-to";
import type { Gender } from "@/matches/recruitment";

import { ProfileImageField } from "./profile-image-field";

import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { useActionToast } from "@/components/feedback/use-action-toast";

type ExperienceRange = "UNDER_3_MONTHS" | "MONTHS_3_TO_6" | "MONTHS_6_TO_12" | "YEARS_1_TO_2" | "YEARS_2_PLUS";
type RallyLevel = "STARTING" | "SHORT_RALLY" | "COMFORTABLE_RALLY" | "STANDARD_RALLY";
type GameExperience = "NONE" | "KNOWS_RULES" | "PLAYED_FEW" | "CAN_PLAY";
type PlayPurpose = "CASUAL_HIT" | "RALLY_PRACTICE" | "STROKE_PRACTICE" | "GAME_INTRO" | "GAME";

type ProfileDraft = {
  gender: Gender | null;
  experienceRange: ExperienceRange | "";
  rallyLevel: RallyLevel | "";
  gameExperience: GameExperience | "";
  playPurposes: PlayPurpose[];
  version: number | null;
};

type MeResponse = {
  nickname: string;
  profileImageUrl: string | null;
  tennisProfile: null | {
    gender: Gender | null;
    experienceRange: ExperienceRange;
    rallyLevel: RallyLevel;
    gameExperience: GameExperience;
    playPurposes: PlayPurpose[];
    version: number;
  };
};

const emptyDraft: ProfileDraft = { gender: null, experienceRange: "", rallyLevel: "", gameExperience: "", playPurposes: [], version: null };
const experienceOptions: Array<[ExperienceRange, string, string]> = [["UNDER_3_MONTHS", "3개월 미만", "이제 막 기본 동작을 배우고 있어요"], ["MONTHS_3_TO_6", "3~6개월", "공을 맞히는 감각을 익히고 있어요"], ["MONTHS_6_TO_12", "6개월~1년", "짧은 랠리를 연습하고 있어요"], ["YEARS_1_TO_2", "1~2년", "랠리와 게임을 조금씩 경험했어요"], ["YEARS_2_PLUS", "2년 이상", "초보 메이트와 편하게 치고 싶어요"]];
const rallyOptions: Array<[RallyLevel, string, string]> = [["STARTING", "아직 랠리가 어려워요", "공을 이어가는 연습을 하고 있어요"], ["SHORT_RALLY", "몇 번씩 주고받을 수 있어요", "천천히 치면 짧은 랠리가 가능해요"], ["COMFORTABLE_RALLY", "편하게 랠리할 수 있어요", "비슷한 수준끼리는 어느 정도 이어가요"], ["STANDARD_RALLY", "일반적인 랠리도 가능해요", "속도가 조금 있어도 주고받을 수 있어요"]];
const gameOptions: Array<[GameExperience, string, string]> = [["NONE", "아직 해보지 않았어요", "게임보다 랠리가 편해요"], ["KNOWS_RULES", "규칙은 알고 있어요", "점수와 기본 진행 방식을 알아요"], ["PLAYED_FEW", "몇 번 해봤어요", "도움을 받으면 게임할 수 있어요"], ["CAN_PLAY", "게임을 진행할 수 있어요", "복식 게임을 부담 없이 즐길 수 있어요"]];
const purposeOptions: Array<[PlayPurpose, string, string]> = [["CASUAL_HIT", "편하게 공 주고받기", "부담 없이 천천히 시작해요"], ["RALLY_PRACTICE", "랠리", "공을 길게 이어가고 싶어요"], ["STROKE_PRACTICE", "스트로크 연습", "포핸드와 백핸드를 반복해요"], ["GAME_INTRO", "게임 입문", "규칙을 익히며 천천히 해봐요"], ["GAME", "게임", "실전처럼 점수를 내며 즐겨요"]];

function isValidNickname(value: string) {
  return /^[가-힣a-zA-Z0-9]{2,12}$/.test(value.trim());
}

function errorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

async function requestJson(response: Response, fallback: string) {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(body, fallback));
  return body;
}

function OptionCard({ active, description, onClick, title }: { active: boolean; description: string; onClick: () => void; title: string }) {
  return <button aria-pressed={active} className={`min-h-16 w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white text-[var(--tm-text-primary)]"}`} onClick={onClick} type="button"><span className="block text-sm font-semibold">{title}</span><span className={`mt-1 block text-xs leading-5 ${active ? "text-[var(--tm-action-hover)]" : "text-[var(--tm-text-secondary)]"}`}>{description}</span></button>;
}

export function ProfileEditPage({ returnTo = "/my" }: { returnTo?: string }) {
  const router = useRouter();
  const showComplete = useActionToast();
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [nickname, setNickname] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [savedNickname, setSavedNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const meResponse = await fetch("/api/v1/me", { cache: "no-store" });
      const me = await requestJson(meResponse, "내 정보를 불러오지 못했어요.") as MeResponse;
      setNickname(me.nickname);
      setSavedNickname(me.nickname);
      setProfileImageUrl(me.profileImageUrl);
      const profile = me.tennisProfile;
      if (!profile) throw new Error("테니스 프로필을 먼저 만들어 주세요.");
      setDraft({ gender: profile.gender ?? null, experienceRange: profile.experienceRange, rallyLevel: profile.rallyLevel, gameExperience: profile.gameExperience, playPurposes: profile.playPurposes, version: profile.version });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "내 정보를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const togglePurpose = (purpose: PlayPurpose) => {
    setError("");
    setDraft((current) => {
      if (current.playPurposes.includes(purpose)) return { ...current, playPurposes: current.playPurposes.filter((item) => item !== purpose) };
      if (current.playPurposes.length >= 2) { setError("원하는 플레이는 최대 2개까지 선택할 수 있어요."); return current; }
      return { ...current, playPurposes: [...current.playPurposes, purpose] };
    });
  };

  const save = async () => {
    const nextNickname = nickname.trim();
    if (!isValidNickname(nextNickname)) {
      setNicknameError("2–12자 한글, 영문, 숫자로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setNicknameError("");
    try {
      if (nextNickname !== savedNickname) {
        try {
          await requestJson(
            await fetch("/api/v1/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: nextNickname }) }),
            "닉네임을 저장하지 못했어요.",
          );
          setSavedNickname(nextNickname);
        } catch (caught) {
          setNicknameError(caught instanceof Error ? caught.message : "닉네임을 저장하지 못했어요.");
          return;
        }
      }
      await requestJson(await fetch("/api/v1/me/tennis-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gender: draft.gender, experienceRange: draft.experienceRange, rallyLevel: draft.rallyLevel, gameExperience: draft.gameExperience, playPurposes: draft.playPurposes, expectedVersion: draft.version }) }), "프로필을 저장하지 못했어요.");
      showComplete("프로필 저장이 완료되었습니다.");
      router.replace(getSafeReturnTo(returnTo));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const valid = Boolean(draft.gender && draft.experienceRange && draft.rallyLevel && draft.gameExperience && draft.playPurposes.length && isValidNickname(nickname));
  if (loading) return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5"><CourtRallyLoader className="max-w-[560px]" label="프로필을 준비하고 있어요." /></main>;
  if (error && !draft.version) return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pt-4 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px]"><BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/my" /><section className="mt-8 rally-card p-5"><h1 className="rally-page-title text-xl font-bold">프로필을 열지 못했어요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{error}</p><Button className="mt-5" onClick={() => void load()} size="medium">다시 불러오기</Button></section></section></main>;

  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-40 text-[var(--tm-text-primary)]">
    <AccountPageHeader title="프로필 수정" backHref={getSafeReturnTo(returnTo, "/my")} />
    <section className="mx-auto max-w-[560px] px-5">
      <ProfileImageField nickname={nickname} onChange={setProfileImageUrl} url={profileImageUrl} />
      <section className="border-b border-[var(--tm-border-default)] py-5">
        <label className="text-xs font-semibold text-[var(--tm-text-secondary)]" htmlFor="profile-nickname">닉네임</label>
        <input aria-describedby="profile-nickname-help" aria-invalid={Boolean(nicknameError)} autoComplete="nickname" className="rally-input mt-2 h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-base" id="profile-nickname" maxLength={12} onChange={(event) => { setNickname(event.target.value); setNicknameError(""); }} value={nickname} />
        <p className={`mt-2 text-xs ${nicknameError ? "text-[var(--tm-status-error-text)]" : "text-[var(--tm-text-secondary)]"}`} id="profile-nickname-help" role={nicknameError ? "alert" : undefined}>{nicknameError || "2–12자 · 한글, 영문, 숫자"}</p>
      </section>
      <fieldset className="py-5"><legend className="sr-only">성별</legend><p className="text-xs font-semibold text-[var(--tm-text-secondary)]">성별</p><div className="mt-2 grid grid-cols-2 gap-2">{([["MALE", "남자"], ["FEMALE", "여자"]] as const).map(([value, label]) => <button type="button" aria-pressed={draft.gender === value} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm ${draft.gender === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] font-semibold text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} onClick={() => setDraft(current => ({ ...current, gender: value }))} key={value}>{draft.gender === value ? <Check size={16} aria-hidden /> : null}{label}</button>)}</div><p className="mt-2 text-xs text-[var(--tm-text-secondary)]">남녀별 모집 자리를 확인할 때 사용해요.</p></fieldset>
      <h2 className="mb-2 mt-3 text-[17px] font-bold">나의 테니스</h2>
      <div className="overflow-hidden rounded-2xl bg-white px-4">
        <ProfileQuestion description="정확하지 않아도 괜찮아요." onSelect={(value) => setDraft((current) => ({ ...current, experienceRange: value as ExperienceRange }))} options={experienceOptions} selected={draft.experienceRange} title="테니스 경력" />
        <ProfileQuestion description="가장 가까운 하나를 골라 주세요." onSelect={(value) => setDraft((current) => ({ ...current, rallyLevel: value as RallyLevel }))} options={rallyOptions} selected={draft.rallyLevel} title="랠리 경험" />
        <ProfileQuestion description="게임 실력을 평가하는 질문이 아니에요." onSelect={(value) => setDraft((current) => ({ ...current, gameExperience: value as GameExperience }))} options={gameOptions} selected={draft.gameExperience} title="게임 경험" />
        <ProfileQuestion description="지금 원하는 플레이를 최대 2개 골라 주세요." onSelect={(value) => togglePurpose(value as PlayPurpose)} options={purposeOptions} selected={draft.playPurposes} title="원하는 플레이" />
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
    </section>
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-default)] bg-[var(--tm-bg-page)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"><div className="mx-auto max-w-[520px]"><p className="mb-2 text-center text-[11px] leading-5 text-[var(--tm-text-secondary)]">이미 보낸 신청에는 신청 당시 프로필이 유지돼요.</p><Button disabled={!valid || saving} fullWidth loading={saving} onClick={() => void save()}>저장하기</Button></div></footer>
  </main>;
}

function ProfileQuestion({ description, onSelect, options, selected, title }: { description: string; onSelect: (value: string) => void; options: ReadonlyArray<readonly [string, string, string]>; selected: string | string[]; title: string }) {
  const values = Array.isArray(selected) ? selected : [selected];
  const label = options.filter(([value]) => values.includes(value)).map(([, title]) => title).join(" · ");
  return <details className="rally-disclosure border-b border-[var(--tm-border-subtle)] last:border-0" name="tennis-profile-question">
    <summary className="flex min-h-20 items-center gap-3 py-4"><span className="min-w-0 flex-1"><span className="block text-xs text-[var(--tm-text-secondary)]">{title}</span><span className="mt-1 block text-[14px] font-medium">{label || "선택해 주세요"}</span></span><CaretDown aria-hidden className="rally-disclosure-chevron shrink-0 text-[var(--tm-text-secondary)]" size={16} /></summary>
    <p className="mb-3 text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</p><div className="grid gap-2 pb-4">{options.map(([value, optionTitle, optionDescription]) => <OptionCard active={values.includes(value)} description={optionDescription} key={value} onClick={() => onSelect(value)} title={optionTitle} />)}</div>
  </details>;
}

"use client";

import type { Gender } from "@/matches/recruitment";

export function ProfileGenderField({ value, onChange }: { value: Gender | null; onChange: (value: Gender) => void }) {
  return <fieldset className="mt-6 rounded-2xl border border-[var(--tm-border-default)] bg-white p-4"><legend className="px-1 text-sm font-semibold">성별</legend><p className="text-sm leading-6 text-[var(--tm-text-secondary)]">남녀별 정원이 있는 매칭에 신청할 때 사용해요. 신청 당시 성별은 이후 프로필을 바꿔도 해당 신청에 유지돼요.</p><div className="mt-3 grid grid-cols-2 gap-2">{([["MALE", "남자"], ["FEMALE", "여자"]] as const).map(([code, label]) => <button aria-pressed={value === code} className={`min-h-12 rounded-xl border px-2 text-sm ${value === code ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] font-semibold text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)]"}`} key={code} onClick={() => onChange(code)} type="button">{label}</button>)}</div></fieldset>;
}

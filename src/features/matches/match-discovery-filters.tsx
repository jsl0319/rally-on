"use client";

import { ArrowCounterClockwise, CalendarBlank, CaretDown, Check, Users } from "@phosphor-icons/react";
import { DateCalendar, Modal, ModalClose, ModalContainer, ModalNavigation } from "@wanteddev/wds";
import { useRef, useState, type MouseEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { activeGameTypes, gameTypeLabels, type ActiveGameType } from "@/matches/game-type";

export type MatchFilters = {
  date: string | null;
  gameType: ActiveGameType | null;
  sort: "recommended" | "soonest" | "newest";
};
export const DEFAULT_MATCH_FILTERS: MatchFilters = { date: null, gameType: null, sort: "recommended" };
type FilterSection = "date" | "gameType" | "sort";
const panelHeight = "min(640px, calc(100dvh - var(--rally-safe-top) - 12px))";
const sections: { value: FilterSection; label: string }[] = [
  { value: "date", label: "날짜" }, { value: "gameType", label: "게임 유형" }, { value: "sort", label: "정렬" },
];
const sortOptions: { value: MatchFilters["sort"]; label: string; description: string }[] = [
  { value: "recommended", label: "추천순", description: "내 테니스 프로필과 잘 맞는 매칭부터" },
  { value: "soonest", label: "매칭 임박순", description: "시작 시간이 가까운 매칭부터" },
  { value: "newest", label: "최신순", description: "새로 등록된 매칭부터" },
];

function calendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dateValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function todayInKorea(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dateLabel(value: string | null): string {
  if (!value) return "날짜";
  const date = calendarDate(value);
  return `${date.getMonth() + 1}.${date.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
}

export function MatchDiscoveryHeader() {
  return <header className="mx-auto w-full max-w-[560px] px-5 pb-2 pt-4">
    <PageHeader title="매칭" actions={<Link className="rally-text-action rounded-full bg-[var(--tm-bg-subtle)] px-4" href="/activity/received">내 매칭</Link>} />
  </header>;
}

export function MatchDiscoveryFilters({ value, onChange }: { value: MatchFilters; onChange: (value: MatchFilters) => void }) {
  const [openSection, setOpenSection] = useState<FilterSection | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const open = (section: FilterSection, button: HTMLButtonElement) => { trigger.current = button; setOpenSection(section); };
  const close = () => { setOpenSection(null); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <div className="flex min-w-0 items-center gap-2" aria-label="매칭 목록 필터">
      <div className="rally-filter-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
        <FilterChip active={value.date !== null} expanded={openSection === "date"} icon={<CalendarBlank size={16} aria-hidden />} label={dateLabel(value.date)} onClick={event => open("date", event.currentTarget)} />
        <FilterChip active={value.gameType !== null} expanded={openSection === "gameType"} icon={<Users size={16} aria-hidden />} label={value.gameType ? gameTypeLabels[value.gameType] : "게임 유형"} onClick={event => open("gameType", event.currentTarget)} />
      </div>
      <button type="button" aria-haspopup="dialog" aria-expanded={openSection === "sort"} onClick={event => open("sort", event.currentTarget)} className="inline-flex min-h-11 shrink-0 items-center gap-1 pl-2 text-xs font-semibold text-[var(--tm-text-secondary)]">
        {sortOptions.find(option => option.value === value.sort)?.label}<CaretDown size={12} aria-hidden />
      </button>
    </div>
    {openSection ? <FilterPanel initialSection={openSection} value={value} onClose={close} onApply={next => { onChange(next); close(); }} /> : null}
  </>;
}

function FilterChip({ active, expanded, icon, label, onClick }: { active: boolean; expanded: boolean; icon: ReactNode; label: string; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button type="button" aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors ${active ? "border-[var(--tm-action-primary)] bg-[var(--tm-action-primary)] text-white" : "border-[var(--tm-border-default)] bg-white text-[var(--tm-text-secondary)] shadow-[0_2px_5px_#202d2705]"}`}>
    {icon}{label}{active ? <Check size={12} weight="bold" aria-hidden /> : null}
  </button>;
}

/** Mounted on open: edits stay local until Apply, and dismissing discards them. */
function FilterPanel({ initialSection, value, onApply, onClose }: { initialSection: FilterSection; value: MatchFilters; onApply: (value: MatchFilters) => void; onClose: () => void }) {
  const [section, setSection] = useState(initialSection);
  const [draft, setDraft] = useState(value);
  const [today] = useState(todayInKorea);
  const tomorrow = calendarDate(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return <Modal open onOpenChange={open => { if (!open) onClose(); }}>
    <ModalContainer variant="bottom" size="large" sx={{ width: "100%", maxWidth: 560, height: panelHeight, maxHeight: panelHeight, padding: 0, borderRadius: "24px 24px 0 0", overflow: "hidden" }}>
      <div className="flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ height: panelHeight }}>
      <ModalNavigation sx={{ flexShrink: 0 }} trailingContent={<ModalClose aria-label="필터 닫기" />}>필터</ModalNavigation>
      <div className="shrink-0 border-b border-[var(--tm-border-subtle)] px-5 pb-4">
        <div className="flex gap-2" role="group" aria-label="필터 항목">
          {sections.map(item => <button type="button" key={item.value} aria-pressed={section === item.value} onClick={() => setSection(item.value)} className={`min-h-11 flex-1 rounded-full px-3 text-sm font-semibold ${section === item.value ? "bg-[var(--tm-action-primary)] text-white" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]"}`}>{item.label}</button>)}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {section === "date" ? <section aria-label="날짜 선택">
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "전체 날짜", value: null }, { label: "오늘", value: today }, { label: "내일", value: dateValue(tomorrow) }].map(option => <Choice key={option.label} selected={draft.date === option.value} onClick={() => setDraft(current => ({ ...current, date: option.value }))}>{option.label}</Choice>)}
          </div>
          <div className="mt-3 flex justify-center">
            <DateCalendar sx={{ "&& [aria-current='date']": { color: "var(--tm-action-primary)", backgroundColor: "var(--tm-bg-subtle)" }, "&& [aria-selected='true']": { color: "white", backgroundColor: "var(--tm-action-primary)" } }} locale="ko-KR" min={calendarDate(today)} value={draft.date ? calendarDate(draft.date) : null} views={["day"]} onChange={next => { if (next instanceof Date) setDraft(current => ({ ...current, date: dateValue(next) })); }} />
          </div>
        </section> : section === "gameType" ? <section aria-label="게임 유형 선택">
          <h3 className="mb-4 text-base font-semibold">어떤 게임을 찾으세요?</h3>
          <div className="grid grid-cols-2 gap-3">
            <Choice selected={draft.gameType === null} onClick={() => setDraft(current => ({ ...current, gameType: null }))}>전체</Choice>
            {activeGameTypes.map(type => <Choice key={type} selected={draft.gameType === type} onClick={() => setDraft(current => ({ ...current, gameType: type }))}>{gameTypeLabels[type]}</Choice>)}
          </div>
        </section> : <section aria-label="정렬 선택" className="grid gap-3">
          {sortOptions.map(option => <button type="button" key={option.value} aria-pressed={draft.sort === option.value} onClick={() => setDraft(current => ({ ...current, sort: option.value }))} className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${draft.sort === option.value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]" : "border-[var(--tm-border-default)]"}`}>
            <span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{option.description}</span></span>
            {draft.sort === option.value ? <Check size={20} weight="bold" className="shrink-0 text-[var(--tm-action-primary)]" aria-hidden /> : null}
          </button>)}
        </section>}
      </div>
      <div className="flex shrink-0 items-center gap-4 border-t border-[var(--tm-border-subtle)] bg-white px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => setDraft({ ...DEFAULT_MATCH_FILTERS })} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 px-2 text-sm font-medium text-[var(--tm-text-secondary)]"><ArrowCounterClockwise size={18} aria-hidden />초기화</button>
        <div className="min-w-0 flex-1"><Button fullWidth onClick={() => onApply(draft)}>적용하기</Button></div>
      </div>
      </div>
    </ModalContainer>
  </Modal>;
}

function Choice({ children, selected, onClick }: { children: ReactNode; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-medium ${selected ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] text-[var(--tm-text-secondary)]"}`}>{children}</button>;
}

"use client";

import { CalendarBlank, Clock } from "@phosphor-icons/react";
import { Modal, ModalContainer, ModalNavigation } from "@wanteddev/wds";
import { useEffect, useId, useRef, useState } from "react";

import { formatMatchDate, formatMatchTime, timeSelectionError, firstAvailableMatchTime } from "@/matches/schedule";

type Option = { value: string; label: string };
const ROW_HEIGHT = 44;
const numbers = (count: number, start = 0): Option[] => Array.from({ length: count }, (_, index) => ({ value: String(index + start), label: String(index + start).padStart(2, "0") }));

function Wheel({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (value: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  useEffect(() => {
    if (list.current) list.current.scrollTop = selectedIndex * ROW_HEIGHT;
  }, [selectedIndex]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const choose = (index: number) => onChange(options[Math.max(0, Math.min(options.length - 1, index))].value);
  return <div className="relative min-w-0 flex-1">
    <div aria-hidden className="pointer-events-none absolute inset-x-1 top-[88px] h-11 rounded-xl bg-neutral-100" />
    <div
      aria-activedescendant={`${id}-${selectedIndex}`} aria-label={label} className="relative h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] text-center outline-offset-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onKeyDown={(event) => {
        const next = { ArrowDown: selectedIndex + 1, ArrowUp: selectedIndex - 1, Home: 0, End: options.length - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); choose(next); }
      }}
      onScroll={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (list.current) choose(Math.round(list.current.scrollTop / ROW_HEIGHT)); }, 100);
      }}
      ref={list} role="listbox" tabIndex={0}
    >{options.map((option, index) => <div aria-selected={index === selectedIndex} className={`flex h-11 shrink-0 cursor-pointer snap-center items-center justify-center text-[24px] ${index === selectedIndex ? "font-semibold text-neutral-950" : "text-neutral-400"}`} id={`${id}-${index}`} key={option.value} onClick={() => choose(index)} role="option">{option.label}</div>)}</div>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent" />
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
  </div>;
}

export function MatchSchedulePicker({ kind, label, value, minDate, selectedDate, afterTime, beforeTime, onChange }: { kind: "date" | "time"; label: string; value: string; minDate?: string; selectedDate?: string; afterTime?: string; beforeTime?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const icon = kind === "date" ? <CalendarBlank aria-hidden size={22} /> : <Clock aria-hidden size={22} />;
  const start = () => {
    const initial = kind === "date" ? value || minDate || "2026-01-01"
      : value && !timeSelectionError(selectedDate, value, afterTime, beforeTime) ? value
        : firstAvailableMatchTime(selectedDate, afterTime, beforeTime) ?? "23:30";
    setDraft(initial); setOpen(true);
  };
  return <>
    <button aria-haspopup="dialog" aria-label={label} className="flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-subtle)] px-4 text-left text-base" onClick={start} type="button"><span className={value ? "font-medium" : "text-[var(--tm-text-secondary)]"}>{value ? kind === "date" ? formatMatchDate(value) : formatMatchTime(value) : `${kind === "date" ? "날짜" : "시간"}를 선택해 주세요`}</span>{icon}</button>
    {open ? <ScheduleSheet draft={draft} kind={kind} label={label} minDate={minDate} selectedDate={selectedDate} afterTime={afterTime} beforeTime={beforeTime} onCancel={() => setOpen(false)} onChange={setDraft} onConfirm={() => { onChange(draft); setOpen(false); }} /> : null}
  </>;
}

function ScheduleSheet({ draft, kind, label, minDate, selectedDate, afterTime, beforeTime, onCancel, onChange, onConfirm }: { draft: string; kind: "date" | "time"; label: string; minDate?: string; selectedDate?: string; afterTime?: string; beforeTime?: string; onCancel: () => void; onChange: (value: string) => void; onConfirm: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [year, month, day] = draft.split("-").map(Number);
  const [hour, minute] = draft.split(":").map(Number);
  const error = kind === "date"
    ? minDate && draft < minDate ? "오늘 이후 날짜를 선택해 주세요." : ""
    : timeSelectionError(selectedDate, draft, afterTime, beforeTime, now);
  const invalid = Boolean(error);
  const setDate = (nextYear: number, nextMonth: number, nextDay: number) => {
    const days = new Date(nextYear, nextMonth, 0).getDate();
    onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(Math.min(nextDay, days)).padStart(2, "0")}`);
  };
  const setTime = (nextHour: number, nextMinute: number) => onChange(`${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  const firstYear = Number(minDate?.slice(0, 4) || new Date().getFullYear());
  return <Modal open onOpenChange={(next) => { if (!next) onCancel(); }}><ModalContainer handle={false} resize="hug" size="large" variant="bottom" sx={{ borderRadius: 0 }}>
    <ModalNavigation leadingContent={<button className="px-2 py-3 text-base text-neutral-500" onClick={onCancel} type="button">취소</button>} trailingContent={<button className="px-2 py-3 text-base font-semibold text-[var(--tm-action-primary)] disabled:opacity-40" disabled={invalid} onClick={() => { const current = Date.now(); setNow(current); if (!invalid && (kind === "date" || !timeSelectionError(selectedDate, draft, afterTime, beforeTime, current))) onConfirm(); }} type="button">완료</button>}>{label}</ModalNavigation>
    <div className="border-t border-[var(--tm-border-default)] bg-white px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
      <div className="flex gap-2">{kind === "date" ? <>
        <Wheel label="연도" onChange={(value) => setDate(Number(value), month, day)} options={numbers(11, firstYear).map((option) => ({ ...option, label: `${option.value}년` }))} value={String(year)} />
        <Wheel label="월" onChange={(value) => setDate(year, Number(value), day)} options={numbers(12, 1).map((option) => ({ ...option, label: `${option.value}월` }))} value={String(month)} />
        <Wheel label="일" onChange={(value) => setDate(year, month, Number(value))} options={numbers(new Date(year, month, 0).getDate(), 1).map((option) => ({ ...option, label: `${option.value}일` }))} value={String(day)} />
      </> : <>
        <Wheel label="오전·오후" onChange={(value) => setTime(hour % 12 + Number(value) * 12, minute)} options={[{ value: "0", label: "오전" }, { value: "1", label: "오후" }]} value={hour < 12 ? "0" : "1"} />
        <Wheel label="시" onChange={(value) => setTime(Number(value) % 12 + (hour < 12 ? 0 : 12), minute)} options={numbers(12, 1)} value={String(hour % 12 || 12)} />
        <Wheel label="분" onChange={(value) => setTime(hour, Number(value))} options={[{ value: "0", label: "00" }, { value: "30", label: "30" }]} value={String(minute)} />
      </>}</div>
      <p aria-live="polite" className={`mt-3 text-center text-sm ${invalid ? "text-[var(--tm-status-error-text)]" : "text-[var(--tm-text-secondary)]"}`}>{invalid ? (kind === "time" && selectedDate && !firstAvailableMatchTime(selectedDate, afterTime, beforeTime, now) ? "선택 가능한 시간이 없어요. 날짜나 상대 시간을 변경해 주세요." : error) : kind === "date" ? formatMatchDate(draft) : formatMatchTime(draft)}</p>
    </div>
  </ModalContainer></Modal>;
}

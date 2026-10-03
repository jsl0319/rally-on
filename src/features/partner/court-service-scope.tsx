import {
  courtServiceScopeBasicLabel,
  courtServiceScopeFields,
  courtServiceScopeUnknownLabel,
  type CourtServiceScope,
} from "@/matches/court-service-scope";

export function CourtServiceScopeContent({ scope }: { scope: CourtServiceScope | null }) {
  if (!scope) return <p className="text-sm leading-6 text-slate-500">{courtServiceScopeUnknownLabel}</p>;
  return <div className="text-sm">
    <p className="rounded-xl bg-blue-50 px-4 py-3 font-semibold text-blue-700">{courtServiceScopeBasicLabel} 포함</p>
    <dl className="mt-4 space-y-3">
      {courtServiceScopeFields.map(({ key, label }) => <div key={key} className="flex items-center justify-between gap-4">
        <dt className="text-slate-600">{label}</dt>
        <dd className={`font-semibold ${scope[key] ? "text-blue-700" : "text-slate-500"}`}>{scope[key] ? "포함" : "미포함"}</dd>
      </div>)}
    </dl>
  </div>;
}

export function CourtServiceScopeFields({ value, disabled, onChange }: {
  value: Partial<CourtServiceScope>;
  disabled: boolean;
  onChange: (next: Partial<CourtServiceScope>) => void;
}) {
  return <section aria-label="참가비 포함 항목" className="space-y-4 rounded-2xl bg-slate-50 p-4">
    <h2 className="font-semibold">참가비 포함 항목</h2>
    <p className="text-sm leading-6 text-slate-600">코트 이용·매칭 참가는 기본 포함이에요. 추가 항목도 각각 선택해 주세요.</p>
    {courtServiceScopeFields.map(({ key, label }) => <fieldset disabled={disabled} key={key}>
      <legend className="mb-2 text-sm font-semibold">{label} <span className="text-xs text-blue-600">필수</span></legend>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((included) => <label key={String(included)} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${value[key] === included ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"} ${disabled ? "opacity-50" : ""}`}>
          <input type="radio" name={`service-scope-${key}`} checked={value[key] === included} onChange={() => onChange({ ...value, [key]: included })} className="accent-blue-600" />
          {included ? "포함" : "미포함"}
        </label>)}
      </div>
    </fieldset>)}
    <p className="text-xs leading-5 text-slate-500">장비 종류, 레슨 방식, 준비물 등은 아래 이용 안내에 적어 주세요. 현장 경기 진행은 게임 순서·교대 등을 도와주는 진행자가 있는 경우예요.</p>
  </section>;
}

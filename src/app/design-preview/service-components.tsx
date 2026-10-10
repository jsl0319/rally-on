"use client";

import { useState } from "react";
import { TextField } from "@wanteddev/wds";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { CourtServiceScopeFields } from "@/features/partner/court-service-scope";
import type { CourtServiceScope } from "@/matches/court-service-scope";
import { ChoiceList } from "@/features/profile/m2-onboarding-flow";

// Development preview only: no API calls, account data, or saving.
export function ServiceComponentsPreview() {
  const [scope, setScope] = useState<Partial<CourtServiceScope>>({});
  return <main className="mx-auto max-w-[560px] space-y-6 px-5 py-8">
    <Brand />
    <PageHeader eyebrow="서비스 공통 기준" title="같은 디자인, 모든 화면" description="입력·운영·거래 상태에도 같은 색과 간격을 적용해요." />
    <section className="rally-card space-y-4 p-5" aria-label="버튼 상태">
      <h2 className="text-lg font-bold">행동과 상태</h2>
      <Button fullWidth>주요 행동</Button><Button fullWidth variant="secondary">보조 행동</Button>
      <Button fullWidth disabled>선택 후 계속</Button><Button fullWidth loading>저장 중</Button>
      <p role="alert" className="rounded-xl bg-[var(--tm-status-error-bg)] p-4 text-sm text-[var(--tm-status-error-text)]">연결하지 못했어요. 다시 시도해 주세요.</p>
      <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong className="block">확인할 내용이 있어요</strong>기한과 처리 상태는 본문에서 확인해 주세요.</p>
    </section>
    <section className="rally-card space-y-4 p-5" aria-label="입력 규격">
      <h2 className="text-lg font-bold">입력</h2>
      <label className="block text-sm font-semibold" htmlFor="preview-court-name">코트 이름</label>
      <input id="preview-court-name" className="rally-input w-full border border-[var(--tm-border-default)] bg-white px-4" placeholder="코트 이름을 입력해 주세요" autoComplete="off" />
      <label className="block text-sm font-semibold" htmlFor="preview-unit">코트 번호</label>
      <TextField id="preview-unit" placeholder="예: 2번 코트" autoComplete="off" width="100%" />
      <label className="block text-sm font-semibold" htmlFor="preview-status">처리 상태</label>
      <select id="preview-status" className="rally-input w-full border border-[var(--tm-border-default)] bg-white px-4" defaultValue="all"><option value="all">전체</option><option value="pending">처리 대기</option><option value="done">처리 완료</option></select>
      <label className="block text-sm font-semibold" htmlFor="preview-note">안내 내용</label>
      <textarea id="preview-note" className="rally-input min-h-32 w-full border border-[var(--tm-border-default)] bg-white p-4" placeholder="필요한 내용을 입력해 주세요" />
      <label className="block text-sm font-semibold" htmlFor="preview-disabled">변경할 수 없는 정보</label>
      <input id="preview-disabled" className="rally-input w-full border border-[var(--tm-border-default)] bg-[var(--tm-bg-subtle-muted)] px-4" value="공개 후 일정 변경 불가" disabled />
    </section>
    <CourtServiceScopeFields value={scope} disabled={false} onChange={setScope} />
    <ChoiceList options={[["one", "편하게 공 주고받기", "부담 없이 천천히 시작해요"]]} selected="one" onSelect={() => {}} />
    <section className="rally-card p-6"><h2 className="font-bold">아직 맞는 매칭이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">다른 날짜로 찾아보세요.</p></section>
  </main>;
}

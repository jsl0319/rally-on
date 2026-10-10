"use client";

import { useState } from "react";
import Link from "next/link";
import { BusinessStep, CertificateStep, VenueStep } from "@/features/partner/operator-application-flow";
import { WelcomeScreen } from "@/features/profile/welcome-screen";
import { PageHeader } from "@/components/ui/page-header";

/** Actual presentation components, local state only: no login, uploads or API writes. */
export function LayoutPreview() {
  const [screen, setScreen] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState({ businessName: "", businessRegistrationNumber: "", businessOpenedOn: "", representativeName: "", venueName: "", venueAddress: "", businessRegistrationCertificateUploadId: "" });
  const set = <Key extends keyof typeof draft>(key: Key, value: typeof draft[Key]) => setDraft(current => ({ ...current, [key]: value }));
  const change = (next: number) => { setScreen(next); window.scrollTo(0, 0); };
  if (screen === 0) return <WelcomeScreen loading={false} onOperator={() => change(1)} onSignIn={() => change(4)} />;
  if (screen === 1) return <BusinessStep draft={draft} error="" onBack={() => change(0)} onNext={() => change(2)} set={set} />;
  if (screen === 2) return <VenueStep draft={draft} error="" onBack={() => change(1)} onNext={() => change(3)} set={set} />;
  if (screen === 3) return <CertificateStep certificate={null} certificateNoticeConfirmed={confirmed} error="" onBack={() => change(2)} onCertificateChange={() => {}} onNoticeChange={setConfirmed} onSubmit={() => {}} submitting={false} uploading={false} />;
  return <main className="min-h-app px-5 pb-28 pt-4"><section className="mx-auto max-w-[560px]">
    <PageHeader backHref="/layout-preview" title="코트 매칭 관리" description="초안을 공개하면 참가자 모집이 시작돼요." />
    <p className="rally-card mt-6 p-5">레이아웃 검증용 예시 화면입니다. 실제 신청·저장은 하지 않습니다.</p>
    <button className="rally-text-action mt-4" onClick={() => change(1)}>운영자 입력 화면 확인</button>
    <div><Link className="rally-text-action mt-4" href="/layout-preview/matches">매칭 필터 확인</Link></div>
  </section></main>;
}

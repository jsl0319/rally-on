"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Application = {
  id: string;
  status: "DRAFT_ACCESS_GRANTED" | "REVIEW_REQUIRED" | "PUBLISH_APPROVED" | "VERIFYING" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "REJECTED" | "SUSPENDED" | "DRAFT";
  statusLabel: string;
  businessVerificationStatus: string;
  venueVerificationStatus: string;
  venue: { name: string; address: string };
  canCreatePrivateDraft: boolean;
  canPublish: boolean;
  retryAvailable: boolean;
  businessRegistrationCertificate: { uploadId: string | null; attached: boolean };
  nextAction: string;
};

function messageFrom(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

export function OperatorApplicationStatus() {
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/operator-applications/me", { cache: "no-store" });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "심사 상태를 불러오지 못했어요."));
      setApplication(await response.json() as Application);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "심사 상태를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!application) return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pt-11 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[390px]">{error ? <section className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6" role="alert">{error}</p><div className="mt-4 grid gap-2"><Button onClick={() => void load()} size="medium">다시 불러오기</Button><Button as={Link} href="/partner/apply" size="medium" variant="secondary">운영자 등록 시작하기</Button></div></section> : <p className="text-sm text-[var(--tm-text-secondary)]">심사 상태를 불러오고 있어요…</p>}</div></main>;
  return <StatusScreen application={application} />;
}

function StatusScreen({ application }: { application: Application }) {
  const isApproved = application.status === "PUBLISH_APPROVED";
  const needsMore = ["REVIEW_REQUIRED", "CHANGES_REQUESTED", "REJECTED", "SUSPENDED"].includes(application.status);
  const draftReady = application.status === "DRAFT_ACCESS_GRANTED";
  const formHref = `/partner/apply?applicationId=${encodeURIComponent(application.id)}`;

  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-28 pt-11 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[390px]"><div className="flex justify-between text-sm text-[var(--tm-text-secondary)]"><span>운영자 등록</span><span>심사 상태</span></div><span className={`mt-10 inline-flex min-h-8 items-center rounded-full px-3 text-sm ${needsMore ? "border border-[var(--tm-border-default)] bg-white" : "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]"}`}>{application.statusLabel}</span>{isApproved ? <Approved application={application} /> : needsMore ? <MoreInformation application={application} formHref={formHref} /> : <DraftOrWaiting application={application} draftReady={draftReady} />}</div></main>;
}

function DraftOrWaiting({ application, draftReady }: { application: Application; draftReady: boolean }) {
  return <><h1 className="mt-5 text-2xl font-bold leading-[34px]">{draftReady ? <>코트와 시간을<br />먼저 준비할 수 있어요</> : <>등록 정보를<br />확인하고 있어요</>}</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{draftReady ? <>제출한 정보를 확인하고 있어요.<br />이용자에게 공개되기 전까지는 초안을 정리해 보세요.</> : <>사업자와 테니스장 정보를 안전하게 확인하고 있어요.<br />확인이 끝나면 다음 행동을 안내해 드릴게요.</>}</p><section className="mt-6 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-medium">현재 확인 상태</h2><StatusLine done={application.businessRegistrationCertificate.attached} title="사업자등록증" detail={application.businessRegistrationCertificate.attached ? "심사 자료를 안전하게 제출했어요." : "사업자등록증을 다시 제출해 주세요."} /><StatusLine done={application.businessVerificationStatus === "VERIFIED"} index="2" title="사업자 정보" detail={application.businessVerificationStatus === "VERIFIED" ? "등록번호와 개업일을 확인했어요." : "안전하게 확인을 준비하고 있어요."} /><StatusLine done={application.venueVerificationStatus === "MATCHED"} index="3" title="테니스장 정보" detail={application.venueVerificationStatus === "MATCHED" ? "장소 정보를 확인했어요." : "운영 권한을 한 번 더 살펴보고 있어요."} /></section><Notice>이용자에게는 아직 보이지 않아요.<br />심사가 끝난 뒤 공개할 시간대를 선택해 주세요.</Notice><p className="mt-6 text-sm leading-5 text-[var(--tm-text-secondary)]">{application.nextAction}</p>{draftReady ? <Button as={Link} className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" fullWidth href="/partner/slots/new">코트 기본정보 설정하기</Button> : <DisabledAction label="확인 중이에요" />}</>;
}

function MoreInformation({ application, formHref }: { application: Application; formHref: string }) {
  return <><h1 className="mt-5 text-2xl font-bold leading-[34px]">테니스장 또는 운영 권한을<br />한 번 더 확인해 주세요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">입력하신 정보와 확인 자료를 다시 살펴봐 주세요.<br />정보를 수정해 다시 검토를 요청할 수 있어요.</p><section className="mt-10 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-medium">확인이 필요한 정보</h2><Reason title="테니스장 이름 또는 주소" detail="사업자 정보와 장소 정보가 일치하는지 확인해 주세요." /><Reason title="운영 권한" detail="위탁 운영·공공시설 등은 심사 과정에서 별도 확인을 요청할 수 있어요." /></section><Notice>정보를 다시 확인하는 동안에는<br />코트와 시간대가 이용자에게 공개되지 않아요.</Notice><p className="mt-6 text-sm leading-5 text-[var(--tm-text-secondary)]">{application.status === "REJECTED" ? "등록이 반려되어도 언제든 정보를 고쳐 다시 요청할 수 있어요." : application.nextAction}</p><Button as={Link} className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" fullWidth href={formHref}>정보 수정 · 다시 제출</Button></>;
}

function Approved({ application }: { application: Application }) {
  return <><h1 className="mt-5 text-2xl font-bold leading-[34px]">이제 시간대를<br />공개할 수 있어요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">테니스장 확인이 완료됐어요.<br />원하는 코트와 이용 가능 시간을 먼저 등록해 보세요.</p><section className="mt-10 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-medium">{application.venue.name}</h2><p className="mt-1 text-sm text-[var(--tm-action-primary)]">운영자 확인 완료</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{application.venue.address} · 등록한 주소 기준</p></section><section className="mt-6 rounded-xl bg-[var(--tm-bg-subtle)] p-4"><h2 className="text-lg font-medium">공개 후 참가자를 관리해요</h2><p className="mt-2 text-sm leading-5 text-[var(--tm-text-secondary)]">참가 신청은 설정한 방식에 따라 승인돼요.<br />통장 입금을 확인한 뒤 참가를 확정해 주세요.</p></section><p className="mt-9 text-sm leading-5 text-[var(--tm-text-secondary)]">첫 시간대는 공개 전에 내용을 다시 확인할 수 있어요.</p><Button as={Link} className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" fullWidth href="/partner">운영자 홈으로</Button></>;
}

function StatusLine({ done, index, title, detail }: { done: boolean; index?: string; title: string; detail: string }) { return <div className="mt-4 flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--tm-bg-subtle)] text-sm text-[var(--tm-action-primary)]">{done ? "✓" : index ?? "1"}</span><p className="text-sm leading-5"><span className="block">{title}</span><span className="text-[var(--tm-text-secondary)]">{detail}</span></p></div>; }
function Reason({ title, detail }: { title: string; detail: string }) { return <div className="mt-4 flex gap-3 text-sm leading-5"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--tm-action-primary)]" /><p><span className="block">{title}</span><span className="text-[var(--tm-text-secondary)]">{detail}</span></p></div>; }
function Notice({ children }: { children: React.ReactNode }) { return <section className="mt-6 rounded-xl bg-[var(--tm-bg-subtle)] p-4 text-sm leading-5 text-[var(--tm-text-secondary)]">{children}</section>; }
function DisabledAction({ label }: { label: string }) { return <Button className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" disabled fullWidth>{label}</Button>; }

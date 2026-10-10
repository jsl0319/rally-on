"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";

type Screen = "loading" | "intro" | 1 | 2 | 3;

type Application = {
  id: string;
  businessRegistrationCertificate?: { uploadId: string | null; attached: boolean };
};
type Draft = {
  businessName: string;
  businessRegistrationNumber: string;
  businessOpenedOn: string;
  representativeName: string;
  venueName: string;
  venueAddress: string;
  businessRegistrationCertificateUploadId: string;
};
type CertificateDraft = { fileName: string; uploadId: string };

const emptyDraft: Draft = {
  businessName: "", businessRegistrationNumber: "", businessOpenedOn: "", representativeName: "",
  venueName: "", venueAddress: "", businessRegistrationCertificateUploadId: "",
};
const acceptedCertificateTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxCertificateBytes = 10 * 1024 * 1024;

function getErrorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
    ? body.error.message
    : fallback;
}

export function OperatorApplicationFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");
  const [screen, setScreen] = useState<Screen>("loading");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [certificate, setCertificate] = useState<CertificateDraft | null>(null);
  const [certificateNoticeConfirmed, setCertificateNoticeConfirmed] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/v1/operator-applications/me", { cache: "no-store", signal: controller.signal });
        if (response.status === 404) {
          setScreen(applicationId ? 1 : "intro");
          return;
        }
        if (!response.ok) throw new Error(getErrorMessage(await response.json(), "운영자 신청 정보를 불러오지 못했어요."));
        const application = await response.json() as Application;
        if (applicationId) {
          const uploadId = application.businessRegistrationCertificate?.attached ? application.businessRegistrationCertificate.uploadId : null;
          if (uploadId) {
            setDraft((current) => ({ ...current, businessRegistrationCertificateUploadId: uploadId }));
            setCertificate({ fileName: "기존에 제출한 사업자등록증", uploadId });
            setCertificateNoticeConfirmed(true);
          }
          setScreen(1);
          return;
        }
        router.replace(`/partner/application?applicationId=${encodeURIComponent(application.id)}`);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "운영자 등록을 시작하지 못했어요.");
        setScreen("intro");
      }
    })();
    return () => controller.abort();
  }, [applicationId, router]);

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const nextBusiness = () => {
    setError("");
    if (!draft.businessName.trim() || !draft.businessRegistrationNumber.trim() || !draft.businessOpenedOn || !draft.representativeName.trim()) {
      setError("사업자 정보를 모두 입력해 주세요.");
      return;
    }
    setScreen(2);
  };
  const nextVenue = () => {
    setError("");
    if (!draft.venueName.trim() || !draft.venueAddress.trim()) {
      setError("테니스장 이름과 주소를 모두 입력해 주세요.");
      return;
    }
    setScreen(3);
  };
  const uploadCertificate = async (file: File | null) => {
    setError("");
    if (!file) return;
    if (!acceptedCertificateTypes.includes(file.type)) {
      setError("사업자등록증은 PDF, JPEG, PNG만 올릴 수 있어요.");
      return;
    }
    if (file.size < 1 || file.size > maxCertificateBytes) {
      setError("사업자등록증은 10 MiB 이하로 올려 주세요.");
      return;
    }

    setCertificateUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/v1/operator-application-evidence-uploads", { method: "POST", body: formData });
      if (!response.ok) throw new Error(getErrorMessage(await response.json(), "사업자등록증을 올리지 못했어요."));
      const body = await response.json() as { id: string };
      setCertificate({ fileName: file.name, uploadId: body.id });
      set("businessRegistrationCertificateUploadId", body.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사업자등록증을 올리지 못했어요.");
    } finally {
      setCertificateUploading(false);
    }
  };
  const submit = async () => {
    if (!draft.businessRegistrationCertificateUploadId || !certificate || !certificateNoticeConfirmed) {
      setError("사업자등록증을 올리고 보관 안내를 확인해 주세요.");
      return;
    }
    if (certificateUploading) {
      setError("사업자등록증을 올리는 중이에요. 잠시만 기다려 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(applicationId ? `/api/v1/operator-applications/${encodeURIComponent(applicationId)}` : "/api/v1/operator-applications", {
        method: applicationId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(getErrorMessage(await response.json(), "등록 요청을 처리하지 못했어요."));
      router.replace("/partner/application");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록 요청을 처리하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (screen === "loading") return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5"><CourtRallyLoader className="max-w-[390px]" label="운영자 등록을 준비하고 있어요." /></main>;
  if (screen === "intro") return <Intro onStart={() => setScreen(1)} />;
  if (screen === 1) return <BusinessStep draft={draft} error={error} onBack={() => applicationId ? router.replace("/partner/application") : setScreen("intro")} onNext={nextBusiness} set={set} />;
  if (screen === 2) return <VenueStep draft={draft} error={error} onBack={() => { setError(""); setScreen(1); }} onNext={nextVenue} set={set} />;
  return <CertificateStep certificate={certificate} certificateNoticeConfirmed={certificateNoticeConfirmed} error={error} onBack={() => { setError(""); setScreen(2); }} onCertificateChange={(file) => void uploadCertificate(file)} onNoticeChange={setCertificateNoticeConfirmed} onSubmit={() => void submit()} submitting={submitting} uploading={certificateUploading} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-28 pt-11 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[390px]">{children}</div></main>;
}

function Intro({ onStart }: { onStart: () => void }) {
  return <Shell><div className="flex items-center justify-between text-sm text-[var(--tm-text-secondary)]"><span>운영자 등록</span><span>시작하기</span></div><div className="mt-[72px]"><p className="text-sm text-[var(--tm-action-primary)]">COURT PARTNER PILOT</p><h1 className="rally-page-title mt-2 text-2xl font-bold leading-[34px]">테니스장 운영자이신가요?</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">사업자등록증과 테니스장 정보를 확인한 뒤,<br />준비한 시간대를 이용자에게 공개할 수 있어요.</p></div><section className="mt-5 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-medium">등록 전에 이렇게 확인해요</h2><ol className="mt-3 space-y-3">{[["사업자 정보", "등록번호와 개업일을 확인해요."], ["사업자등록증", "심사에 필요한 비공개 증빙이에요."], ["테니스장 정보", "주소와 운영 권한을 함께 살펴봐요."], ["공개 준비", "승인 후 시간대를 공개할 수 있어요."]].map(([title, description], index) => <li className="flex gap-3" key={title}><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--tm-bg-subtle)] text-sm text-[var(--tm-action-primary)]">{index + 1}</span><span className="text-sm leading-5"><strong className="block font-normal">{title}</strong><span className="text-[var(--tm-text-secondary)]">{description}</span></span></li>)}</ol></section><Notice className="mt-4">심사 중에는 코트와 시간대를 초안으로 저장할 수 있어요. 이용자에게는 아직 보이지 않아요.</Notice><Button className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" fullWidth onClick={onStart}>운영자 등록 시작하기</Button></Shell>;
}

function BusinessStep({ draft, error, onBack, onNext, set }: { draft: Draft; error: string; onBack: () => void; onNext: () => void; set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void }) {
  return <Shell><Progress current={1} onBack={onBack} /><p className="mt-8 text-sm text-[var(--tm-action-primary)]">COURT PARTNER PILOT</p><h1 className="rally-page-title mt-2 text-2xl font-bold leading-[34px]">사업자 정보를 알려주세요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">사업자등록증과 대조할 정보예요.<br />확인에 실패해도 바로 공개되지는 않아요.</p><div className="mt-5 space-y-3"><Field label="사업자명" value={draft.businessName} placeholder="예) 마포 테니스파크" onChange={(value) => set("businessName", value)} /><Field label="사업자등록번호" inputMode="numeric" value={draft.businessRegistrationNumber} placeholder="숫자 10자리" onChange={(value) => set("businessRegistrationNumber", value)} /><Field label="개업일" type="date" value={draft.businessOpenedOn} placeholder="YYYY.MM.DD" onChange={(value) => set("businessOpenedOn", value)} /><Field label="대표자명" value={draft.representativeName} placeholder="사업자등록증 기준 이름" onChange={(value) => set("representativeName", value)} /></div><Notice className="mt-6">사업자 정보는 심사와 확인에만 사용해요.<br />등록 정보는 다른 이용자에게 공개하지 않아요.</Notice><StepError error={error} /><PrimaryAction label="다음" onClick={onNext} /></Shell>;
}

function VenueStep({ draft, error, onBack, onNext, set }: { draft: Draft; error: string; onBack: () => void; onNext: () => void; set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void }) {
  return <Shell><Progress current={2} onBack={onBack} /><p className="mt-8 text-sm text-[var(--tm-action-primary)]">COURT PARTNER PILOT</p><h1 className="rally-page-title mt-2 text-2xl font-bold leading-[34px]">테니스장 정보를 알려주세요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">직접 운영하는 테니스장만 등록할 수 있어요.<br />정보가 맞지 않으면 운영 권한을 추가 확인할 수 있어요.</p><div className="mt-5 space-y-3"><Field label="테니스장 이름" value={draft.venueName} placeholder="예) 마포 테니스파크" onChange={(value) => set("venueName", value)} /><Field label="테니스장 주소" value={draft.venueAddress} placeholder="주소 검색으로 정확히 입력해 주세요" onChange={(value) => set("venueAddress", value)} /></div><Notice className="mt-6">사업자 정보와 장소 정보가 다를 때만<br />운영 권한 자료를 별도로 요청할 수 있어요.</Notice><StepError error={error} /><PrimaryAction label="다음" onClick={onNext} /></Shell>;
}

function CertificateStep({ certificate, certificateNoticeConfirmed, error, onBack, onCertificateChange, onNoticeChange, onSubmit, submitting, uploading }: { certificate: CertificateDraft | null; certificateNoticeConfirmed: boolean; error: string; onBack: () => void; onCertificateChange: (file: File | null) => void; onNoticeChange: (checked: boolean) => void; onSubmit: () => void; submitting: boolean; uploading: boolean }) {
  return <Shell><Progress current={3} onBack={onBack} /><p className="mt-8 text-sm text-[var(--tm-action-primary)]">COURT PARTNER PILOT</p><h1 className="rally-page-title mt-2 text-2xl font-bold leading-[34px]">사업자등록증을<br />올려 주세요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">심사 제출에 꼭 필요한 자료예요.<br />사업자 정보와 테니스장 운영 권한을 함께 확인해요.</p><section className="mt-6 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-semibold">사업자등록증 <span className="text-sm font-normal text-[var(--tm-status-error-text)]">필수</span></h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">PDF · JPEG · PNG · 최대 10 MiB</p><label className={`mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-[var(--tm-border-default)] px-4 text-sm font-semibold text-[var(--tm-action-primary)] ${uploading ? "cursor-wait opacity-60" : ""}`}><span>{uploading ? "올리는 중…" : certificate ? "사업자등록증 바꾸기" : "사업자등록증 선택하기"}</span><input accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; onCertificateChange(file); }} type="file" /></label>{certificate ? <p className="mt-3 truncate text-sm text-[var(--tm-text-secondary)]">선택한 파일: {certificate.fileName}</p> : <p className="mt-3 text-sm leading-5 text-[var(--tm-text-secondary)]">파일을 올리면 제출 준비가 완료돼요.</p>}</section><label className="mt-5 flex gap-3 rounded-xl bg-[var(--tm-bg-subtle)] p-4 text-sm leading-5 text-[var(--tm-text-secondary)]"><input checked={certificateNoticeConfirmed} className="mt-1 size-4 accent-[var(--tm-action-primary)]" onChange={(event) => onNoticeChange(event.target.checked)} type="checkbox" /><span>사업자등록증은 심사 목적으로만 비공개 보관되고, 심사 중 최대 30일 또는 승인·반려 후 다음 정리 작업까지 보관된다는 안내를 확인했어요.</span></label><StepError error={error} /><PrimaryAction disabled={submitting || uploading || !certificate || !certificateNoticeConfirmed} label={submitting ? "등록 요청 중…" : uploading ? "사업자등록증 올리는 중…" : "등록 요청하기"} onClick={onSubmit} /></Shell>;
}

function Progress({ current, onBack }: { current: 1 | 2 | 3; onBack: () => void }) { return <><div className="flex items-center justify-between"><button aria-label="이전 단계로 돌아가기" className="-ml-2 min-h-11 min-w-11 text-2xl font-bold" onClick={onBack} type="button">‹</button><span className="text-sm text-[var(--tm-text-secondary)]">{current} / 3</span></div><div aria-label={`${current} / 3 단계`} className="mt-5 h-1 overflow-hidden rounded-full bg-[var(--tm-bg-subtle)]"><div className="h-full rounded-full bg-[var(--tm-action-primary)]" style={{ width: `${(current / 3) * 100}%` }} /></div></> }
function PrimaryAction({ disabled = false, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) { return <Button className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[350px]" disabled={disabled} fullWidth onClick={onClick}>{label}</Button>; }
function Field({ label, value, placeholder, onChange, type = "text", inputMode }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; type?: "text" | "date"; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) { const id = `operator-${label}`; return <label className="block text-sm leading-5" htmlFor={id}>{label}<input className="rally-input mt-1 h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm outline-none transition focus:border-[var(--tm-action-primary)]" id={id} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} /></label>; }
function Notice({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={`rounded-xl bg-[var(--tm-bg-subtle)] p-4 text-sm leading-5 text-[var(--tm-text-secondary)] ${className}`}>{children}</div>; }
function StepError({ error }: { error: string }) { return error ? <p className="mt-3 text-sm leading-5 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null; }

"use client";

import { PageHeader } from "@/components/ui/page-header";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";

type Application = {
  canPublish: boolean;
  venue: { name: string; address: string };
};

type Court = { id: string; name: string; address: string };

type StoredImage = {
  id: string;
  url: string;
  isRepresentative: boolean;
  sortOrder: number;
  previewUrl?: string;
};

type ImageListResponse = { items: StoredImage[] };

const maxImages = 3;
const maxBytes = 10 * 1024 * 1024;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

function errorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
    ? body.error.message
    : fallback;
}

async function requestJson<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(body, "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
  return body as T;
}

export function OperatorCourtPhotoManagement() {
  const [application, setApplication] = useState<Application | null>(null);
  const [court, setCourt] = useState<Court | null>(null);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [representativeImageId, setRepresentativeImageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const localPreviewUrls = useRef(new Set<string>());

  const revokeLocalPreviewUrls = useCallback(() => {
    for (const url of localPreviewUrls.current) URL.revokeObjectURL(url);
    localPreviewUrls.current.clear();
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setNotice("");
      const [nextApplication, courts] = await Promise.all([
        requestJson<Application>("/api/v1/operator-applications/me"),
        requestJson<{ items: Court[] }>("/api/v1/operator/courts"),
      ]);
      setApplication(nextApplication);
      const nextCourt = courts.items[0] ?? null;
      setCourt(nextCourt);
      revokeLocalPreviewUrls();
      if (!nextCourt || !nextApplication.canPublish) {
        setImages([]);
        setRepresentativeImageId(null);
        return;
      }
      const response = await requestJson<ImageListResponse>(`/api/v1/operator/courts/${encodeURIComponent(nextCourt.id)}/images`);
      setImages(response.items);
      setRepresentativeImageId(response.items.find((image) => image.isRepresentative)?.id ?? response.items[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대표 코트 사진을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [revokeLocalPreviewUrls]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => () => revokeLocalPreviewUrls(), [revokeLocalPreviewUrls]);

  const chooseFile = async (file: File | null) => {
    if (!file || !court) return;
    setError("");
    setNotice("");
    if (!acceptedTypes.includes(file.type)) {
      setError("코트 사진은 JPEG, PNG, WebP만 올릴 수 있어요.");
      return;
    }
    if (file.size < 1 || file.size > maxBytes) {
      setError("코트 사진은 10 MiB 이하로 올려 주세요.");
      return;
    }
    if (images.length >= maxImages) {
      setError("코트 사진은 최대 3장까지 저장할 수 있어요. 먼저 사진을 지우거나 교체해 주세요.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const upload = await requestJson<{ id: string }>(`/api/v1/operator/courts/${encodeURIComponent(court.id)}/images`, { method: "POST", body: formData });
      const previewUrl = URL.createObjectURL(file);
      localPreviewUrls.current.add(previewUrl);
      setImages((current) => [...current, { id: upload.id, url: "", previewUrl, isRepresentative: current.length === 0, sortOrder: current.length }]);
      setRepresentativeImageId((current) => current ?? upload.id);
      setNotice("사진을 골랐어요. 저장하면 이용자에게 대표 사진이 보일 수 있어요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 올리지 못했어요.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (image: StoredImage) => {
    if (!court || removingId) return;
    setRemovingId(image.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/operator/courts/${encodeURIComponent(court.id)}/images/${encodeURIComponent(image.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(errorMessage(body, "사진을 지우지 못했어요."));
      }
      if (image.previewUrl) {
        URL.revokeObjectURL(image.previewUrl);
        localPreviewUrls.current.delete(image.previewUrl);
      }
      const nextRepresentativeId = images.find((item) => item.id !== image.id)?.id ?? null;
      setImages((current) => current.filter((item) => item.id !== image.id));
      setRepresentativeImageId((selected) => selected === image.id ? nextRepresentativeId : selected);
      setNotice("사진을 공개 화면에서 바로 지웠어요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 지우지 못했어요.");
    } finally {
      setRemovingId(null);
    }
  };

  const save = async () => {
    if (!court || !representativeImageId || images.length === 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await requestJson<ImageListResponse>(`/api/v1/operator/courts/${encodeURIComponent(court.id)}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: images.map((image) => image.id), representativeImageId }),
      });
      revokeLocalPreviewUrls();
      setImages(response.items);
      setRepresentativeImageId(response.items.find((image) => image.isRepresentative)?.id ?? response.items[0]?.id ?? null);
      setNotice("대표 코트 사진을 저장했어요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5 text-[var(--tm-text-primary)]"><CourtRallyLoader label="대표 코트 사진을 준비하고 있어요." /></main>;
  }

  if (!application?.canPublish) {
    return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pt-8 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px]"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--tm-text-secondary)]" href="/partner">← 운영 홈</Link><h1 className="rally-page-title mt-5 text-2xl font-bold">대표 코트 사진은 공개 승인 후 관리해요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">심사 완료 뒤에 시설 사진을 최대 3장 올리고 대표 사진을 고를 수 있어요.</p><Button as={Link} className="mt-6" href="/partner/application" size="medium">심사 상태 보기</Button></section></main>;
  }

  if (!court) {
    return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pt-8 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px]"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--tm-text-secondary)]" href="/partner">← 운영 홈</Link><h1 className="rally-page-title mt-5 text-2xl font-bold">등록된 코트를 먼저 준비해 주세요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">시간 초안을 처음 저장하면 승인된 시설에 코트가 만들어져요. 그 뒤 대표 사진을 관리할 수 있어요.</p><Button as={Link} className="mt-6" href="/partner/slots/new" size="medium">시간 초안 만들기</Button></section></main>;
  }

  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-32 pt-8 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px]"><PageHeader backHref="/partner" title="코트 사진" description={<>{court.name}의 사진을 최대 3장 저장할 수 있어요. 대표 1장만 제휴 코트 카드와 세션 상세에 보여요.</>} />

    <section className="mt-5 rally-card p-5"><h2 className="font-bold">사진을 올리기 전에 확인해 주세요</h2><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">직접 찍었거나 사용할 권한이 있는 시설 사진만 올려 주세요. 얼굴, 연락처, 예약번호, 사업자등록증·예약 확인서가 보이는 사진은 올리지 않아요.</p><p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">JPEG · PNG · WebP · 사진당 최대 10 MiB</p></section>

    <div className="mt-5 grid gap-4">{images.map((image, index) => <article className="overflow-hidden rally-card p-4" key={image.id}><CourtMedia alt={`${court.name} 코트 사진 ${index + 1}`} className="aspect-[7/4] w-full" fallbackLabel="코트 사진" image={null} previewLabel={image.previewUrl ? "저장 전 미리보기" : "운영자 제공 사진"} previewUrl={image.previewUrl ?? image.url} /><div className="mt-4 flex items-center justify-between gap-3"><button aria-pressed={representativeImageId === image.id} className={`min-h-11 rounded-2xl px-4 text-sm font-semibold ${representativeImageId === image.id ? "bg-[var(--tm-bg-highlight)] text-[var(--tm-tennis-ball-muted)]" : "border border-[var(--tm-border-default)] text-[var(--tm-action-primary)]"}`} onClick={() => { setRepresentativeImageId(image.id); setNotice(""); }} type="button">{representativeImageId === image.id ? "대표 사진" : "대표로 선택"}</button><button className="min-h-11 rounded-2xl px-3 text-sm font-semibold text-[var(--tm-status-error-text)] disabled:opacity-50" disabled={removingId === image.id || saving} onClick={() => void removeImage(image)} type="button">{removingId === image.id ? "지우는 중…" : "사진 지우기"}</button></div></article>)}</div>

    {images.length < maxImages ? <label className={`mt-5 flex min-h-[56px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[var(--tm-border-strong)] bg-white px-4 text-sm font-semibold text-[var(--tm-action-primary)] ${uploading ? "cursor-wait opacity-60" : ""}`}><span>{uploading ? "사진 올리는 중…" : `사진 추가하기 (${images.length}/${maxImages})`}</span><input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading || saving} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void chooseFile(file); }} type="file" /></label> : null}
    {!images.length ? <section className="mt-5 rounded-[20px] bg-[var(--tm-bg-subtle)] p-5"><p className="font-semibold">아직 저장된 사진이 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">사진이 없어도 제휴 코트 시간은 계속 기본 코트 일러스트로 보여요.</p></section> : null}
    {notice ? <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-primary)]" role="status">{notice}</p> : null}
    {error ? <p className="mt-4 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
    {error && !images.length ? <Button className="mt-4" onClick={() => void load()} size="medium" variant="secondary">다시 불러오기</Button> : null}
  </section><div className="fixed inset-x-5 bottom-7 mx-auto max-w-[520px]"><Button disabled={!images.length || !representativeImageId || saving || uploading || Boolean(removingId)} fullWidth loading={saving} onClick={() => void save()}>사진 저장하기</Button></div></main>;
}

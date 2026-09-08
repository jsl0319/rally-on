"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, UserCircle } from "@phosphor-icons/react";

const maxProfileImageBytes = 5 * 1024 * 1024;

function errorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

/**
 * 프로필 사진. 기본값은 카카오 계정 사진이고, 직접 올리면 그 사진이 우선한다.
 * `기본 사진으로`는 올린 사진만 지우고 카카오 사진으로 되돌린다.
 */
export function ProfileImageField({ nickname, onChange, url }: { nickname: string; onChange: (url: string | null) => void; url: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    if (file.size > maxProfileImageBytes) {
      setError("프로필 사진은 5 MiB 이하로 올려 주세요.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/v1/me/profile-image", { method: "PUT", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, "사진을 올리지 못했어요."));
      onChange((body as { profileImageUrl: string | null }).profileImageUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/profile-image", { method: "DELETE" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, "사진을 되돌리지 못했어요."));
      onChange((body as { profileImageUrl: string | null }).profileImageUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진을 되돌리지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt-6 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]">
    <h2 className="text-sm font-semibold text-[var(--tm-action-primary)]">프로필 사진</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">카카오 계정 사진을 기본으로 사용해요. 다른 사진으로 바꿀 수 있어요.</p>

    <div className="mt-4 flex items-center gap-4">
      <button
        aria-label="프로필 사진 변경"
        className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)] disabled:opacity-60"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {url
          ? <Image alt={`${nickname} 프로필 사진`} className="size-full object-cover" height={80} src={url} unoptimized width={80} />
          : <UserCircle aria-hidden="true" className="size-14" weight="fill" />}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 grid h-6 place-items-center bg-[var(--tm-text-primary)]/55 text-white">
          <Camera className="size-4" />
        </span>
      </button>

      <div className="flex flex-col items-start gap-1">
        <button className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--tm-action-primary)] disabled:opacity-60" disabled={busy} onClick={() => inputRef.current?.click()} type="button">
          사진 바꾸기
        </button>
        <button className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--tm-text-secondary)] disabled:opacity-60" disabled={busy} onClick={() => void reset()} type="button">
          기본 사진으로
        </button>
      </div>
    </div>

    <input
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }}
      ref={inputRef}
      type="file"
    />

    {error ? <p className="mt-3 text-sm text-[var(--tm-status-error-text)]" role="alert">{error}</p> : <p className="mt-3 text-xs text-[var(--tm-text-secondary)]">JPEG · PNG · WebP, 5 MiB 이하</p>}
  </section>;
}

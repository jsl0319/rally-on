"use client";

import { NavigationArrow } from "@phosphor-icons/react";
import { useState } from "react";

export function CourtDirectionsButton({ matchId, name, address }: { matchId: string; name: string; address: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function openDirections() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/directions`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "길찾기를 불러오지 못했어요.");
      const url = new URL(body.href);
      if (url.origin !== "https://map.kakao.com" || !url.pathname.startsWith("/link/to/")) throw new Error("길찾기 주소를 확인하지 못했어요.");
      window.location.assign(url.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "길찾기를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally { setLoading(false); }
  }
  return <div className="mt-3">
    <button type="button" disabled={loading} onClick={() => void openDirections()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 text-sm font-semibold text-[#191919] transition hover:bg-[#f4dc00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"><NavigationArrow size={18} aria-hidden />{loading ? "길찾기 준비 중…" : "카카오맵 길찾기"}</button>
    {error ? <div className="mt-3 text-xs leading-6"><p role="alert" className="text-red-700">{error}</p><a className="font-semibold text-blue-700 underline" href={`https://map.kakao.com/link/search/${encodeURIComponent(`${address} ${name}`)}`}>카카오맵에서 위치 검색</a></div> : null}
  </div>;
}

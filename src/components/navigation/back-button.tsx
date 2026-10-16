"use client";

import { IconButton } from "@wanteddev/wds";
import { IconArrowLeft } from "@wanteddev/wds-icon";
import { useRouter } from "next/navigation";
import { returnWithinApp } from "@/navigation/history";

type BackButtonProps = {
  ariaLabel?: string;
  className?: string;
  fallbackPath?: string;
};

export function BackButton({ ariaLabel = "이전 화면으로 돌아가기", className = "", fallbackPath = "/" }: BackButtonProps) {
  const router = useRouter();

  return (
    <IconButton sx={{ minWidth: 44, minHeight: 44, borderRadius: 14 }} aria-label={ariaLabel} className={className} onClick={() => returnWithinApp(fallbackPath, path => router.replace(path))}>
      <IconArrowLeft height={20} width={20} />
    </IconButton>
  );
}

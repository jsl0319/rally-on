import Image from "next/image";

export type CourtImageView = {
  url: string | null;
  sourceLabel: string | null;
  fallback: "TENNIS_COURT_ILLUSTRATION";
};

type CourtMediaProps = {
  alt: string;
  className?: string;
  fallbackLabel: string;
  image: CourtImageView | null | undefined;
  previewLabel?: string;
  previewUrl?: string | null;
  priority?: boolean;
};

export function CourtMedia({ alt, className = "", fallbackLabel, image, previewLabel, previewUrl, priority = false }: CourtMediaProps) {
  const source = previewUrl ?? image?.url;
  const label = previewLabel ?? (source ? image?.sourceLabel ?? "선택한 코트 사진" : fallbackLabel);

  return <div className={`relative overflow-hidden rounded-2xl bg-[var(--tm-action-primary)] ${className}`}>
    {source ? <Image alt={alt} className="object-cover" fill priority={priority} sizes="(max-width: 560px) 100vw, 560px" src={source} unoptimized={!source.startsWith("/images/court-samples/")} /> : <CourtIllustration label={label} />}
    {source ? <span className="absolute bottom-2 right-2 max-w-[calc(100%-16px)] rounded-md bg-black/55 px-1.5 py-1 text-[10px] font-medium leading-4 text-white backdrop-blur-sm">{label}</span> : null}
  </div>;
}

function CourtIllustration({ label }: { label: string }) {
  return <div aria-label={label} className="absolute inset-3 rounded-xl bg-[var(--tm-bg-subtle)]" role="img">
    <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white" />
    <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white" />
    <span className="absolute bottom-2 left-2 text-[11px] font-medium leading-4 text-[var(--tm-text-primary)]">{label}</span>
  </div>;
}

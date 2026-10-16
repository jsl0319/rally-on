type CourtRallyLoaderProps = {
  label: string;
  className?: string;
};

export function CourtRallyLoader({ label, className = "" }: CourtRallyLoaderProps) {
  return <section data-navigation-loading aria-busy="true" aria-live="polite" className={`flex min-h-[260px] w-full flex-col items-center justify-center ${className}`} role="status">
    <div aria-hidden="true" className="relative h-[76px] w-[116px] overflow-hidden rounded-2xl bg-[var(--tm-action-primary)]">
      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-white/75" />
      <span className="absolute left-2.5 right-2.5 top-1/2 h-px -translate-y-1/2 bg-white/75" />
      <span className="absolute left-5 top-1/2 size-6 -translate-y-1/2 rounded-full bg-[var(--tm-tennis-ball)] shadow-[0_2px_5px_rgba(36,48,68,0.16)] motion-safe:animate-[court-rally_1.2s_ease-in-out_infinite] motion-reduce:left-[46px] motion-reduce:animate-none" />
    </div>
    <p className="mt-5 text-center text-sm leading-[21px] text-[var(--tm-text-secondary)]">{label}</p>
  </section>;
}

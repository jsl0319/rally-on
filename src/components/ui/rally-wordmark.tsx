import Image from "next/image";

/** Shared vector artwork keeps the web and native launch identity identical. */
export function RallyWordmark({ className = "" }: { className?: string }) {
  return <span className={`rally-welcome-wordmark ${className}`}>
    <Image src="/images/brand/wordmark.svg" alt="Rally On" width={265.298125} height={82.8} unoptimized priority />
  </span>;
}

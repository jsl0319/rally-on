export type ChatKind = "GENERAL" | "COURT";
export type ChatSenderRole = "OPERATOR" | "HOST" | "PARTICIPANT";

export function ChatKindBadge({ kind }: { kind: ChatKind }) {
  return <span className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-4 ${kind === "COURT" ? "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]"}`}>{kind === "COURT" ? "코트 매칭" : "매칭"}</span>;
}

export function ChatHostBadge({ role }: { role: ChatSenderRole }) {
  if (role !== "OPERATOR" && role !== "HOST") return null;
  return <span className="inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-4 text-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]">{role === "OPERATOR" ? "운영자" : "모집자"}</span>;
}

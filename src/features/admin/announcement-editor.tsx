"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertContainer, AlertContent, AlertDescription, AlertHeading, AlertTrigger } from "@wanteddev/wds";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { useActionToast } from "@/components/feedback/use-action-toast";
import { apiMessage } from "@/features/partner/partner-session";
import type { AdminAnnouncement } from "@/server/domain/announcement-service";
import { announcementStatusLabels } from "./announcement-manager";

export function AnnouncementEditor({ announcementId }: { announcementId?: string }) {
  const router = useRouter();
  const showComplete = useActionToast();
  const [saved, setSaved] = useState<AdminAnnouncement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(Boolean(announcementId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!announcementId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/internal/announcements/${announcementId}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "공지를 불러오지 못했어요."));
      setSaved(data); setTitle(data.title); setBody(data.body); setPinned(data.isPinned);
    } catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "공지를 불러오지 못했어요."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [announcementId]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  async function save(status: AdminAnnouncement["status"]) {
    if (pending.current || !title.trim() || !body.trim()) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(saved ? `/api/internal/announcements/${saved.id}` : "/api/internal/announcements", {
        method: saved ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, isPinned, ...(saved ? { status, expectedVersion: saved.version } : { id: requestId.current }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "저장하지 못했어요. 입력한 내용은 유지돼요."));
      const completion = data.status === "PUBLISHED"
        ? saved?.status === "PUBLISHED" ? "공지 수정이 완료되었습니다." : "공지사항이 공개되었습니다."
        : data.status === "HIDDEN" ? "공지사항을 숨겼습니다." : "초안 저장이 완료되었습니다.";
      showComplete(completion);
      if (!saved) router.replace(`/internal/announcements/${data.id}`, { scroll: false });
      setSaved(data); setTitle(data.title); setBody(data.body);
      setMessage(data.status === "PUBLISHED" ? "공개했어요. 사용자 공지사항에 반영됐어요." : data.status === "HIDDEN" ? "숨겼어요. 사용자 목록에 표시되지 않아요." : "초안을 저장했어요. 준비되면 공개해 주세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했어요."); }
    finally { pending.current = false; setBusy(false); }
  }
  function changeDeleteOpen(open: boolean) {
    if (pending.current) return;
    setDeleteError("");
    setDeleteOpen(open);
  }
  async function remove() {
    if (!saved || pending.current) return;
    pending.current = true; setBusy(true); setDeleteError("");
    try {
      const response = await fetch(`/api/internal/announcements/${saved.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: saved.version }),
      });
      if (!response.ok) throw new Error(apiMessage(await response.json(), "삭제하지 못했어요. 다시 시도해 주세요."));
      showComplete("공지사항이 삭제되었습니다.");
      setDeleteOpen(false);
      router.replace("/internal/announcements");
    } catch (caught) { setDeleteError(caught instanceof Error ? caught.message : "삭제하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  const valid = title.trim().length > 0 && body.trim().length > 0;
  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-12 pt-4 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[640px]">
    <PageHeader title={saved || announcementId ? "공지 수정" : "새 공지 작성"} backHref="/internal/announcements" />
    {loading ? <CourtRallyLoader className="mt-8" label="공지를 불러오고 있어요." /> : null}
    {error ? <div role="alert" className="mt-5 rounded-xl bg-[var(--tm-status-error-bg)] p-4 text-sm leading-6 text-[var(--tm-status-error-text)]">{error}{announcementId && !saved ? <Button size="small" className="mt-3" onClick={() => void load()}>다시 불러오기</Button> : null}</div> : null}
    {!loading && (!announcementId || saved) ? <>
      <div className="mb-5 mt-5 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--tm-action-primary)]">{announcementStatusLabels[saved?.status ?? "DRAFT"]}</span><button type="button" aria-pressed={preview} className="min-h-11 px-3 text-sm font-semibold text-[var(--tm-action-primary)]" onClick={() => setPreview(value => !value)}>{preview ? "편집으로 돌아가기" : "미리보기"}</button></div>
      {preview ? <article className="rounded-2xl bg-white p-5"><p className="mb-3 text-xs text-[var(--tm-text-secondary)]">사용자에게 보이는 내용</p>{isPinned ? <span className="text-xs font-semibold text-[var(--tm-action-primary)]">중요</span> : null}<h2 className="mt-2 break-words text-xl font-bold leading-8">{title || "제목을 입력해 주세요"}</h2><p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7">{body || "내용을 입력해 주세요"}</p></article> : <fieldset disabled={busy} className="space-y-5">
        <div><label htmlFor="notice-title" className="text-sm font-semibold">제목</label><input id="notice-title" className="rally-input mt-2 w-full rounded-xl border border-[var(--tm-border-default)] bg-white p-3 text-base" value={title} onChange={event => { setTitle(event.target.value); setMessage(""); }} maxLength={120} required autoComplete="off" /><p className="mt-1 text-right text-xs text-[var(--tm-text-secondary)]">{title.length}/120</p></div>
        <div><label htmlFor="notice-body" className="text-sm font-semibold">내용</label><textarea id="notice-body" className="rally-input mt-2 min-h-[260px] w-full resize-y rounded-xl border border-[var(--tm-border-default)] bg-white p-4 text-base leading-7" value={body} onChange={event => { setBody(event.target.value); setMessage(""); }} maxLength={2000} required /><p className="mt-1 text-right text-xs text-[var(--tm-text-secondary)]">{body.length}/2000</p></div>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-5 accent-[var(--tm-action-primary)]" type="checkbox" checked={isPinned} onChange={event => { setPinned(event.target.checked); setMessage(""); }} />중요 공지로 상단에 고정</label>
      </fieldset>}
      <p className="mt-5 text-xs leading-6 text-[var(--tm-text-secondary)]">{saved?.status === "PUBLISHED" ? "저장하면 공개 중인 공지 내용이 바로 바뀌어요." : "공개하기 전에는 사용자에게 보이지 않아요."}</p>
      {message ? <p role="status" className="mt-4 rounded-xl bg-[var(--tm-bg-subtle)] p-3 text-sm leading-6 text-[var(--tm-action-primary)]">{message}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3"><Button fullWidth disabled={busy || !valid} onClick={() => void save(saved?.status ?? "DRAFT")}>{busy ? "저장 중…" : saved?.status === "PUBLISHED" ? "수정하고 공개 유지" : saved?.status === "HIDDEN" ? "숨김 상태로 저장" : "초안 저장"}</Button>
        {saved && saved.status !== "PUBLISHED" ? <Button fullWidth variant="secondary" disabled={busy || !valid} onClick={() => void save("PUBLISHED")}>공개하기</Button> : null}
        {saved?.status === "PUBLISHED" ? <Button fullWidth variant="secondary" disabled={busy || !valid} onClick={() => void save("HIDDEN")}>사용자 목록에서 숨기기</Button> : null}
      </div>
      <Link href="/internal/announcements" className="mt-5 block py-3 text-center text-sm text-[var(--tm-text-secondary)]">공지 목록으로</Link>
      {saved ? <div className="mt-5 border-t border-[var(--tm-border-default)] pt-4">
        <Alert open={deleteOpen} onOpenChange={changeDeleteOpen}>
          <AlertTrigger><button type="button" disabled={busy} className="min-h-11 w-full rounded-xl px-3 text-sm font-semibold text-[var(--tm-status-error-text)] disabled:opacity-50">공지 삭제</button></AlertTrigger>
          <AlertContainer disableOutsideClickClose={busy} disableEscapeKeyDownClose={busy} sx={{ width: "calc(100vw - 40px)", maxWidth: 360, borderRadius: 24 }}>
            <AlertContent>
              <AlertHeading>공지사항을 삭제할까요?</AlertHeading>
              <AlertDescription><strong className="mb-2 block break-words font-semibold text-[var(--tm-text-primary)]">{saved.title}</strong>사용자 목록과 관리 목록에서 삭제되며, 복구할 수 없어요.</AlertDescription>
              {deleteError ? <p role="alert" className="mt-3 text-sm leading-6 text-[var(--tm-status-error-text)]">{deleteError}</p> : null}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Button fullWidth variant="neutral" disabled={busy} onClick={() => changeDeleteOpen(false)}>취소</Button>
                <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-[52px] rounded-[14px] bg-[var(--tm-status-error-text)] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "삭제 중…" : "삭제하기"}</button>
              </div>
            </AlertContent>
          </AlertContainer>
        </Alert>
      </div> : null}
    </> : null}
  </div></main>;
}

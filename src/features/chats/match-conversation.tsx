"use client";

import { ActionArea, ActionAreaButton, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalHeading, ModalNavigation, ModalSummary } from "@wanteddev/wds";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { matchScheduleText } from "@/matches/schedule";

type Conversation = {
  match: { id: string; title: string; startsAt: string; endsAt: string; status: string };
  status: "OPEN" | "READ_ONLY" | "ARCHIVED";
  canSend: boolean;
  sendingSuspended: boolean;
};

type Message = {
  id: string;
  type: "USER" | "SYSTEM";
  body: string;
  isHidden: boolean;
  isMine: boolean;
  sender: { nickname: string } | null;
  images?: { id: string }[];
  createdAt: string;
  pending?: boolean;
};

type SelectedImage = { id: string; file: File; previewUrl: string };

type LastSentMessageRead = { messageId: string; unreadOtherMemberCount: number };

type MessagesResponse = {
  items: Message[];
  pageInfo: { hasMoreBefore: boolean; nextBefore: string | null; latestCursor: string | null };
  lastSentMessageRead: LastSentMessageRead | null;
};

const reportReasons = [
  ["HARASSMENT", "괴롭힘"],
  ["SEXUAL_OR_HATEFUL_CONTENT", "성적·혐오 표현"],
  ["PERSONAL_INFORMATION", "개인정보 노출"],
  ["SPAM_OR_FRAUD", "스팸·사기"],
  ["OTHER", "기타"],
] as const;

const maxChatImages = 3;
const maxChatImageBytes = 5 * 1024 * 1024;
const chatImageTypes = ["image/jpeg", "image/png", "image/webp"];

function apiMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

function schedule(startsAt: string, endsAt: string) {
  return matchScheduleText(startsAt, endsAt);
}

function messageTime(createdAt: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(createdAt));
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id.localeCompare(right.id));
}

export function MatchConversation({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [lastSentMessageRead, setLastSentMessageRead] = useState<LastSentMessageRead | null>(null);
  const latestCursor = useRef<string | null>(null);
  const nextBeforeCursor = useRef<string | null>(null);
  const lastMessageId = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const [canLoadOlderMessages, setCanLoadOlderMessages] = useState(false);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => () => {
    selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const markRead = useCallback(async (messageId: string) => {
    try {
      await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) });
    } catch { /* Read markers are an internal convenience and never block chat. */ }
  }, [matchId]);

  const fetchMessages = useCallback(async (mode: "initial" | "after" | "before") => {
    const cursor = mode === "after" ? latestCursor.current : mode === "before" ? nextBeforeCursor.current : null;
    const suffix = cursor ? `?${mode === "before" ? "before" : "after"}=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/messages${suffix}`, { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(apiMessage(body, "메시지를 불러오지 못했어요."));
    const data = body as MessagesResponse;
    if (mode === "initial") setMessages(data.items);
    else if (data.items.length > 0) setMessages((current) => mergeMessages(current, data.items));
    setLastSentMessageRead(data.lastSentMessageRead);
    if (mode !== "before") latestCursor.current = data.pageInfo.latestCursor ?? latestCursor.current;
    if (mode === "initial" || mode === "before") {
      nextBeforeCursor.current = data.pageInfo.nextBefore;
      setCanLoadOlderMessages(data.pageInfo.hasMoreBefore);
    }
    const messageId = mode === "before" ? null : data.items.at(-1)?.id ?? lastMessageId.current;
    if (messageId && messageId !== lastMessageId.current) {
      lastMessageId.current = messageId;
      void markRead(messageId);
    }
  }, [markRead, matchId]);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "채팅방을 불러오지 못했어요."));
      setConversation(body as Conversation);
      await fetchMessages("initial");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "채팅방을 불러오지 못했어요.");
    }
  }, [fetchMessages, matchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!conversation) return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await fetchMessages("after");
        setPollError("");
      } catch (caught) {
        setPollError(caught instanceof Error ? caught.message : "새 메시지를 불러오지 못했어요.");
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 5_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [conversation, fetchMessages]);

  const selectImages = (files: FileList | null) => {
    if (!files || sending) return;
    const available = maxChatImages - selectedImages.length;
    if (available <= 0) {
      setPollError("사진은 한 번에 3장까지 보낼 수 있어요.");
      return;
    }
    const candidates = [...files];
    const invalid = candidates.find((file) => !chatImageTypes.includes(file.type) || file.size < 1 || file.size > maxChatImageBytes);
    if (invalid) {
      setPollError("사진은 JPEG, PNG, WebP 형식의 5 MiB 이하 파일만 보낼 수 있어요.");
      return;
    }
    const accepted = candidates.slice(0, available).map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) }));
    if (candidates.length > available) setPollError("사진은 한 번에 3장까지 보낼 수 있어요.");
    setSelectedImages((current) => [...current, ...accepted]);
  };

  const removeSelectedImage = (imageId: string) => {
    if (sending) return;
    setSelectedImages((current) => {
      const image = current.find((item) => item.id === imageId);
      if (image) URL.revokeObjectURL(image.previewUrl);
      return current.filter((item) => item.id !== imageId);
    });
  };

  const discardUploadedImages = async (imageUploadIds: string[]) => {
    await Promise.all(imageUploadIds.map(async (imageUploadId) => {
      try {
        await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/image-uploads/${encodeURIComponent(imageUploadId)}`, { method: "DELETE" });
      } catch { /* Pending image cleanup is retried by the server after 24 hours. */ }
    }));
  };

  const send = async () => {
    const body = draft.trim();
    const imagesToSend = selectedImages;
    if ((!body && imagesToSend.length === 0) || !conversation || !conversation.canSend || sending) return;
    const clientRequestId = crypto.randomUUID();
    let temporary: Message | null = null;
    const imageUploadIds: string[] = [];
    setSending(true);
    try {
      for (const image of imagesToSend) {
        const formData = new FormData();
        formData.set("file", image.file);
        const uploadResponse = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/image-uploads`, { method: "POST", body: formData });
        const uploadBody: unknown = await uploadResponse.json();
        if (!uploadResponse.ok || typeof uploadBody !== "object" || uploadBody === null || !("id" in uploadBody) || typeof uploadBody.id !== "string") {
          throw new Error(apiMessage(uploadBody, "사진을 올리지 못했어요."));
        }
        imageUploadIds.push(uploadBody.id);
      }
      temporary = { id: `pending-${clientRequestId}`, type: "USER", body, isHidden: false, isMine: true, sender: null, images: [], createdAt: new Date().toISOString(), pending: true };
      setMessages((current) => [...current, temporary!]);
      setDraft("");
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, imageUploadIds, clientRequestId }) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(result, "메시지를 보내지 못했어요."));
      setMessages((current) => mergeMessages(current.filter((item) => item.id !== temporary!.id), [result as Message]));
      imagesToSend.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setSelectedImages([]);
      await fetchMessages("after");
    } catch (caught) {
      if (temporary) setMessages((current) => current.filter((item) => item.id !== temporary!.id));
      if (imageUploadIds.length > 0) void discardUploadedImages(imageUploadIds);
      setPollError(caught instanceof Error ? caught.message : "메시지를 보내지 못했어요.");
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-center text-[var(--tm-text-primary)]">{error ? <section><p>{error}</p><Button className="mt-4" onClick={() => void load()} size="medium">다시 불러오기</Button><Link className="ml-3 text-sm font-semibold text-[var(--tm-action-primary)]" href="/chats">채팅 목록</Link></section> : <CourtRallyLoader label="채팅방을 준비하고 있어요." />}</main>;

  return (
    <main className="flex min-h-svh flex-col bg-[var(--tm-bg-page)] text-[var(--tm-text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--tm-border-default)] bg-white/95 px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-[560px] items-center gap-2">
          <BackButton className="grid size-11 place-items-center rounded-full text-xl" fallbackPath="/chats" />
          <div className="min-w-0"><h1 className="truncate text-base font-bold">{conversation.match.title}</h1><p className="mt-0.5 truncate text-xs text-[var(--tm-text-secondary)]">{schedule(conversation.match.startsAt, conversation.match.endsAt)}</p></div>
        </div>
      </header>
      <section aria-live="polite" className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pb-44 pt-5">
        {conversation.status === "READ_ONLY" ? <p className="rounded-2xl bg-[var(--tm-bg-subtle-muted)] px-4 py-3 text-center text-sm leading-6 text-[var(--tm-text-secondary)]">이 채팅방은 읽기 전용이에요. 기존 안내만 확인할 수 있어요.</p> : null}
        {pollError ? <button className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-left text-sm text-[var(--tm-status-error-text)]" onClick={() => void fetchMessages("after")} type="button">{pollError} · 다시 불러오기</button> : null}
        {canLoadOlderMessages ? <button className="mx-auto mt-4 min-h-10 rounded-full border border-[var(--tm-border-default)] bg-white px-4 text-xs font-semibold text-[var(--tm-action-primary)]" onClick={() => void fetchMessages("before")} type="button">이전 메시지 불러오기</button> : null}
        {messages.length === 0 ? <div className="grid flex-1 place-items-center py-16 text-center"><div><p aria-hidden="true" className="text-4xl">🎾</p><h2 className="mt-4 text-lg font-bold">첫 안내를 남겨 보세요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">당일 준비물이나 만날 장소를 편하게 조율할 수 있어요.</p></div></div> : <div className="mt-4 space-y-4">{messages.map((message) => <MessageBubble key={message.id} matchId={matchId} message={message} onReport={() => setReportTarget(message)} unreadOtherMemberCount={lastSentMessageRead?.messageId === message.id ? lastSentMessageRead.unreadOtherMemberCount : 0} />)}</div>}
      </section>
      {conversation.canSend ? (
        <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--tm-border-default)] bg-white/95 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-[560px]">
            {selectedImages.length > 0 ? <div aria-label="선택한 사진" className="mb-3 flex gap-2 overflow-x-auto pb-1">{selectedImages.map((image, index) => <div className="relative shrink-0" key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image routes cannot use the server image optimizer. */}
              <img alt={`선택한 사진 ${index + 1}`} className="size-16 rounded-xl border border-[var(--tm-border-default)] object-cover" src={image.previewUrl} />
              <button aria-label={`선택한 사진 ${index + 1} 제거`} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-[var(--tm-text-primary)] text-sm font-bold text-white shadow" disabled={sending} onClick={() => removeSelectedImage(image.id)} type="button">×</button>
            </div>)}</div> : null}
            <div className="flex items-end gap-2">
              <input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={sending} multiple onChange={(event) => { selectImages(event.target.files); event.target.value = ""; }} ref={imageInputRef} type="file" />
              <button aria-label="사진 추가" className="grid size-12 shrink-0 place-items-center rounded-2xl border border-[var(--tm-border-default)] bg-white text-[var(--tm-action-primary)] disabled:opacity-40" disabled={sending || selectedImages.length >= maxChatImages} onClick={() => imageInputRef.current?.click()} type="button">
                <svg aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="18" x="3" y="5" /><circle cx="8.5" cy="10" r="1.25" /><path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17" /></svg>
              </button>
              <label className="sr-only" htmlFor="match-chat-message">메시지</label>
              <textarea className="min-h-12 max-h-28 flex-1 resize-none rounded-2xl border border-[var(--tm-border-default)] bg-white px-4 py-3 text-sm leading-5 outline-none placeholder:text-[var(--tm-text-placeholder)] focus:border-[var(--tm-action-primary)] focus:ring-2 focus:ring-[var(--tm-action-primary)] disabled:bg-[var(--tm-bg-subtle-muted)]" disabled={sending} id="match-chat-message" maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="일정과 준비물을 이야기해요" value={draft} />
              <Button disabled={(!draft.trim() && selectedImages.length === 0) || sending} loading={sending} onClick={() => void send()} size="medium">보내기</Button>
            </div>
            {/* 사진 안내와 글자 수는 필요한 순간에만 나온다. 늘 떠 있으면 매번 읽히는 경고가 되고
                좁은 화면에서 입력창만큼의 자리를 먹는다. */}
            {selectedImages.length > 0 || draft.length >= 400 ? <div className="mt-1 flex items-start justify-between gap-3 text-xs text-[var(--tm-text-secondary)]">
              {selectedImages.length > 0 ? <p>사진은 {maxChatImages}장, 각 5 MiB까지 · 얼굴·연락처·예약번호·위치 정보는 올리지 마세요.</p> : <span />}
              {draft.length >= 400 ? <p className="shrink-0">{draft.length}/500</p> : null}
            </div> : null}
          </div>
        </footer>
      ) : null}
      {reportTarget ? <ReportSheet matchId={matchId} message={reportTarget} onClose={() => setReportTarget(null)} onSubmitted={() => setReportTarget(null)} /> : null}
    </main>
  );
}

function MessageBubble({ matchId, message, onReport, unreadOtherMemberCount }: { matchId: string; message: Message; onReport: () => void; unreadOtherMemberCount: number }) {
  if (message.type === "SYSTEM") return <div className="py-1 text-center"><p className="inline-block rounded-full bg-[var(--tm-bg-subtle-muted)] px-3 py-2 text-xs leading-5 text-[var(--tm-text-secondary)]">{message.body}</p></div>;
  const images = message.images ?? [];
  return <div className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}><div className="max-w-[82%]"><div className="flex items-end gap-2"><div className={`rounded-3xl px-4 py-3 text-sm leading-6 ${message.isMine ? "order-2 bg-[var(--tm-action-primary)] text-white" : "bg-white text-[var(--tm-text-primary)] shadow-[0_3px_10px_rgba(49,94,158,0.07)]"}`}>{images.length > 0 ? <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{images.map((image, index) => <ChatImage imageId={image.id} index={index} key={image.id} matchId={matchId} messageId={message.id} />)}</div> : null}{message.body ? <p className={`${images.length > 0 ? "mt-2" : ""} whitespace-pre-wrap break-words`}>{message.body}</p> : null}{message.pending ? <p className="mt-1 text-right text-[10px] text-white/70">보내는 중</p> : null}</div><time className="shrink-0 text-[10px] text-[var(--tm-text-secondary)]">{messageTime(message.createdAt)}</time></div>{message.isMine && unreadOtherMemberCount > 0 ? <p aria-label={`아직 읽지 않은 상대 ${unreadOtherMemberCount}명`} className="mt-1 text-right text-[11px] font-bold text-[var(--tm-tennis-ball-muted)]">{unreadOtherMemberCount}</p> : null}{!message.isMine && !message.pending ? <button className="mt-1 min-h-8 px-1 text-xs text-[var(--tm-text-secondary)] underline" onClick={onReport} type="button">신고</button> : null}</div></div>;
}

function ChatImage({ matchId, messageId, imageId, index }: { matchId: string; messageId: string; imageId: string; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="grid h-36 min-w-28 place-items-center rounded-2xl bg-[var(--tm-bg-subtle-muted)] px-3 text-center text-xs leading-5 text-[var(--tm-text-secondary)]">사진을 불러오지 못했어요.</div>;
  const src = `/api/v1/matches/${encodeURIComponent(matchId)}/conversation/messages/${encodeURIComponent(messageId)}/images/${encodeURIComponent(imageId)}`;
  // eslint-disable-next-line @next/next/no-img-element -- this authenticated same-origin route cannot be fetched by the server image optimizer.
  return <img alt={`채팅 첨부 사진 ${index + 1}`} className="max-h-72 w-full min-w-28 rounded-2xl object-cover" loading="lazy" onError={() => setFailed(true)} src={src} />;
}

function ReportSheet({ matchId, message, onClose, onSubmitted }: { matchId: string; message: Message; onClose: () => void; onSubmitted: () => void }) {
  const [reason, setReason] = useState<(typeof reportReasons)[number][0]>("HARASSMENT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/conversation/messages/${encodeURIComponent(message.id)}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, description: description || null }) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "신고를 접수하지 못했어요."));
      onSubmitted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "신고를 접수하지 못했어요."); } finally { setSubmitting(false); }
  };
  return <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
    <ModalContainer variant="bottom">
      <ModalNavigation trailingContent={<ModalClose aria-label="신고 창 닫기" disabled={submitting} />} />
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>안전한 채팅</ModalSummary>
          <ModalHeading>메시지를 신고할까요?</ModalHeading>
          <p className="line-clamp-2 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-[var(--tm-text-muted)]">{message.body}</p>
        </ModalContentItem>
        <ModalContentItem>
          <fieldset><legend className="text-sm font-semibold">신고 사유</legend><div className="mt-3 grid gap-2">{reportReasons.map(([value, label]) => <label className={`flex min-h-11 items-center rounded-2xl border px-4 text-sm font-semibold ${reason === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} key={value}><input checked={reason === value} className="sr-only" name="report-reason" onChange={() => setReason(value)} type="radio" value={value} />{label}</label>)}</div></fieldset>
        </ModalContentItem>
        <ModalContentItem>
          <label className="block text-sm font-semibold" htmlFor="chat-report-description">설명 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span></label>
          <textarea className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-[var(--tm-border-default)] bg-white p-3 text-sm outline-none focus:border-[var(--tm-action-primary)]" id="chat-report-description" maxLength={200} onChange={(event) => setDescription(event.target.value)} value={description} />
          <p className="mt-1 text-right text-xs text-[var(--tm-text-secondary)]">{description.length}/200</p>
          {error ? <p className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="neutral">
        <ActionAreaButton buttonColor="assistive" disabled={submitting} onClick={onClose} variant="alternative">돌아가기</ActionAreaButton>
        <ActionAreaButton disabled={submitting} loading={submitting} onClick={() => void submit()} variant="main">신고 접수</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

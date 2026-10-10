"use client";

import { useState } from "react";
import { ServiceComponentsPreview } from "./service-components";
import { WelcomeScreen } from "@/features/profile/welcome-screen";
import { ChoiceList, FormShell, onboardingQuestions } from "@/features/profile/m2-onboarding-flow";
import { ProfileGenderField } from "@/features/profile/profile-gender-field";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { MatchCard, type MatchCardData } from "@/features/matches/m3-match-card";
import { MatchDetailArticle, ApplicationSheet, type Detail } from "@/features/matches/m3-match-detail";
import { PublicSlotCard } from "@/features/partner/partner-session-list";
import type { PublicCourtSlot } from "@/features/partner/partner-session";

const cards: MatchCardData[] = ["한강 테니스 코트", "서울숲 실내 테니스", "망원 테니스장"].map((name, i) => ({
  id:`preview-${i}`, title:name, statusLabel:i === 2 ? "모집 마감" : "모집 중", startsAt:`2026-10-${11+i}T01:00:00.000Z`, endsAt:`2026-10-${11+i}T03:00:00.000Z`,
  court:{source:"EXTERNAL_RESERVED",sourceLabel:"직접 예약", name, address:["서울 마포구 망원동", "서울 성동구 성수동", "서울 마포구 망원동"][i], image:{url:null, sourceLabel:null, fallback:"TENNIS_COURT_ILLUSTRATION"}},
  playPurposes:[{code:"RALLY_PRACTICE",label:"랠리"},{code:"GAME_INTRO",label:"게임 입문"}], gameType:{code:i === 1 ? "MIXED_DOUBLES":"OTHER",label:i === 1 ? "혼복":"기타"}, beginnerWelcome:true, remainingSpots:i === 2 ? 0:2, estimatedFeePerPersonKrw:10000+i*2000, recommendationReasons:[{code:"SIMILAR_RALLY_LEVEL",label:"랠리 수준이 비슷해요"}], isHost:false,
}));
const detail: Detail = {...cards[0], court:{...cards[0].court,source:"EXTERNAL_RESERVED",name:"한강 테니스 코트",address:"서울 마포구 망원동 · 예시 장소", courtNumber:"2번 코트",participationNote:null,usageNote:"운동화와 라켓을 챙겨 주세요."}, recruitment:null,gameType:{code:"OTHER",label:"기타"},settlementAccount:null,totalCourtFeeKrw:null,additionalCostNote:null,introduction:"가볍게 공을 주고받으며 연습해요. 실수해도 괜찮아요. 함께 즐겁게 치실 분을 기다려요!",partnerPreferenceLabel:"천천히 랠리할 수 있는 메이트",host:{nickname:"랠리메이트",tennisProfile:{experienceLabel:"6개월~1년",rallyLevelLabel:"짧은 랠리가 가능해요",gameExperienceLabel:"테니스 게임을 몇 번 해봤어요",playPurposes:cards[0].playPurposes}},contact:null,supplyNotice:null,viewer:{relation:"NONE",canApply:true,applyBlockedReason:null,applicationId:null,applicationStatus:null,tennisProfile:null}};
const slot: PublicCourtSlot = {id:"preview-court",status:"ALLOCATED",statusLabel:"모집 중",statusChangedAt:"2026-10-10T00:00:00Z",startsAt:cards[1].startsAt,endsAt:cards[1].endsAt,guestFeeKrw:18000,maxParticipantCount:4,minParticipantCount:4,gameType:{code:"MIXED_DOUBLES",label:"혼복"},genderCapacity:{male:2,female:2},approvalMode:"OPERATOR",usageNote:null,serviceScope:null,durationMinutes:120,court:{name:"그린사이드 실내 테니스",address:"서울 성동구 · 예시 장소",courtNumber:"1번 코트",region:{code:"preview",name:"서울 성동구"},image:{url:"/images/court-samples/indoor.jpg",sourceLabel:"견본 이미지",fallback:"TENNIS_COURT_ILLUSTRATION"}},session:{matchId:"preview",status:"OPEN",statusLabel:"모집 중",title:"예시",hostNickname:"운영자",recruitCount:4,acceptedCount:2,remainingSpots:2,beginnerWelcome:true,playPurposes:cards[0].playPurposes},availableAction:"APPLY"};
const tabs=["시작","프로필","매칭","상세","코트 매칭","컴포넌트"] as const;
export function DesignPreview() {
 const [tab,setTab]=useState<(typeof tabs)[number]>("시작");
 const [step,setStep]=useState(0); const [selected,setSelected]=useState<Record<number,string[]>>({}); const [gender,setGender]=useState<"MALE"|"FEMALE"|null>(null);
 const [sheet,setSheet]=useState(false); const [message,setMessage]=useState(""); const [sent,setSent]=useState(false);
 const question=onboardingQuestions[step];
 const change=(next:typeof tab)=>{setTab(next);window.scrollTo({top:0});};
 return <><aside className="sticky top-[var(--rally-safe-top)] z-50 border-b border-[var(--tm-border-default)] bg-white px-3 py-2"><p className="text-center text-[10px] text-[var(--tm-text-secondary)]">디자인 미리보기 · 예시 데이터 · 실제 신청/저장 없음</p><div className="mx-auto flex max-w-[560px] flex-wrap justify-center gap-1">{tabs.map(t=><button key={t} type="button" onClick={()=>change(t)} aria-pressed={tab===t} className={`min-h-10 rounded-lg px-3 text-xs ${tab===t?"bg-[var(--tm-action-primary)] text-white":"text-[var(--tm-text-secondary)]"}`}>{t}</button>)}</div></aside>
 {tab==="시작" ? <WelcomeScreen loading={false} onSignIn={()=>change("프로필")} onOperator={()=>change("코트 매칭")} /> : null}
 {tab==="프로필" ? <FormShell step={step+2} onBack={()=>step===0?change("시작"):setStep(step-1)}><h1 className="whitespace-pre-line">{question.title}</h1><p>{question.description}</p><ChoiceList options={question.options} selected={selected[step]??[]} onSelect={v=>setSelected(c=>({...c,[step]:step===3?(c[step]??[]).includes(v)?c[step].filter(x=>x!==v):(c[step]??[]).length<2?[...(c[step]??[]),v]:c[step]:[v]}))} />{step===3?<ProfileGenderField value={gender} onChange={setGender}/>:null}<Button className="mt-8" fullWidth disabled={!selected[step]?.length||(step===3&&!gender)} onClick={()=>step===3?change("매칭"):setStep(step+1)}>{step===3?"나와 맞는 매칭 보기":"다음"}</Button></FormShell>:null}
 {tab==="매칭" ? <main className="mx-auto max-w-[560px] px-5 py-6"><PageHeader title="매칭" actions={<span className="rally-text-action rounded-full bg-[var(--tm-bg-subtle)] px-4">내 매칭</span>} /><div className="my-5 flex gap-2">{["날짜","게임 유형","추천순"].map(x=><span className="rounded-full border border-[var(--tm-border-default)] bg-white px-4 py-2 text-xs" key={x}>{x}⌄</span>)}</div><div className="grid gap-4" onClickCapture={e=>{if((e.target as HTMLElement).closest("a")){e.preventDefault();change("상세");}}}>{cards.map(c=><MatchCard key={c.id} match={c}/>)}</div></main>:null}
 {tab==="상세" ? <main className="pb-28"><MatchDetailArticle detail={detail} returnTo="/design-preview"/><div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-default)] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]"><div className="mx-auto flex max-w-[512px] items-center gap-8"><div><p className="text-xs text-[var(--tm-text-secondary)]">참가비</p><strong className="text-xl">10,000원</strong></div><Button className="flex-1" onClick={()=>setSheet(true)}>같이 치기</Button></div></div>{sheet?<ApplicationSheet detail={detail} message={message} applyError={sent?"미리보기입니다. 실제 신청은 전송되지 않았습니다.":""} alreadyApplied={false} isSubmitting={false} onClose={()=>setSheet(false)} onMessageChange={setMessage} onSubmit={()=>setSent(true)}/>:null}</main>:null}
 {tab==="코트 매칭" ? <main className="mx-auto max-w-[560px] px-5 py-8"><PageHeader title="코트 매칭" description="운영자가 준비한 코트에서 함께 테니스해요." /><div className="mt-7" onClickCapture={e=>{if((e.target as HTMLElement).closest("a"))e.preventDefault();}}><PublicSlotCard slot={slot}/></div><section className="rally-card mt-5 p-5"><p className="rally-eyebrow mb-3">미리보기 설명 · 실제 목록에는 표시하지 않음</p><h2 className="font-bold">참가까지 세 단계</h2><ol className="mt-4 space-y-3 text-sm"><li>01　신청 후 승인 확인</li><li>02　안내된 기한 안에 계좌이체</li><li>03　운영자 입금 확인 후 참가 확정</li></ol><p className="mt-5 text-xs leading-5 text-[var(--tm-text-secondary)]">신청만으로 참가가 확정되지 않아요. 실제 기한과 취소·환불 조건은 경기 상세에서 확인해요.</p></section></main>:null}
 {tab==="컴포넌트" ? <ServiceComponentsPreview /> : null}
 </>;
}

import { LegalNoticePage } from "@/features/legal/legal-notice-page";

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <LegalNoticePage
      returnTo={returnTo}
      title="개인정보 처리방침"
      summary="서비스 제공에 필요한 최소한의 정보만 처리하고, 다른 이용자에게 보여 주는 범위를 분명히 합니다."
      sections={[
        {
          title: "처리하는 정보",
          body: "카카오 계정 식별 정보와 표시명, 닉네임, 테니스 프로필과 성별, 선택 정산 계좌(은행·계좌번호·예금주), 매칭·신청 정보와 서비스 내 채팅 메시지·신고 정보를 서비스 제공과 안전 조치에 필요한 범위에서 처리합니다.",
        },
        {
          title: "이용 목적",
          body: "로그인, 프로필 설정, 비슷한 매칭 추천, 성별별 모집 정원 확인과 신청·수락 처리, 참가자 간 정산 계좌 안내, 서비스 안정성 확인에 사용합니다. 전화번호와 이메일은 다른 이용자에게 공개하지 않습니다.",
        },
        {
          title: "다른 이용자에게 보이는 정보",
          body: "닉네임과 매칭에 필요한 프로필·일정·코트 정보만 상대에게 보여 줍니다. 신청 당시 성별은 해당 신청의 모집자에게 자리 구분을 위해 제공되며 이후 프로필을 변경해도 신청 기록에 유지됩니다. 정산 계좌와 서비스 내 채팅 메시지는 같은 매칭의 모집자와 수락된 참가자에게만 보입니다. 외부 오픈채팅 링크는 수집·저장·표시하지 않습니다.",
        },
      ]}
      notice="현재는 비공개 MVP입니다. 서비스 내 채팅 메시지·신고를 포함한 보관 기간·파기 절차, 개인정보 보호책임자와 문의 채널은 정식 공개 전 운영 안내와 법무 검토로 확정합니다."
    />
  );
}

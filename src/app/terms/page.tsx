import { LegalNoticePage } from "@/features/legal/legal-notice-page";

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <LegalNoticePage
      returnTo={returnTo}
      title="서비스 이용약관"
      summary="Rally On은 테니스 초보자가 함께 칠 사람을 찾고 약속을 조율하도록 돕는 비공개 MVP 서비스예요."
      sections={[
        {
          title: "서비스의 역할",
          body: "Rally On은 매칭 정보를 보여주고 신청·수락을 돕습니다. 이용자 사이의 약속, 실제 플레이, 안전과 분쟁을 대신 보증하거나 중재하지는 않습니다.",
        },
        {
          title: "코트와 비용",
          body: "코트 예약과 비용 정산은 모집자와 참가자가 직접 조율합니다. 수락된 멤버만 들어갈 수 있는 서비스 내 채팅에서 코트와 비용을 함께 정합니다.",
        },
        {
          title: "안전한 이용",
          body: "상대에게 불편함을 주거나 서비스 목적과 다른 이용은 제한될 수 있습니다. 서비스 내 채팅의 부적절한 메시지는 신고할 수 있고, 검토 결과에 따라 메시지 숨김·발신 제한·방 읽기 전용 조치가 이루어질 수 있습니다. 전화번호와 이메일은 공개하지 않습니다.",
        },
      ]}
      notice="현재는 비공개 MVP입니다. 서비스 내 채팅의 메시지·신고 보관 및 파기 기간, 운영 주체, 문의 방법과 신고 처리 기준은 정식 공개 전 법무·운영 검토로 확정해 다시 안내하겠습니다."
    />
  );
}

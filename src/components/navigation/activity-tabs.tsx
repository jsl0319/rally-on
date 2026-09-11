import { Tab, TabList, TabListItem } from "@wanteddev/wds";
import Link from "next/link";

type ActivityTab = "received" | "sent";

// `받은 신청` 화면이 실제로 보여 주는 것은 내가 만든 매칭 목록과 그 관리 버튼이다.
// 매칭을 만든 사람이 "내 매칭 어디서 보지?" 하고 찾을 때 떠오르는 이름으로 둔다.
const tabs: Array<{ id: ActivityTab; href: string; label: string }> = [
  { id: "received", href: "/activity/received", label: "내가 만든 매칭" },
  { id: "sent", href: "/activity/sent", label: "내가 보낸 신청" },
];

export function ActivityTabs({ current }: { current: ActivityTab }) {
  return (
    <Tab value={current}>
      <TabList aria-label="신청 활동 구분" className="mt-5">
        {tabs.map((tab) => (
          <TabListItem as={Link} href={tab.href} key={tab.id} value={tab.id}>
            {tab.label}
          </TabListItem>
        ))}
      </TabList>
    </Tab>
  );
}

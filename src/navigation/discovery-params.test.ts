import { expect, it } from "vitest";
import { readDiscoveryParams, writeDiscoveryParams } from "./discovery-params";

it("목록 날짜·유형·정렬·참여가능 조건을 주소로 왕복 보존한다", () => {
  const sorts = ["recommended", "soonest", "newest"] as const;
  const value = readDiscoveryParams(new URLSearchParams("date=2026-10-20&gameType=MIXED_DOUBLES&sort=newest&availableOnly=true"), sorts, "recommended");
  expect(value).toEqual({ date: "2026-10-20", gameType: "MIXED_DOUBLES", sort: "newest", availableOnly: true });
  expect(readDiscoveryParams(writeDiscoveryParams(new URLSearchParams(), value, "recommended"), sorts, "recommended")).toEqual(value);
});
it("다른 화면의 정렬·폐기된 게임 유형·잘못된 날짜는 기본값으로 처리한다", () => {
  expect(readDiscoveryParams(new URLSearchParams("date=2026-02-30&gameType=SINGLES&sort=recommended&availableOnly=anything"), ["soonest", "priceLow"], "soonest"))
    .toEqual({ date: null, gameType: null, sort: "soonest", availableOnly: false });
});
it("필터 초기화는 다른 목적의 주소 값을 지우지 않는다", () => {
  const value = readDiscoveryParams(new URLSearchParams(), ["soonest"], "soonest");
  expect(writeDiscoveryParams(new URLSearchParams("returnTo=%2Fmy&sort=priceLow&date=2026-10-20&availableOnly=true"), value, "soonest").toString()).toBe("returnTo=%2Fmy");
});

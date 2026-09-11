import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

describe("알림 시각 표기", () => {
  const now = Date.parse("2026-09-11T10:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("최근일수록 사람이 쓰는 말로 답한다", () => {
    expect(relativeTime(ago(30_000), now)).toBe("방금 전");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5분 전");
    expect(relativeTime(ago(3 * 60 * 60_000), now)).toBe("3시간 전");
    expect(relativeTime(ago(30 * 60 * 60_000), now)).toBe("어제");
    expect(relativeTime(ago(4 * 24 * 60 * 60_000), now)).toBe("4일 전");
  });

  it("일주일이 넘으면 날짜로 돌아간다", () => {
    expect(relativeTime(ago(10 * 24 * 60 * 60_000), now)).toBe("9월 1일");
  });

  it("서버와 기기의 시계가 어긋나 미래로 보여도 깨지지 않는다", () => {
    expect(relativeTime(new Date(now + 5_000).toISOString(), now)).toBe("방금 전");
  });
});

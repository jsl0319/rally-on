import { describe, expect, it } from "vitest";
import { formatMatchDate, formatMatchTime, isHalfHourTime } from "./schedule";

describe("match schedule display", () => {
  it("shows the Korean weekday and keeps midnight/noon correct", () => {
    expect(formatMatchDate("2026-09-08")).toBe("2026년 09월 08일 (화)");
    expect(formatMatchTime("00:00")).toBe("오전 12시 00분");
    expect(formatMatchTime("12:30")).toBe("오후 12시 30분");
    expect(formatMatchTime("21:30")).toBe("오후 9시 30분");
  });
  it("allows only real half-hour times", () => {
    for (const time of ["00:00", "12:30", "23:30"]) expect(isHalfHourTime(time)).toBe(true);
    for (const time of ["24:00", "09:15", "09:60", "9:00", ""]) expect(isHalfHourTime(time)).toBe(false);
  });
});

import { firstAvailableMatchTime, isFutureMatchTime, timeSelectionError } from "./schedule";

describe("future match times in Korea", () => {
  const now = Date.parse("2026-09-08T12:15:00+09:00");
  it("rejects past and exact current times and starts at the next half hour", () => {
    expect(isFutureMatchTime("2026-09-08", "09:00", now)).toBe(false);
    expect(firstAvailableMatchTime("2026-09-08", undefined, undefined, now)).toBe("12:30");
    expect(isFutureMatchTime("2026-09-08", "12:30", Date.parse("2026-09-08T12:30:00+09:00"))).toBe(false);
    expect(isFutureMatchTime("2026-09-09", "09:00", now)).toBe(true);
  });
  it("checks the selected date, strict ordering and last available slot", () => {
    expect(timeSelectionError(undefined, "13:00", undefined, undefined, now)).not.toBe("");
    expect(firstAvailableMatchTime("2026-09-08", "13:00", undefined, now)).toBe("13:30");
    expect(firstAvailableMatchTime("2026-09-08", undefined, "12:30", now)).toBeNull();
    expect(firstAvailableMatchTime("2026-09-08", undefined, undefined, Date.parse("2026-09-08T23:30:00+09:00"))).toBeNull();
  });
});

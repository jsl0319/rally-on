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

const KST = "Asia/Seoul";
const matchDayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" });
const matchTimeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit", hour12: true });

/**
 * 매칭 일정을 서비스 어디서나 같은 모양으로 읽히게 한다.
 *
 * 화면마다 제각각 Intl 포맷을 만들어 쓰는 바람에 같은 앱에서 "9월 16일 (수) 오후 7:26"과
 * "9. 21. (월) 19:26–21:26"이 섞여 있었다. 형식이 다르면 같은 정보를 화면마다 새로 읽어야 한다.
 *
 * 끝나는 시각까지 주면 범위로 만든다. 오전·오후가 같으면 뒤쪽은 되풀이하지 않는다.
 */
export function matchScheduleParts(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  const day = matchDayFormat.format(start);
  const startTime = matchTimeFormat.format(start);
  if (!endsAt) return { day, time: startTime };

  const endTime = matchTimeFormat.format(new Date(endsAt));
  const meridiem = (value: string) => value.slice(0, 2);
  return { day, time: `${startTime}–${meridiem(startTime) === meridiem(endTime) ? endTime.slice(2).trim() : endTime}` };
}

/** 한 줄로 쓸 때. 카드처럼 날짜와 시간을 따로 두는 곳은 `matchScheduleParts`를 쓴다. */
export function matchScheduleText(startsAt: string, endsAt?: string | null) {
  const { day, time } = matchScheduleParts(startsAt, endsAt);
  return `${day} ${time}`;
}

export function formatMatchDate(value: string) {
  if (!value) return "날짜를 선택해 주세요";
  const date = new Date(`${value}T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
  const [year, month, day] = value.split("-");
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

export function formatMatchTime(value: string) {
  if (!value) return "시간을 선택해 주세요";
  const [hour, minute] = value.split(":").map(Number);
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시 ${String(minute).padStart(2, "0")}분`;
}

export function isHalfHourTime(value: string) {
  return /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value);
}

export function isFutureMatchTime(date: string, time: string, now = Date.now()) {
  return isHalfHourTime(time) && new Date(`${date}T${time}:00+09:00`).getTime() > now;
}

export function timeSelectionError(date: string | undefined, time: string, afterTime?: string, beforeTime?: string, now = Date.now()) {
  if (!date) return "매칭 날짜를 먼저 선택해 주세요.";
  if (!isFutureMatchTime(date, time, now)) return "현재 시간보다 늦은 시간을 선택해 주세요.";
  if (afterTime && time <= afterTime) return "종료 시간은 시작 시간보다 늦어야 해요.";
  if (beforeTime && time >= beforeTime) return "시작 시간은 종료 시간보다 빨라야 해요.";
  return "";
}

export function firstAvailableMatchTime(date: string | undefined, afterTime?: string, beforeTime?: string, now = Date.now()) {
  for (let step = 0; step < 48; step++) {
    const time = `${String(Math.floor(step / 2)).padStart(2, "0")}:${step % 2 ? "30" : "00"}`;
    if (!timeSelectionError(date, time, afterTime, beforeTime, now)) return time;
  }
  return null;
}

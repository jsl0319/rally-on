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

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

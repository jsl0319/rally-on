const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/**
 * 알림이 언제 왔는지를 사람이 읽는 방식으로 말한다.
 *
 * 목록의 모든 줄에 "9월 11일 오후 7:26"이 붙어 있으면 오늘과 비교하는 일을 사람이 한다.
 * 알림에서 중요한 것은 정확한 시각이 아니라 얼마나 최근 일인지다. 일주일이 넘어가면
 * 그때는 "며칠 전"이 오히려 감이 안 오므로 날짜로 돌아간다.
 */
export function relativeTime(value: string, now = Date.now()) {
  const elapsed = now - new Date(value).getTime();
  if (elapsed < 0 || elapsed < MINUTE) return "방금 전";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}분 전`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}시간 전`;
  if (elapsed < 2 * DAY) return "어제";
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}일 전`;
  return dateFormat.format(new Date(value));
}

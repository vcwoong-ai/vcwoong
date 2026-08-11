import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "2026년 8월 11일 오전 01:20" 형태로 고정 포맷한다.
 *
 * `toLocaleDateString("ko-KR", { hour, minute })`를 그대로 쓰면 서버(Node ICU)는
 * "AM 01:20", 브라우저는 "오전 01:20"을 내서 하이드레이션이 깨진다. 그러면 리액트가
 * 루트 전체를 클라이언트 렌더로 되돌려 SSR 이점이 사라지므로, 오전/오후를 직접
 * 붙여 양쪽이 반드시 같은 문자열을 만들도록 한다. 타임존도 명시해야 서버 UTC와
 * 사용자 로컬 시간이 어긋나지 않는다.
 */
export function formatKoreanDateTime(
  value: string | Date,
  timeZone = "Asia/Seoul"
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  // ICU 버전에 따라 자정을 24로 주기도 한다
  const hour24 = Number(get("hour")) % 24;
  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return (
    `${get("year")}년 ${Number(get("month"))}월 ${Number(get("day"))}일 ` +
    `${meridiem} ${String(hour12).padStart(2, "0")}:${get("minute")}`
  );
}

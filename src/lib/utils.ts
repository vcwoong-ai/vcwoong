import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 한국 표준시 오프셋(UTC+9, 서머타임 없음) */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 한국 시간 기준 "이번 달 1일 00:00"을 UTC Date로 돌려준다.
 *
 * 서버(Vercel)는 UTC로 도는데 사용자는 한국 시간으로 달을 센다. `new
 * Date(y, m, 1)`처럼 서버 로컬 기준으로 계산하면 매월 1일 0~9시(KST)에는
 * 아직 UTC로 지난달이라 지난달 사용량이 함께 집계된다 — 사용자 입장에선
 * 달이 바뀌었는데도 한도가 초기화되지 않은 것으로 보인다.
 */
export function kstStartOfMonth(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const startOfMonthKst = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    1
  );
  return new Date(startOfMonthKst - KST_OFFSET_MS);
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

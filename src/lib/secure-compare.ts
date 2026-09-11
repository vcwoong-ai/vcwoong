import { timingSafeEqual } from "crypto";

/**
 * 타이밍 공격에 안전한 문자열 비교.
 *
 * `a === b`는 일치하지 않는 첫 글자에서 바로 리턴하므로, 응답 시간을 정밀
 * 측정하면 시크릿을 한 글자씩 추론할 수 있다(webhook 시크릿·API 키 비교
 * 등). 길이가 다르면(그 자체로 시크릿 노출은 아님) 바로 false를 반환하고,
 * 길이가 같을 때만 timingSafeEqual로 비교한다.
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * 목록 화면의 초기 조회 상한.
 *
 * 왜 필요한가: 딜·보고서·딜소싱·양식 목록 페이지가 상한 없이 전부
 * 조회하고 있었다(`findMany`에 take 없음). 연관 데이터(documents,
 * reports, sections)까지 함께 실어서, 행이 쌓일수록
 *   1) 쿼리 시간이 선형으로 늘고 — 함수 실행시간 상한(Hobby 60초)을 갉아먹고
 *   2) 서버 컴포넌트가 결과를 통째로 HTML에 직렬화해 페이지 무게도 함께 늘었다.
 *
 * 첫 화면은 여기 정한 개수만 불러오고, 더 있으면 화면에서 "더 보기"로
 * 이어 받는다. 한 화면에서 훑기 좋은 정도이면서, 목록을 여러 번 눌러야
 * 하는 답답함은 피하는 선에서 잡은 값이다.
 */
export const DEALS_PAGE_SIZE = 24;
export const REPORTS_PAGE_SIZE = 24;
export const SOURCING_PAGE_SIZE = 30;
export const TEMPLATES_PAGE_SIZE = 24;

/** 한 번에 불러올 수 있는 최대치 — `?limit=999999` 같은 요청으로 상한을 무력화하지 못하게 한다 */
const MAX_LIST_LIMIT = 300;

/**
 * 목록 페이지의 `?limit=` 검색 파라미터를 안전한 숫자로 바꾼다.
 *
 * "더 보기"를 누르면 limit이 한 페이지 분량씩 커지는 방식이라, 새 API를
 * 만들지 않고 서버 컴포넌트만으로 페이징이 된다(자바스크립트 없이도 동작).
 * 잘못된 값(음수·문자·과도하게 큰 수)이 들어와도 기본값과 상한 안으로
 * 눌러서, 상한 없는 조회로 되돌아가는 일이 없게 한다.
 */
export function resolveListLimit(
  raw: string | string[] | undefined,
  pageSize: number
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < pageSize) return pageSize;
  return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
}

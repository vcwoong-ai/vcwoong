/**
 * 무료 IRR 계산기 — 리드젠 공개 도구.
 *
 * `fund-analytics.ts`의 XIRR과 다른 계산이다: XIRR은 날짜가 불규칙한
 * 실제 현금흐름을 받아 뉴턴법으로 푸는 정밀 계산이고, 이건 "투자금 →
 * N년 뒤 회수금" 단일 왕복 가정의 단순 연복리 환산이다. 공개 리드젠
 * 도구는 입력 3개로 즉시 결과를 보여줘야 하므로 일부러 단순하게 둔다.
 */

export interface SimpleIrrInput {
  investAmount: number; // 억원
  exitAmount: number; // 억원
  years: number;
}

export interface SimpleIrrResult {
  /** null이면 계산 불가(투자금 0 이하, 기간 0 이하 등) */
  irr: number | null;
  multiple: number;
}

export function calculateSimpleIrr(input: SimpleIrrInput): SimpleIrrResult {
  const { investAmount, exitAmount, years } = input;

  if (investAmount <= 0 || years <= 0) {
    return { irr: null, multiple: 0 };
  }

  const multiple = exitAmount / investAmount;

  // 회수금이 0 이하(원금 전손)면 연복리 환산이 정의되지 않는다(-100%로
  // 표기하는 게 더 정직하다 — 음수 배수의 거듭제곱은 실수 범위를 벗어남)
  if (multiple <= 0) {
    return { irr: -1, multiple: 0 };
  }

  const irr = multiple ** (1 / years) - 1;
  return { irr, multiple };
}

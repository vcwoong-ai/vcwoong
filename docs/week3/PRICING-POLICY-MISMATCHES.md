# 3주차 요금·정책 대조 — 사람 승인 대기

2026-10-01, 기준 `133a338` / `codex/week3-onboarding-research`.
코드와 화면의 대조 목록이다. 고객 문구, 금액, 취소·청구·한도 구현은 변경하지 않았다.
실제 Toss 청구/환불, 운영 환경과 외부 약관은 검증하지 않았다.

## 확인한 불일치

| 항목 | 화면 | 코드 근거와 차이 | 사람이 결정할 사항 |
|---|---|---|---|
| 양식 한도의 단위 | `src/app/pricing/pricing-client.tsx:25` — 저장 가능한 양식 수 | `src/lib/quotas.ts:51`은 사용자별 이번 달 생성된 template 레코드를 센다. 총 저장 수를 제한하는 로직이 아니다. 월 경계는 KST다. | 월 생성 한도를 설명할지, 저장 한도 정책을 별도로 둘지. 이번 PR에서 정책·문구 수정 없음. |
| 연간 선택 전달 | 요금 화면에서 연간 선택 후 유료 플랜 CTA | `pricing-client.tsx:150` 링크는 plan만 전달. `register/page.tsx`도 settings에 plan만 전달. `subscription-plans.tsx:43`의 cycle 초기값은 monthly다. 연간 표시에서 가입했어도 설정에서 월간이 기본 선택된다. 청구 API 자체는 cycle을 검사한다. | 연간 선택을 이어갈지, 설정에서 다시 선택하도록 명시할지. 결제 없이 코드로 확인한 연결 차이. |
| 플랜 이름 | `lib/plans.ts`의 Solo | `lib/subscription.ts`와 `lib/payments/toss.ts`는 Solo (Pro). 설정과 결제 표시명에 차이. 가격 차이는 발견하지 못했다. | 고객 표시명 통일 여부. |

## 정책/운영 확인이 필요한 간극

| 항목 | 코드에서 확인한 범위 | 미확인 범위·결정 사항 |
|---|---|---|
| 보고서 월 한도 | `quotas.ts:44–49`: 이번 달 생성된 레코드 중 PENDING 외 상태를 센다. 완료 보고서만 세는 조건이 아니다. | 실패·진행 중 보고서를 어떤 시점부터 차감하는지 고객에게 안내할 기준 승인 필요. 재시도·삭제의 정책 전체는 이번에 검증하지 않음. |
| 섹터 수 | PLAN_LIMITS와 설정의 플랜 설명에 섹터 수가 있다. checkQuota의 action은 report/template뿐이다. | 조사한 소스에서 `.sectors`를 소비하는 제한 로직을 찾지 못했다. 실제 섹터 제한 정책/집행 범위 확인 필요. 에이전트 수와 섹터 수는 같은 개념으로 간주하지 않는다. |
| 반복 청구·기간 | success route는 billingKey 발급 후 한 번 청구하고 activateSubscription을 호출한다. 연간 금액은 월 금액 × 10이다. activateSubscription은 plan/status/billingKey만 갱신한다. | 조사한 소스에서 주기적 chargeBilling 호출·다음 청구일 저장을 찾지 못했다. 외부 자동화/운영 설정은 NOT VERIFIED. 월간/연간 이용 기간·다음 청구일 설명 전 실제 운영 확인 필요. |
| 해지와 잔여 기간/환불 | cancel route → cancelSubscription: 즉시 FREE/CANCELED, billingKey null. 이 경로에는 Toss 환불 요청이 없다. | 즉시 Free라는 화면 문구는 코드와 일치한다. 연간 잔여 기간, 환불 처리, 외부 billingKey 폐기 여부의 고객 안내는 별도 정책 결정·운영 확인 필요. '위약금 없음'을 '자동 환불'로 해석하지 않는다. |

## 일치한 항목과 승인 경계

- PUBLIC_PLANS, PLAN_LIMITS, Toss 금액 정의의 월 가격·보고서 수는 대조한 값이 일치했다.
- 연간 가격 ×10 계산은 공통 helper를 사용한다. 결제 성공 callback의 금액은 서버에서 계산한다.
- 설정에서 즉시 해지 후 Free로 전환한다는 안내는 현재 취소 로직과 일치한다.
- PE 작업공간의 별도 플랜 제한 없음/보고서 월 한도는 VC 대상이라는 FAQ와 조사한 한도 호출 범위는 일치했다.
- 이 목록은 변경 승인 요청의 근거이며 승인 자체가 아니다. 문구 변경은 항목별 사람 승인 후 별도 작업한다. 법률·환불 적법성 판단을 수행한 문서가 아니다.

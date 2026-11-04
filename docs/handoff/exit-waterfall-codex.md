# Codex 작업 지시: 회수 시뮬레이션 기능 붙이기

> 아래 "프롬프트" 블록을 Codex에 그대로 붙여 넣으면 된다.
> 계산 엔진과 테스트는 이미 저장소에 들어 있으므로, Codex가 할 일은 **화면 연결과 테스트 등록**뿐이다.

## 이미 들어 있는 파일 (수정하지 않고 가져다 쓰면 됨)

| 파일 | 내용 |
|---|---|
| `src/lib/exit-waterfall.ts` | 계산 엔진. 순수 함수, DB·AI 호출 없음. `simulateCapTable`, `exitWaterfall`, `exitPayoutCurve` |
| `tools/test-exit-waterfall.ts` | 손계산 기대값 대비 검증 12건. `npx tsx tools/test-exit-waterfall.ts` |

엔진이 계산하는 것:
- 라운드별 캡테이블: 프리머니·투자금 → 주당가격(원 반올림), 신주(주 내림), 포스트머니, 지분율
- SAFE(조건부지분인수) 전환, 옵션풀 확대(프리머니 포함)
- RCPS 청산우선권 분배: 배수, 참가적/비참가적, 참가 상한, 선순위/동순위, 우선권 vs 전환 자동 판정
- 리픽싱: 가중평균·풀 래칫·하한
- **단위는 원** (억원 아님). 화면 입력은 억원으로 받고 `× 1e8` 해서 넘길 것

---

## 프롬프트

```
DealMind 저장소에 회수 시뮬레이션 기능을 붙여줘.

## 배경
- CLAUDE.md 경쟁 분석에 "VCNote가 앞서는 것: 회수 시뮬레이션"이 있다. 이걸 메우는 작업이다.
- 계산 엔진은 이미 있다: src/lib/exit-waterfall.ts (순수 함수, 금액 단위는 원).
  검증 테스트: tools/test-exit-waterfall.ts (12건). 엔진 로직은 수정하지 말고 그대로 써라.
  엔진 버그를 발견하면 고치지 말고 재현 입력과 기대값을 나에게 보고해라.
- src/lib/vc-decision.ts 738행 부근에서 MOIC/IRR이 "Exit 밸류에이션·회수 시점 가정이
  시스템에 없습니다"로 NOT_COMPUTABLE 처리돼 있다. 없는 가정을 지어내지 않는다는 원칙(§16)은 유지한다.

## 할 일 (1단계: DB 스키마 변경 없이)
1. package.json에 "test:exit-waterfall": "tsx tools/test-exit-waterfall.ts" 를 추가하고
   test:all 체인 끝에 npm run test:exit-waterfall 을 붙여라.
2. 딜 상세 화면(src/app/deals/[id]/deal-detail-client.tsx)의 Tabs에 "회수 시뮬레이션" 탭을 추가한다.
   - 새 컴포넌트는 별도 파일(예: src/app/deals/[id]/exit-simulation.tsx, "use client")로 만든다.
   - 입력(억원 단위로 받아서 ×1e8 해서 엔진에 전달):
     a. 기존 주주: 보통주(창업자 등)/스톡옵션/미부여 옵션풀 주식수
     b. 이번 라운드: 프리머니, 우리 펀드 투자금 + 공동투자자, 옵션풀 목표 %,
        우선주 조건(배수, 참가적 여부, 참가 상한, 리픽싱 방식/하한)
     c. 선택: 이전 SAFE, 후속 라운드 가정(프리머니·투자금)
     d. 엑싯 금액, 회수 시점(년), 청산 순위(후속 선순위/동순위)
   - 딜의 investAmount, valuation(억원)이 있으면 초기값으로 채운다.
     valuation이 포스트밸류이므로 프리머니 = valuation - investAmount 로 환산한다.
     값이 없으면 빈칸으로 두고 사용자가 입력하게 한다. 임의의 기본값을 사실처럼 넣지 마라.
   - 출력:
     a. 라운드별 지분율 표 (우리 펀드 지분율 강조)
     b. 엑싯 금액에서 주주별 분배액, 우리 펀드 MOIC(분배액/투자금)
     c. IRR: 회수 시점(년)이 입력되면 src/lib/irr-calculator.ts의 calculateSimpleIrr로 계산
     d. 우선주별 "우선권 행사 / 보통주 전환" 판정 표시
     e. 엑싯 금액별 우리 펀드 회수액 곡선 (exitPayoutCurve 사용, 기존 차트 방식이 있으면 그걸 따름)
     f. 엔진의 warnings 그대로 표시
     g. "입력한 가정 기반 계산이며 계약서 조항에 따라 달라질 수 있음" 면책 문구
3. 저장은 1단계에서 하지 않는다 (DB 스키마 변경 금지). 새로고침하면 초기화되는 게 정상이다.
   vc-decision.ts의 MOIC/IRR NOT_COMPUTABLE 로직도 1단계에서는 바꾸지 않는다.
4. 브랜드 문자열은 BRAND에서 가져오고, shadcn/ui 컴포넌트를 우선 사용한다 (CLAUDE.md 규칙).

## 검증
- npm run test:exit-waterfall, npx tsc --noEmit, npm run lint, npm run test:all, npm run build
- 브라우저에서 딜 상세 → 회수 시뮬레이션 탭: 1440px, 390px 둘 다 가로 스크롤 없이 동작
- 예시 입력으로 손계산과 맞는지 확인:
  창업자 10,000,000주, 프리 40억, 우리 펀드 10억, 1x 비참가적 →
  주당 400원, 우리 지분 20%, 엑싯 30억이면 우리 회수 10억(우선권), 엑싯 100억이면 20억(전환)

## 2단계 (내가 승인하면 별도 PR로)
- 시나리오 저장용 스키마 추가(예: DealExitScenario, JSON 컬럼)
- 저장된 시나리오가 있으면 vc-decision.ts의 MOIC/IRR을 "computed (사용자 입력 가정 기반)"로 표시
- 투심보고서 회수 섹션에 시뮬레이션 결과 표 삽입
DB/env/schema 변경은 내 승인 없이 하지 마라.

## 작업 방식
- 새 브랜치에서 작업하고 main 대상 Draft PR로 올려라. 기존 브랜치는 건드리지 마라.
- docs/PRODUCT-STATUS.md에 이번 작업을 기존 형식대로 기록해라.
```

---

## 참고: 엔진 사용 예

```ts
import { simulateCapTable, exitWaterfall } from "@/lib/exit-waterfall";

const 억 = 1e8;
const { stages, warnings } = simulateCapTable({
  holders: [{ name: "창업자", kind: "common", shares: 10_000_000 }],
  rounds: [
    {
      type: "priced",
      name: "Series A",
      preMoney: 40 * 억,
      investors: [{ name: "우리 펀드", amount: 10 * 억 }],
      pref: { multiple: 1, participating: false, antiDilution: "broad", refixFloorPct: 70 },
    },
  ],
});
const last = stages[stages.length - 1];
const result = exitWaterfall(last, 100 * 억, "stacked");
// result.holders → [{ holder: "우리 펀드", payout: 20억, multiple: 2.0, ... }, ...]
```

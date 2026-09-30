# VC 제품 감사 (2026-09-29)

기준: origin/main `7e1a1c0`(PR #113 병합 직후). PR #97·#98·#99·#100은 모두 origin/main에 병합되어 있음을 `git log`로 확인했다.
이 문서는 코드를 읽고 **실제 화면(Playwright, 1440/390px)을 띄워** 확인한 결과만 적는다. 추정은 적지 않는다.

## 1. VC canonical source-of-truth 지도

| 도메인 | Canonical 구현 | 서버 소스 | 프론트 소비자 | Export 소비자 | 테스트 |
|---|---|---|---|---|---|
| Deal Score | `deal-scoring.ts`(AI 채점) + `deal-scoring-evidence.ts`(결정적 근거 평가) | `GET/POST /api/deals/[id]/score` | `deal-score-radar.tsx`, `ic-review-panel.tsx` | `report-export-common.ts` | `test-deal-scoring` |
| Evidence | `evidence.ts` `traceReportEvidence()` | `GET /api/reports/[id]/evidence` | `report-evidence-panel.tsx`, `ic-review-panel.tsx` | `report-export-common.ts`(claims) | `test-evidence` |
| Contradiction | `vc-decision.ts` `detectContradictions()` / `buildContradictions()` | (decision 내부) | `ic-review-panel.tsx` | `vc-decision-memo.ts` | `test-vc-decision-layer`, `test-vc-contradiction-decision` |
| Drivers | `ic-review.ts` `selectKeyStrengths()` → `vc-decision.ts` | (decision 내부) | `ic-review-panel.tsx` | `vc-decision-memo.ts` | `test-vc-decision-layer` |
| Thesis Breakers | `ic-review.ts` `selectKeyRisks()` + 상충 → `vc-decision.ts` | (decision 내부) | `ic-review-panel.tsx` | `vc-decision-memo.ts` | `test-vc-decision-layer`, `test-vc-contradiction-decision` |
| Missing Information | `vc-decision.ts` `buildMissingInformation()` | (decision 내부) | `ic-review-panel.tsx` | `vc-decision-memo.ts` | 동일 |
| Valuation | `vc-decision.ts` `buildValuationCase()` (Deal.investAmount/valuation만 사용) | `score` GET의 `dealFacts` | `ic-review-panel.tsx` | `vc-decision-memo.ts` | 동일 |
| IC Questions | `ic-questions.ts`(결정적) + `ic-questions-ai.ts`(AI 보강) | `GET /api/reports/[id]/ic-questions` | `ic-questions-panel.tsx`, `ic-review-panel.tsx` | `vc-decision-memo.ts` | `test-ic-questions` |
| Decision | `vc-decision.ts` `buildInvestmentDecision()` + `vc-decision-gate.ts` | (순수 함수) | `ic-review-panel.tsx`(클라이언트에서 같은 함수 호출) | `report-export-common.ts`(서버에서 같은 함수 호출) | `test-vc-decision-layer` |
| Memo | `vc-decision-memo.ts` | — | `ic-review-panel.tsx`(섹션 참조) | `docx-export.ts`, `pptx-export.ts`, `template-generator.ts` | `test-vc-decision-memo` |
| Report | `report-generation.ts`, `section-generation-gate.ts` | `/api/reports/[id]/run` 등 | `report-editor.tsx`, `report-wizard.tsx` | `docx-export.ts` 등 | `test-section-generation-gate` |
| 권한 | `team-access.ts` `dealReadWhere/dealWriteWhere/reportReadWhere` | 모든 라우트 | — | `loadReportForExport` | `test-permissions`, `test-security` |

## 2. 실제 화면에서 확인한 결함

| # | 등급 | 내용 | 조치 |
|---|---|---|---|
| F1 | **P1** (수정됨) | Decision Map에서 "재무 건전성 — 상충"인데 같은 차원이 Investment Driver에서는 "확인됨 · 추가 검증 없이 IC 상정 가능"으로 표시됨. 상충이 결정 레이어에서 숨겨짐 | 엔진 수정(`buildInvestmentDrivers`) + 게이트 규칙 + 회귀 테스트 |
| F2 | **P1** (수정됨) | 상충이 Thesis Breaker·누락 정보·논지 문장·확신도 어디에도 반영되지 않음. PE는 상충을 Breaker/IC 질문으로 올리는데 VC는 빨간 타일 하나뿐 | `buildContradictions()`로 1급 객체화, Breaker/P0 누락정보/논지/확신도 연동 |
| F3 | P1 (수정됨) | 상충 탐지가 각 차원의 `keyEvidence`(최대 3개) claim끼리만 비교 — 상충 claim이 3개 밖이거나 밸류에이션·투자조건 섹션에 있으면 결정 화면에서 사라짐 | 전체 claim 기준 탐지 + 섹션→차원 매핑(`DIMENSION_SECTION_MAP` 재사용) |
| F4 | P1 (수정됨) | 상충 요약이 앞 2개 값만 담음(3번째 이후 값 소실). 기간·단위·원문 위치 없음 | `VCContradiction.values`에 전 값 + 기간/시나리오/문서/위치 |
| F5 | P1 (수정됨) | 상충 상세는 타일의 `title`(마우스 호버)로만 노출 — 모바일·키보드에서 볼 수 없음 | UI: 상충 패널(상시 표시) |
| F6 | P2 (수정됨) | 근거 라벨이 앞 문장을 끌어와 서로 다른 지표가 같은 지표로 묶임("영업이익 -12억원을 기록했다. 현금성자산은" → 영업이익 그룹에 현금 30억이 들어가 **가짜 상충** 생성). 천 단위 콤마("8,000")에서 라벨이 잘려 "000억원…"으로 시작 | `evidence.ts` `labelBefore()` 수정 + 회귀 테스트(변이 검증 완료) |
| F7 | P2 (수정됨) | 같은 공백이 P0와 P1로 중복 표시("시장성 평가를 뒷받침하는 근거" 2회), 항목 제목이 숫자만("8,000억원") | 차원+문구 기준 중복 제거(높은 우선순위만), 제목에 맥락 추가 |
| F8 | P2 (수정됨) | 딜 상세(VC 진입 화면)에 투자 판단이 전혀 없음 — 문서 업로더가 첫 화면 | UI 작업 대상 |
| F9 | P2 (수정됨) | 결정 영역이 11–12px 회색 텍스트 위주, verdict(시그널)가 우측 상단 작은 배지. 그 아래 "자동 품질 점수 32/100"(작성 품질) 빨간 블록이 결정보다 시각적으로 강함 → AI 보고서 생성기 느낌 | UI 작업 대상 |
| F10 | P2 (수정됨 — 저장된 질문이 없으면 같은 결정적 함수로 미리보기를 계산해 결정 이슈에 연결) | IC 질문은 사용자가 "생성"을 누르기 전에는 결정 화면에서 비어 있음(결정적 질문 생성 함수는 존재) | UI 작업 대상(기존 결정적 함수 재사용 가능성 검토) |
| F11 | P3 (수정됨 — 음수 부호를 claim에 보존: 표시(-12억원), 부호만 다른 값 상충 탐지, 자료 대조는 절댓값, 범위/식별자 하이픈 오탐 없음) | `evidence.ts`가 음수 부호를 값에서 분리("영업이익 -12억원" → 값 12). 부호만 다른 상충은 탐지 못 함 | 잔여 리스크로 기록 |

## 3. VC/PE 오염 검사
`grep`으로 VC 파일(`vc-decision*`, `evidence.ts`, `ic-review*`, `deal-scoring*`)이 `lib/pe/`를 import하지 않음, PE가 VC decision을 import하지 않음을 확인한다(최종 보고서에 결과 기재).

## 4. PE 감사(디자인 시스템 기준) — 분류

| 등급 | 항목 | 조치 |
|---|---|---|
| A | "계산 불가"/"데이터 없음" 등 핵심 상태 텍스트가 `text-gray-300`(대비 약 1.5:1) | slate-500(AA)로 수정 |
| B | 준비 상태 배지가 채운 파랑/빨강 알약 — READY가 버튼처럼 보이고 VC와 다른 시각 언어 | 공통 `ReadinessBadge`(StatusBadge) 통일, 카드에서 긴 라벨 압축 |
| B | 재무 모순 경고가 ad-hoc 빨간 텍스트 | 공통 `Callout` |
| B | 12px 미만 글자(약 30곳) | 12px로 |
| C | 사이드바 그라데이션/글로우 | 정리(워크스페이스 그룹핑과 함께) |
| D | PE 정보 구조(탭 9개), 재무 표, 엔진/판정 로직, Committee Pack/Review/Audit | 변경 없음 — 보호 대상 |
| B (후속 수정됨) | PE의 나머지 상태 배지(IC 프로세스/리뷰/Thesis Breaker/DD severity/질문 우선순위 등)가 각자 Badge variant 맵 | 전부 공통 StatusBadge tone 맵으로 통일(variant 맵 0개) |

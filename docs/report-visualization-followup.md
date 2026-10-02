# 보고서 시각화 후속 — 2026-10-02

## 변경 범위

- 기존 보고서를 다시 생성하지 않고 FY-2/FY-1/FY 상대기간 표를 그래프로 표시한다. 모든 기간 열이 상대기간이고 각 행에 단위가 명시된 경우에만 적용한다.
- 기준연도를 추정하지 않으며 그래프에 상대기간 안내를 표시한다. 절대연도/상대기간 혼합, 중복 기간, 추정 연도(E)는 변환하지 않는다.
- 그래프로 변환하지 못한 표에는 접을 수 있는 표시 기준 안내를 제공한다. 원본 표와 미확인·추정 값은 그대로 남는다. AI 재생성이나 DB 쓰기는 하지 않는다.
- 엔진·권한·결제·생성 프롬프트·내보내기 형식 변경 없음.

## 기존 결정 경고 재현 (엔진 변경 중단)

실행: `npx tsx tools/repro-vc-low-confidence-gate.ts`

합성 입력: COMPANY_OVERVIEW의 '임직원 23명', document 근거, confidence LOW, adjacent_sentence 매칭 한 건. 점수는 모든 차원 50, 상충 없음.

실제 결과:
1. buildScoreEvidenceAssessment는 UNSUPPORTED가 아닌 LOW도 supported로 계산해 커버리지 100%, 차원 confidence HIGH를 만든다.
2. buildDecisionDimensions는 HIGH를 VERIFIED로 전달하지만 positiveDrivers에는 HIGH/MEDIUM 근거만 넣는다. 따라서 목록이 빈다.
3. checkVCDecisionGate가 VERIFIED_DIMENSION_WITHOUT_EVIDENCE(team)로 거부한다.

기대하는 안전 원칙: LOW 근거만 있는 차원을 VERIFIED로 표시하지 않는다. 게이트를 우회하거나 LOW를 검증된 근거 목록에 넣어서는 안 된다.

최소 수정 후보: assessment의 근거 커버리지와 근거 확신도를 분리해 LOW만 있는 차원의 confidence가 HIGH로 올라가지 않게 한다. 다만 이는 공통 투자 신뢰도·강점·리스크 선정 정책에 영향을 주므로 이번 프론트 변경에 포함하지 않는다. 별도 승인 후 HIGH/MEDIUM/LOW 혼합 비율, NO_EVIDENCE, 상충, VC/PE shared 회귀를 검증해야 한다.

운영 보고서 경고와 같은 실패 경로를 합성 자료로 재현했으며, 운영 입력 전체를 복사하거나 변경하지 않았다. 재현 스크립트는 현재 결함을 설명하는 진단용이며 test:all의 정상 계약으로 고정하지 않는다.

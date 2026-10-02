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


## 2026-10-02 후속 실제 미리보기 확인

- PR #131 code head `9bee1b4994b7ca48be6cfc75e3cb19f88ab7bb08`, main `9764833`, Draft/open/mergeable 확인.
- 해당 SHA의 Vercel Preview 배포 GswUZs6k5Zjt96g32rPveA8fEKBy: READY. READY 자체를 앱 검증 PASS로 취급하지 않는다.
- 이번 실행 PASS: test:report-table-series, tsc --noEmit, lint, 로컬 SQLite 설정의 optimized build.
- 로컬 서버 시작 재시도는 실행 도구가 blocked by policy로 거부. 상세 사유 미제공. 우회하지 않음.
- 대체 읽기 검증: Preview 공개 데모 로그인 → 대시보드 → 기존 보고서 진입 성공.
- 1440/390에서 보고서 페이지 가로 넘침 없음. 그래프 기준 안내 키보드 Enter 펼치기와 근거 비교표 열기 확인. 브라우저 수집 error 로그 0건.
- 확인한 보고서는 FY+1E 열이 섞이고 매출·영업이익 단위가 없어 그래프 제외가 정상이다. 원본 표와 재생성 불필요 안내를 확인했다.
- NOT VERIFIED: 조건을 충족하는 합성 FY 표의 실제 그래프, 전체 로컬 E2E, 운영 앱에 이번 PR 반영.
- Preview에서 자료·보고서·설정 쓰기, AI 생성, 결제 요청은 하지 않았다. 실제 데이터 화면 캡처/본문은 공개 저장소에 넣지 않는다.
- 기존 LOW 근거 게이트 결함은 별도 Draft PR #132에서 수정했다. #131에 중복 적용하지 않는다.

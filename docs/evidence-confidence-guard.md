# LOW 근거 확신도 보정

## 문제와 결과

문서와 낮은 확신도로 매칭된 claim만 있어도 근거 커버리지가 100%이면 HIGH로 승격됐다.
결정 dimension은 VERIFIED가 되었지만 HIGH/MEDIUM positive driver가 없어
`VERIFIED_DIMENSION_WITHOUT_EVIDENCE`로 게이트가 차단했다.
이제 LOW만 존재하거나 LOW와 UNSUPPORTED만 존재하면 확신도는 LOW다.
점수, claim 수, 커버리지 비율은 그대로다. 근거 있음과 검증 완료를 구분한다.
HIGH/MEDIUM이 포함된 기존 임계값을 전면 재설계하지 않는다.

## 기존 보고서와 동일 입력

`buildScoreEvidenceAssessment`는 새 평가를 보정한다.
`guardStoredWeakEvidence`는 기존 평가의 strongest-first keyEvidence를 사용해
HIGH/MEDIUM으로 잘못 승격된 차원만 보정한다. 원본 객체와 DB는 수정하지 않는다.
점수와 커버리지, 근거 텍스트/위치, 저장된 unresolved 질문을 유지한다.
변경된 확신도에 맞춰 decisionImpact, HIGH_SCORE_LOW_EVIDENCE, IC 위험 요약을 갱신한다.
근거가 비어 있는 VERIFIED snapshot은 보정하지 않고 기존 게이트가 계속 차단한다.

화면 API `/api/reports/[id]/decision`, 목록 `/api/deals/decision-summaries`,
`report-export-common.ts`는 모두 `computeReportDecision`을 사용한다.
저장된 평가 보정은 이 공통 loader 안에 있으며, 최신 문서로 새 평가를 만들고 저장된 점수와 섞지 않는다.
동일 fixture 입력 반복 결과와 원본 불변을 테스트한다. 서로 다른 시점의 운영 요청이
동일 DB snapshot을 읽었다는 보장은 이번 테스트에 포함하지 않는다.

## 검증

- 변경 전 관련 baseline PASS, 새 LOW-only 회귀 테스트 RED 확인, 수정 후 GREEN.
- 새 테스트: 단일/복수 LOW, LOW+UNSUPPORTED, 미매핑 HIGH, HIGH/MEDIUM 혼합 기존 동작,
  저장된 평가의 canonical 경로, 빈 근거 게이트 차단, 동일 입력 결정성, 저장 객체 불변.
- 최종 `npm.cmd run test:all`, `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`: PASS (exit 0).
- build는 `DATABASE_URL=file:./dev.db`와 로컬 전용 인증 secret으로 실행했다. 로컬 로그는 ignored `screenshots/confidence-*.log`에 보관한다.
- 브라우저 E2E·1440/390 화면·운영 런타임: NOT VERIFIED. 이 PR에는 화면 레이아웃 변경이 없다.
- 앞선 로컬 서버 실행 요청은 실행 도구에서 `blocked by policy`로 거부됐다.
  상세 정책 주체·사유는 확인되지 않았으며 다른 시작 방식으로 우회하지 않았다.
- 운영 DB/env/schema/결제 설정 변경, AI·유료 외부 호출 없음.

## 배포

main 기준 `9764833a81a7b0320637c4b7e877f1f7dbdc8465`에서 새 branch로 분리했다.
기존 브랜치를 다시 쓰지 않는다. Draft PR 검토 대상이며 이번 수정의 병합·운영 배포는 별도 승인 후 진행한다.

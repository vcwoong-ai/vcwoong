# DealMind 제품 현황

## 2026-10-02 — 상대기간 그래프·표시 기준 안내 후속

- main `9764833`에서 새 branch `codex/report-visualization-coverage`. 기존 worktree/브랜치 보존.
- FY 상대기간을 원문 그대로 그래프에 표시(단위 필수), 변환할 수 없는 표는 접을 수 있는 표시 기준 안내 제공. 원본·미확인·추정 표기 보존.
- PASS: 표 시리즈 targeted tests, test:all, tsc, lint, optimized build, diff check. 모든 DB 작업은 새 worktree의 SQLite `file:./dev.db`만 사용.
- 1440/390 optimized-build E2E는 검사 코드를 보강했으나 로컬 start가 실행 정책에서 거절되어 **NOT VERIFIED**. 기존 브라우저 결과로 대체하지 않는다.
- 결정 게이트 경고를 LOW 근거 한 건의 합성 입력으로 재현. 신뢰도 판정 변경이 필요하므로 엔진 수정 중단, 최소 수정 후보는 [후속 기록](report-visualization-followup.md)에 정리.
- Draft PR로 검토. 이번 변경의 병합/운영 배포 없음. 이전 시각화 PR #130은 `9764833`으로 병합·운영 READY 확인됨.

## 2026-10-02 — 내부 화면 시각화·사용성 검토

- 새 브랜치 `codex/workspace-ux-reliability`, main `a5796bb` 기준. 기존 브랜치와 회수 시뮬레이션/PE 복구 작업 보존.
- 딜소싱·딜 관리·보고서 상태 분포, 보고서 연도별 표 그래프와 근거 비교표, 목차/바로가기, 생성 단계 안내, 브랜드 심볼 개선.
- 엔진/권한/결제 의미와 schema 변경 없음. 사용자 DB/env/schema 사전 승인 제한 철회는 현재 작업 권한으로 기록하되 계정 통합/삭제 대상을 추정하지 않는다.
- 실제 test:all, 로그인 E2E, 1440/390 사이트 순회 75항목 및 추가 시각화 assertion, tsc/lint/build/diff PASS.
- 앱 읽기 화면 개선이며 출력 파일 그래프와 실 AI/실결제/운영 배포는 포함하지 않는다.
- 변경 상세: [내부 화면 개선](workspace-ux-review.md). 운영 계정·연동 점검 상세는 비공개 로컬 기록으로 보관.

## 2026-10-02 — 통합 배포 전 검증 완료

- 사용자 실행으로 3001 수정 production build HTTP 200 확인. 서버 시작 차단은 해소되었다.
- 실제 수정 build에서 site review 75, paid product 134, login email, PE document text E2E 모두 PASS(exit 0).
  1440/390 화면 및 390/430/768/1024/1440 반응형과 근거 조회 인가/XSS/불변을 확인했다.
- tsc/lint 재실행 PASS. 앞 단계 test:all/build PASS. 결과는 `site-review-release/optimized-result.json`.
- PR #126 code head `01b7f74`의 CI SUCCESS와 preview READY/aliasError null을 직접 확인했다.
  이번 문서 head CI/신규 운영 배포는 별도로 확인한다. 운영 인증 VC·PE는 아직 NOT VERIFIED.
- main은 확인 시점 `b919e5d`. 기존 누적 branch와 Claude #121 보존. 운영 DB/env/schema/결제 설정 변경 없음.

## 2026-10-01 — 전체 사이트 검토·통합 배포 요청

- 사용자 “전반적으로 배포 진행해주고, 전체 사이트를 돌아다니며 리뷰진행하고 수정해줘”로
  기존 프로젝트 통합/배포 작업을 승인했다. DB/env/schema/결제 설정 변경은 포함하지 않는다.
- main `b919e5d`, 새 전용 브랜치 `codex/site-review-release`는 #125의 `176cbbf`에서 시작했다.
  #119/#120/#122–#125 누적 변경을 하나의 main 대상 PR로 통합한다. 기존 브랜치를 다시 쓰지 않는다.
  Claude #121과 로그인 파일이 중복하므로 #123의 보강된 구현을 사용하며 #121은 수정하지 않는다.
- 1440/390 사이트 순회: 공개 7개 + 인증 21개 화면, PE 7개 탭, 모바일 키보드 동작 5개 = 75항목 PASS.
  LP 내보내기 버튼 넘침, 모바일 메뉴 Escape/포커스 문제, PE 인쇄 시각 hydration 오류를 수정했다.
- 이번 실제 `test:all`, tsc, lint, 격리 경로 production build PASS.
  production build의 브라우저 E2E는 서버 시작 명령이 자동 승인 검토에서 차단되어 대기 중이다.
  dev E2E PASS를 production E2E PASS로 대신하지 않는다. 운영 인증 화면/배포/aliasError는 아직 NOT VERIFIED.
- 상세 범위와 Before/After: [사이트 검토 기록](site-review-release/README.md).
  아래 기록의 이전 승인/차단 상태는 당시 사실이며 현재 상태는 이 항목을 우선한다.

5축 차별화 기준으로 현재 무엇이 동작하고 무엇이 남았는지 정리한 문서입니다.
다른 환경(예: Claude)에서 작업한 내용과 병합할 때 기준점으로 사용하세요.

## 2026-10-01 — 로컬 서버 복구·최종 메인페이지 E2E

- 사용자 터미널에서 npm.cmd로 loopback 로컬 서버 실행. PowerShell npm.ps1 execution policy 오류였으며
  정책 변경 없이 실행했다. 127.0.0.1:3000 HTTP 200/새 디자인과 Codex 브라우저 화면을 확인했다.
- 최종 local production build에서 landing visual E2E 1440/390 PASS(exit 0), 최종 tsc/lint PASS.
  처음에는 Vercel 전용 Speed Insights script의 로컬 404로 FAIL. 명시적 계측 stub과 실패 URL 진단을 추가 후 재실행 PASS.
  앱 404/console/hydration assertion 삭제·약화 없음. 실제 계측은 NOT VERIFIED.
- 사용자 서버/브라우저 검토 탭을 유지한다. 이전 서버 차단은 해소됐으며 npm.cmd를 사용한다.
  앱/엔진/권한/결제/DB/env/schema 수정 및 운영 배포 없음. 로그인/운영 검증을 이 결과로 대체하지 않는다.
  tools/docs/캡처만 수정해 앱 build/test:all/전체 제품 E2E를 재실행하지 않았다.

## 2026-10-01 — 디자인 방향 승인·통합 준비

- 사용자 “굿 그대로 진행하자”를 메인페이지 시각 구성 방향 승인으로 기록했다. main 병합/운영 배포 승인으로 확대하지 않았다.
- main `b919e5d` 유지, #119–#125 OPEN/Draft/MERGEABLE. 실제 각 head의 CI check/Vercel 체크 SUCCESS 확인.
  #125 확인 기준은 `ed654e2`; 이후 문서 head의 CI PASS로 복사하지 않는다.
- 실제 #121 diff와 #123 변경 파일을 대조했다. auth/register 두 파일 중복이며 #123을 통합할 때 #121 독립 적용을 피해야 한다.
  Claude branch/PR 닫기·수정 없음. 순서와 필요한 새 main 검증은 `INTEGRATION-READINESS.md`.
- 로컬 SQLite/localhost 및 loopback 한정 npm start 모두 자동 승인 검토에서 차단(구체적 이유 미제공).
  현재 서버 종료 상태, 최종 build 브라우저 재검증 NOT VERIFIED. 새 실행 경로로 우회하지 않았다.
- 이번 턴 앱 코드/엔진/권한/결제/DB/env/schema 변경 및 test 재실행 없음. 문서 기록만 수정한다.
  로컬 서버 실행 승인/차단 해소 및 명시적 병합 지시는 남아 있다.

## 2026-10-01 — 메인페이지 시각 구성

- 새 branch `codex/landing-visual-story`, 기준 HEAD `5917ac7` (#124), clean working tree에서 시작.
  main `b919e5d`와 기존 #119–#124 OPEN/Draft를 확인·보존했다. Claude #121/auth 파일 수정 없음.
- Hero의 VC/PE 수치 상충을 큰 수치/비교 막대로, 근거 연결을 문서 → 상충 대조 → IC 질문으로 표시.
  기존 여섯 설명은 키보드로 펼치며 VC/PE 트랙에는 업무 흐름을 추가했다. 합성 예시 표시 유지.
  `page.tsx`/landing 전용 CSS/preview/새 시각 component만 UI 수정. 공통 앱 스타일이나 canonical/API 변경 없음.
  요금·정책·권한·인증·결제·DB/schema/운영 env 변경 없음.
- PASS: `npm run test:landing-visual-e2e` (localhost:3001 dev, 1440/390),
  VC contradiction decision 15개, PE blocker display 14개, PE overview readiness,
  `npx tsc --noEmit`, `npm run lint`, `npm run build` exit 0, `git diff --check`.
  새 도구의 초기 Before는 공개 랜딩에 없는 app-ready marker를 기다려 timeout(도구 오류).
  실제 탭 전환으로 hydration을 확인하도록 수정했고 After 재실행 PASS.
  Before는 직전 전체 제품 E2E 캡처에서 보존했다. `design-review-landing-visual/README.md` 참조.
- build 전 로컬 서버를 정상 종료했다. build 후 `npm run start`가 실행 정책에서 차단되어
  최종 production build 브라우저 E2E/로컬 재시작은 NOT VERIFIED. 현재 localhost 서버 종료 상태.
  다른 실행 경로로 우회하지 않았다. dev에서 실제 화면을 캡처했고 운영 배포는 하지 않았다.
- 이번 test:all/전체 제품 E2E 재실행 및 운영/클라우드 최신 반영/운영 인증은 NOT VERIFIED.
  스타일은 랜딩 전용, VC/PE canonical shared regression PASS. 새 AI/유료 외부 호출 없음.
  후속 Draft PR까지만 진행한다. READY FOR DESIGN REVIEW (저장된 캡처 기준).

## 2026-10-01 — 전체 제품 E2E fixture 보강

- 새 브랜치 `codex/product-e2e-fixtures`, 기준 HEAD `3ad2c3b30825094976463600c21f20ef96697ba8` (#123).
  clean checkout에서 시작. 로그인 보강 및 Claude #121 브랜치를 보존했다. main 변경/병합 없음.
- tools/docs만 수정. 기존 demo 데이터 의존과 전체 rate limit 삭제를 제거하고,
  테스트 전용 사용자·VC 상충/근거 없는 초안·PE 재무/QoE/DD/빈 딜을 생성·정리한다.
  실제 evidence tracing/score assessment와 앱 canonical 경로를 사용한다. 앱·엔진·권한·결제·schema 변경 없음.
- PASS: `npm run test:paid-product-e2e` exit 0, **134개 assertion**.
  실제 가입·빈 상태·소유자 VC/PE·근거 패널·상충·다른 사용자 404,
  390/430/768/1024/1440px의 11개 화면, 기본 접근성 및 suite 기준 console 확인.
  스크린샷은 `design-review-product-e2e/README.md`, 상세 범위는 `PRODUCT-E2E-FIXTURES.md`.
- PASS: `npx tsc --noEmit`, `npm run lint`, `git diff --check`.
  의도적 브라우저 시작 실패(exit 1) 후에도 테스트 사용자 0건, 기존 demo/검토용 로그인 계정 유지: PASS.
  정상 실행 후에도 같은 데이터 보존/정리를 DB에서 확인했다.
- 환경: 정확히 `file:./dev.db` + `http://localhost:3000`, Edge. 외부 브라우저 요청은 204 fixture stub.
  이전 #123의 로컬 production build를 `npm run start`로 제공하며 앱 소스는 이번 브랜치와 동일하다.
  이번 tools/docs 변경에서는 `test:all`/build를 재실행하지 않았다. 이전 결과를 이번 실행으로 세지 않는다.
- NOT VERIFIED: 실제 청구/유료 AI/DART/PDF 원본, PostgreSQL/운영 인증, 클라우드 checkout 최신 반영.
  운영 DB/env/배포 변경 없음. 로컬 검토 계정과 테스트 화면은 유지한다.
  별도 branch push 및 Draft PR까지만 진행하며 사람 디자인 확인/병합은 대기한다.

## 2026-10-01 — 로그인 이메일 충돌 보강

- 사용자 로그인 이메일 수정·테스트 화면 요청에 따라 `codex/login-email-resolution` 생성, base `bb315ea` (#122).
  Claude #121의 head `dbe553b`/OPEN을 재확인하고 해당 브랜치는 보존했다.
- 로그인/가입이 하나의 parameterized case-insensitive lookup을 사용한다. 기존 mixed-case 계정 하나면
  같은 ID/password/role로 로그인. 후보가 여러 개이면 동일 일반 오류로 session을 발급하지 않는다.
  새 가입은 lowercase 저장, 기존 legacy duplicate는 409, concurrent unique race도 409.
  bcrypt/rate limit/JWT/권한/결제/VC/PE 엔진/schema/운영 데이터 변경 없음. 자동 계정 병합·삭제 없음.
- PASS: 새 `test:login-email-e2e` (실제 NextAuth/register HTTP + 1440/390 브라우저), test:all, tsc, lint, diff check.
  기존 계정 데이터 불변, 잘못된 비밀번호/없는 사용자/충돌 사용자 session 없음, concurrent signup 201/409,
  신규 소문자 저장/Free, PE 가입 후 자동 로그인 확인. 로그와 코드 경계는 `LOGIN-EMAIL-REVIEW.md`.
- 초기 build는 기존 Google Fonts 요청의 네트워크 EACCES로 FAIL. 네트워크 허용 실행에서 최종 build PASS(exit 0).
  `npm run start`로 같은 로컬 SQLite/localhost 환경의 테스트 화면을 연다. 운영 배포가 아니다.
  Codex in-app browser에서 실제 소문자 이메일 로그인 후 합성 계정 대시보드 표시를 확인하고 검토 탭을 유지했다.
- 로컬 검토용 합성 ANALYST/Free 계정 하나만 남겼다. 자동 회귀 fixture와 그 IP의 rate limit 기록은 제거했다.
  `seed-login-review-local.ts`는 SQLite만 허용하고 기존 다른 계정을 덮어쓰지 않는다.
- #121과 같은 auth 파일을 수정하는 보강이다. 이 변경 통합 시 #121을 독립적으로 함께 병합하면 안 된다.
  기존 case-colliding 계정의 실제 운영 유무/수동 정리, PostgreSQL 실행/조회 성능, 운영 로그인은 NOT VERIFIED.

## 2026-10-01 — 4주차 검증·접근성·성능

- 새 브랜치 `codex/week4-verification`, 기준 `1de40c4`/PR #120. 기존 working tree clean에서 시작.
  PR #119/#120/#121은 OPEN/Draft임을 GitHub에서 확인했다. Claude auth 파일은 수정하지 않았다.
- 본문 skip link, VC/PE 생성창 설명, 어두운 대시보드 링크 가독성을 개선했다.
  실제 hydration/route content 대기 헬퍼를 만들고 첫 딜·PE 원문 E2E에 적용했다. 검증 삭제/약화 없음.
- PASS: test:all, tsc, lint, build, PE 문서 E2E, 첫 딜 E2E, 신규 접근성 E2E, PE batch 성능 도구, diff check.
  실제 1440/390 키보드/포커스/dialog/넘침 확인. 상세 명령·값·제한은 `design-review-week4/README.md`.
- PE canonical batch loader는 1/10/30건 모두 7쿼리. 빈 입력 0쿼리. 각 딜에 period/line item/DD case를 넣은 합성 데이터다.
  빈 작업공간 SSR HTML 응답 중앙값: dashboard 77.15ms, VC 61.37ms, PE 47.98ms(로컬 dev warm 5회).
  운영 성능·개선율·p95를 뜻하지 않는다. 엔진/DB/권한/결제/수집 구현은 그대로다.
- #121 가입 중복/로그인 충돌 재현을 후속 차단 항목으로 기록했다. 자동 계정 병합이나 운영 데이터 변경 없음.
  사람 디자인/요금·측정 승인, 실제 인터뷰, 운영 인증 검증, 전체 제품 E2E fixture 범위는 여전히 남아 있다.

## 2026-10-01 — 3주차 첫 행동·조사 설계

- 새 브랜치 `codex/week3-onboarding-research`, 시작 HEAD `133a33821b131cb057124d658e02521a60a5711c`, 시작 working tree clean.
  main `b919e5d`, PR #119 OPEN/Draft인 기존 `codex/vc-design-review`를 보존했다. 후속 Draft PR의 base는 그 브랜치다.
  다른 환경의 미커밋 파일을 이 checkout에 가져온 것은 아니다. main 직접 수정/병합, reset/clean/rebase 없음.
- 대시보드 빈 상태에서 첫 행동을 0건 통계보다 앞에 배치. VC/PE 목록의 첫 딜 CTA와 3단계 안내를 추가했다.
  가입 화면의 근거 없는 5분 약속을 제거하고 가입 후 실제 행동을 안내한다. 가입/auth handler와 이동 경로는 그대로다.
  `FirstDealGuide`는 표시 전용이며 판단·한도 계산을 하지 않는다. 기존 create dialog/API를 사용한다.
- 연결: VC 안내 → `/deals` 생성 dialog → `POST /api/deals` → 딜 상세 → 기존 자료 업로드/보고서 생성 → 결정 화면.
  PE 안내 → `/ma-deals` 생성 dialog → `POST /api/ma-deals` → 딜 상세의 재무 · QoE/DART/IC 의사결정.
  API/엔진/권한/결제 파일과 canonical builder/snapshot 입력은 수정하지 않았다. 업로드·준비 상태를 승인/검증 완료로 해석하지 않는다.
- 문서: `week3/PRICING-POLICY-MISMATCHES.md`는 월 생성 vs 저장 한도, 연간 선택 전달, Solo 표시명 차이와 운영 확인 간극을 기록한다.
  요금·설정·청구·취소 문구나 코드 변경 없음. 목록에 대한 사람 승인 대기.
  `week3/MEASUREMENT-DESIGN.md`는 최소 이벤트/14일 raw/90일 집계 등의 제안만 작성. 수집·쿠키·삭제 job 없음.
  `week3/INTERVIEW-GUIDE.md`는 내부 3–5명 관찰형 질문과 기록 양식. 실제 인터뷰는 미실행.
- 실행 환경: `DATABASE_URL=file:./dev.db`, `NEXTAUTH_URL=http://localhost:3000`, 로컬 개발 secret, STORAGE_MODE=local,
  `npm run dev:local`. SQLite만 사용했으며 운영 DB/env/schema/결제 설정에 접근·변경하지 않았다.
  Edge를 `PLAYWRIGHT_EXECUTABLE_PATH`로 지정. 신규 E2E 브라우저의 외부 요청은 차단한다.
- PASS: `npx tsc --noEmit`, `npm run lint`, `npm run test:deal-queue`, `test:pe-overview-readiness`, `test:permissions`, `test:security`.
  `npx tsx tools/test-week3-onboarding-e2e.ts before`와 `npx tsx tools/test-week3-onboarding-e2e.ts` 실행 PASS.
  같은 실행을 위한 `npm run test:week3-onboarding-e2e` script를 추가했다.
  실제 VC/PE 가입 → 안내 이동, Free/청구 키 없음, 두 종류 첫 딜 실제 생성, 자동 보고서 없음,
  1440/390 대시보드·VC/PE 목록의 넘침 없음, Enter/Escape/포커스 복귀, pageerror 없음 확인.
  초기 fixture 정리 FK 오류는 VC deal을 사용자보다 먼저 지우도록 수정 후 전체 재실행 PASS. 남은 해당 테스트 fixture도 제거했다.
- 추가 기존 `npm run test:paid-product-e2e`는 FAIL(전제 fixture 미충족): 처음 PE 예시 없음으로 중단,
  로컬 전용 `npx tsx tools/seed-showcase-local.ts`로 합성 PE 예시 생성 후 네오비전 VC 딜/보고서 없음으로 중단.
  이 suite의 실제 흐름은 **NOT VERIFIED**. 기존 시드를 재설정하거나 테스트를 약화하지 않았다.
  전체 `test:all`, 유료 AI 생성, DART 외부 가져오기, Toss 결제, 인증된 운영 화면, cloud checkout 최신 상태는 이번 작업에서 NOT VERIFIED.
- Before/After 실제 캡처 12개는 `design-review-week3/README.md`에 연결. 디자인/정책 승인 전이다.
  사용자는 이번 작업의 새 브랜치 commit/push와 Draft PR 생성만 승인했고 병합은 금지했다.
- 최종 `npm run build` PASS(55개 static page 생성 완료, exit 0), `git diff --check` PASS.
  READY FOR DESIGN REVIEW. 전체 제품 E2E의 fixture 전제 및 운영 검증은 위와 같이 남아 있다.

## 2026-10-01 — PR #118 승인 병합 및 후속 브랜치 rebase

- 사용자가 PR #118 squash 병합과 후속 rebase/push/Draft PR 생성을 명시적으로 승인했다.
  #118을 ready로 전환하고 승인 대상 head `99885fc` 일치를 확인해 squash 병합했다.
  merge/main SHA `b919e5db52e1474dd245fdbb6fc9ddddf8587a8e`, mergedAt `2026-10-01T02:20:24Z`.
- 기존 `9bd98a5`를 로컬 보존 브랜치 `codex/vc-design-review-pre-rebase-20261001`에 남겼다.
  `git rebase --onto origin/main 99885fc codex/vc-design-review`로 #118 이후 Codex 9개 커밋만 재적용.
  충돌 없음, 결과 `07bd6acddfa30754cc6c6f3911a4f112603a4bde`. rebase 전후 전체 파일 diff 0, 미커밋 작업 없음.
- 운영 배포: `dpl_BEWsmYYbp6Jgzt2Nzrdb1WHjganX`, URL `dealsync-j8tmsqh71-vcwoong.vercel.app`.
  Vercel UI에서 Production/READY, source `b919e5d`, ready 시각 11:23:20 KST, duration 2m52s 확인.
  alias는 `dealmind.space`, `www.dealmind.space`, `dealsync-jade.vercel.app`, `dealsync-git-main-vcwoong.vercel.app`.
  Custom Domains 할당 오류는 화면에 없음. **aliasError API 필드 값은 NOT VERIFIED**:
  연결 앱의 프로젝트 목록은 0개, 해당 배포의 ID/URL 조회는 404. 브라우저 로그인 후 UI 읽기로 확인했다.
- 런타임: 해당 deploymentId 필터, 2026-10-01 11:25 KST의 Last 30 minutes에서
  Warning/Error/Fatal 각 0, 표시된 10개 GET 요청 모두 200, Error 필터 결과 없음.
  11:31 KST 재확인에서도 각 0, 표시된 11개 요청 모두 200.
  기존 cron의 `2026-10-01T02:30:14.413Z` `/api/cron/resume-generations`는 200,
  `tick_end candidates=5 processed=0 elapsed=2.4s`. 이 cron을 직접 실행한 것은 아니다.
  짧은 배포 직후 관찰이며 인증된 운영 VC/PE 흐름 검증을 의미하지 않는다.
  확인 증거는 로컬 `screenshots/post-118-vercel-{ready,errors,runtime}.png`.
- rebase 후 실제 재실행 PASS: `npm run test:all`, `npx tsc --noEmit`, `npm run lint`,
  `test:vc-decision-e2e`, `test:pe-frontend-productization-e2e`, `test:pe-document-text-e2e`,
  `npx tsx tools/test-home-pe-design.ts after` (6 화면, 1440/390, PE 입력 해시 동일).
  fixture SQLite `file:./dev.db`/Edge이며, AI·운영 DB 호출 없음.
  `npm run build`와 build 후 `npx tsc --noEmit`도 PASS. 작업의 dev 서버는 build 전에 종료했다.
- Codex 브랜치를 예상 원격 HEAD `9bd98a5`의 명시적 force-with-lease로 push했다.
  후속 Draft PR #119 (`https://github.com/vcwoong-ai/vcwoong/pull/119`) 생성·연결 완료. 후속 PR은 병합하지 않았다.
  최초 생성 후 check와 Vercel preview는 PENDING이었으며 로컬 PASS와 구분한다.
  운영 DB/env/결제 설정은 변경하지 않았다. main 갱신으로 기존 Git 연동 운영 배포가 발생했다.

## 2026-10-01 — 10월 2주차 첫 구현: PE 파싱 텍스트 조회

- 시작 branch `codex/vc-design-review`, HEAD `bffbecee5f26b61d98d8e5902d227d60e42c5f6e`, clean.
  remote main `a60f465`, 개발 원격 `bffbece`를 확인. PR #118 OPEN/Draft, head `99885fc`, CLEAN;
  #114–117 MERGED 재확인. 타 checkout의 미커밋 변경은 포함하지 않는다. 기존 작업 reset/clean/rebase 없음.
- 실제 PE 데이터룸 Before 1440/390px 확보 후 문서 상세에 명시적 파싱 텍스트 조회를 구현.
  `MaDealDataRoom` → 문서 Dialog → `DocumentSourceText` →
  `GET /api/ma-deals/[id]/documents/[documentId]/text` → 기존 `maDealReadWhere`로 문서/딜/읽기 권한 동시 확인.
  최대 3000자, no-store, URL 미노출, 기존 목록에 parsedText 없음. AI/외부 저장소 호출 없음.
- 근거 발췌·신뢰도·연결된 finding/요청의 값을 보존. 열람과 검증 완료를 구분하고, 미파싱/실패/재시도/다음·이전을 표시.
  문서를 버튼으로 열고 Escape 후 복귀 포커스 지원. 모바일 긴 문자열 내부 넘침을 발견해 줄바꿈 수정.
  원본 PDF/Excel 배치나 보고서 snapshot과 조회 텍스트의 원자적 일치를 보장하지 않는다.
  VC는 documentId 전달 경계를 설계했으며 아직 원문 연결 미구현. 상세 계약 `SOURCE-TEXT-DESIGN.md`.
- 검증 PASS: `test:pe-data-room-view-model`, `test:all`, `test:pe-document-text-e2e`,
  `test:vc-decision-e2e`, `test:pe-frontend-productization-e2e`, typecheck, lint, build, diff check.
  원문 E2E는 소유자/공유 ANALYST/비공개/외부인/다른 딜/동일 404, 응답 상한·입력,
  목록 본문 미포함, XSS 문자열, 재시도, 미파싱, 포커스 trap/복귀, 1440/390 및 DB 문서 불변 검증.
  초기 fixture enum/cleanup 오류와 첫 포커스 복귀 실패를 수정 후 재실행 PASS. 테스트 삭제/약화 없음.
- Before/After는 `docs/design-review-source-text/{before,after}-{1440,390}.png`.
  실행: `npm run dev:local`, 위 repo test scripts, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`.
  환경 SQLite `file:./dev.db`, Edge, 로컬 dev 서버. build 전에 이 작업의 dev 서버를 종료했다.
  새 테스트 fixture는 제거했다. 운영 DB/env/schema/결제/배포 변경 없음.
- Codespace pull/실화면, 운영 인증 스모크, 원본 저장소 접근 정책은 NOT VERIFIED.
  PR 생성/수정・main 병합・production 변경은 미승인. 별도 브랜치 commit/push는 앞선 승인 범위.
- **READY FOR DESIGN REVIEW** — PE 파싱 텍스트 조회 범위.

## 2026-10-01 — Claude 10월 계획 인수

- 사용자 제공 1개월 계획을 읽고 현재 구현과 대조했다. 시작 branch `codex/vc-design-review`, HEAD `79e8bec`, 로컬 clean.
  GitHub main `a60f465`, PR #118 OPEN/Draft・head `99885fc`・mergeStateStatus CLEAN 확인.
  첨부의 CI 횟수・운영 READY・Neon 한도 소진은 과거 보고이며 이번 검증으로 재사용하지 않는다.
- 1주차 첫 구현: VC 근거 현황・투자 근거・논지 훼손 요인・미확인 정보・IC 질문의 화면 표시를 한국어화.
  엔진・필드 ID・memo/export・PE fingerprint・권한・청구를 변경하지 않았다.
- 실행 순서, 운영 읽기 전용 스모크, CRON_SECRET Sensitive 안내, AI 간 파일 담당 경계를 `docs/OCTOBER-EXECUTION.md`에 기록.
  기존 별도 branch commit/push 승인은 유지. PR 생성/수정・main 병합・운영 설정/배포는 미승인.
- typecheck・lint・`npm run test:all`・`test:vc-decision-e2e`・build・diff check PASS.
  VC E2E는 canonical/API/DOCX 연결과 390/430/768/1024/1440px를 검증했다.
  결과는 로컬 SQLite 실행이며 이번 변경의 Codespace pull/실화면 확인은 아직 미실행이다.
- 운영 DB/env・Neon 초기화 날짜・실사용자 검증・자동 일정 실행은 NOT VERIFIED/미설정.

## 2026-10-01 — 프리미엄 투자 데스크 비주얼 고도화

- 랜딩, 로그인 후 대시보드, PE 개요를 딥 네이비·아이보리·브론즈 기반의 하나의 시각 체계로 정리했다.
  랜딩은 제품 미리보기를 어두운 투자 인텔리전스 프레임에 배치하고, CTA·타이포·검토 흐름의 대비를 강화했다.
  대시보드는 투자 데스크 masthead, 떠 있는 지표 카드, VC/PE별 구분선을 적용했다.
  PE 개요는 canonical 검토 요약을 어두운 결정 헤더로, 다음 행동을 별도 아이보리 패널로 강조했다.
- 판정·계산·gate·API·DB 입력은 변경하지 않았다. 수정 범위는 랜딩 TSX와 scoped CSS이며,
  로그인 정규화/복구 커밋 이후의 인증·권한 의미도 그대로다.
- 검증 PASS: `test-home-pe-design.ts after` 1440/390 랜딩·대시보드·PE 6개 경로, 가로 넘침 없음,
  동일 PE 입력 SHA256 `2fc9f9d8f7720403c8bad5d62fe74b5ebe4c8f5eded8f60c83afcc24cd9d4e85`.
  `test:pe-overview-readiness` 9개, `test:deal-queue` 27개,
  `test:pe-frontend-productization-e2e`, `test:vc-decision-e2e`, typecheck, lint, production build PASS.
- 최신 After 캡처는 `docs/design-review-home-pe/after-*` 6개로 갱신했다.
  Claude Code를 병행할 때는 동일 브랜치·동일 파일 동시 편집을 피하고 별도 worktree/branch와 파일 소유 구역을 사용한다.
- **READY FOR DESIGN REVIEW**.

## 2026-10-01 — 메인·PE 디자인 확장 (사용자 후속 요청)

- 인수: `codex/vc-design-review`, 시작 HEAD `c7ebb89c8d3ae7536602663d20fd8f078433b7f7`.
  로컬과 Codespace 모두 clean 확인. 원격 main은 `a60f465f45aa54bc22ef48361308a54169cd6cc4`.
  앞서 승인된 별도 브랜치 commit/push 범위로 이어간다. main·PR·운영 배포는 변경하지 않는다.
- 범위: 첫 화면을 비로그인 `/`와 로그인 `/dashboard` 둘 다 포함해 개선했다.
  랜딩은 큰 논지/근거 헤드라인과 제품 미리보기, 3단계 검토 흐름을 배치했다.
  대시보드는 현황 숫자를 상단에 두고 VC/PE 대기열 제목·회사·다음 행동의 위계를 조정했다.
  PE `/ma-deals/[id]` 개요는 현재 준비 상태와 다음 행동을 분리하고, 차단 요인을 독립 행으로 표시한다.
  재무·실사·위원회 자료 이동 버튼, 재무 근거/검토 준비의 두 구획, 모바일 설명 아래 이동 버튼을 적용했다.
  기존 9개 탭과 모든 기능을 보존했다. 나머지 탭 전체를 새로 디자인한 것은 아니다.
- canonical: 대시보드는 기존 `computeReportDecision` / `loadMaDealListReadinessSummaries` 유지.
  PE는 `loadMaDealIcContext` → 기존 상세 client의 dashboard/readiness builder →
  `MaDealOverview` / `MaDealStatusPanel` 그대로이며 값·gate·financial/QoE/LBO/DD·review/fingerprint/audit 의미 변경 없음.
  같은 fixture의 입력 SHA256 `2fc9f9d8f7720403c8bad5d62fe74b5ebe4c8f5eded8f60c83afcc24cd9d4e85` Before/After 동일.
  독립 API 조회의 원자적 snapshot 보장을 새로 추가한 것은 아니다.
- 수정: 랜딩/대시보드 page, product-preview, dashboard-review-queue, PE detail/overview/status-panel,
  새 scoped CSS 2개, fixture/반응형 검사 `tools/test-home-pe-design.ts`, 기존 유료제품 E2E 헤드라인 기대값과 브라우저 경로 override.
  devcontainer는 기존 데이터 보존 방식으로 PE 예시 딜 seed도 준비한다.
- 검증 PASS: baseline 및 targeted `test:pe-overview-readiness`(9), `test:deal-queue`(27),
  `npm run test:all`, `test:pe-frontend-productization-e2e`, `test:vc-decision-e2e`.
  `test-home-pe-design.ts before/after`: 랜딩/대시보드/PE의 1440·390px 실제 캡처, 가로 넘침 없음,
  PE 다음 행동→재무 탭 및 출처 표시, 랜딩 탭 ArrowRight/Home 조작 확인. 모바일 문장 폭 문제 수정 후 재검사 PASS.
  `npx tsc --noEmit`, `npm run lint`(경고 없음), `node --check .devcontainer/setup.mjs`, `git diff --check` PASS.
- `test:paid-product-e2e`는 전용 시드 `예시 · 한빛정밀 인수 검토`가 없어 setup 단계 FAIL.
  전체 가입/요금/인가 시나리오의 이번 실행은 NOT VERIFIED. 기존 데이터를 재시드하거나 테스트를 약화하지 않았다.
- Before/After: `docs/design-review-home-pe/`의 랜딩·대시보드·PE 1440/390 PNG 12개.
  로그와 첫 화면 캡처는 ignored `screenshots/home-pe-design/`. 로컬 SQLite·예시 데이터만 사용, 유료 AI/운영 DB 접근 없음.
- 최종 `npm run build` PASS (개발 서버 종료 후 실행).
- 클라우드: 구현 커밋 `553fb7b`를 승인된 브랜치에 push하고 기존 Codespace에서 fast-forward했다.
  PE fixture 보존 seed 및 clean 상태 확인. 인증된 대시보드·PE 개요 실화면 확인,
  다음 행동 → 재무·QoE 탭 → 매출 1,000억원/950억원과 각 출처 표시 PASS.
  같은 Private 3000 개발 포트를 사용한다. 전체 테스트·typecheck/lint/build 결과는 로컬 실행 결과이며
  클라우드에서 전체 재실행한 것은 아니다. 운영 배포는 하지 않았다.
- 승인: 사용자 디자인 확인 대기. **READY FOR DESIGN REVIEW**.

## 2026-10-01 — 회사·집 공용 Codespaces 이전 준비

- 사용자가 클라우드 개발환경 1개를 회사·집에서 이어 쓰는 방식을 선택하고, **별도 브랜치 commit/push를 명시적으로 승인**했다.
  이전 디자인 기록의 commit/push 미승인은 이 후속 작업에 한해 갱신됐다. main 병합·PR 변경·운영 배포는 여전히 미승인.
- 대상 브랜치: `codex/vc-design-review`. `.devcontainer/devcontainer.json`은 Node 24 공식 이미지와 3000 포트 전달,
  `.devcontainer/setup.mjs`는 기존 npm scripts를 사용해 개발용 SQLite·예시 계정·VC 대표 화면을 준비한다.
  기존 DB는 재시드하지 않으며 기존 사용자 env는 덮어쓰지 않는다. 임의 운영 키/DB를 가져오지 않는다.
- 회사·집에서 [내 Codespaces](https://github.com/codespaces)의 **같은 Codespace**를 다시 연다. 3000 포트는 Private 유지.
  처음 준비가 끝나면 터미널에서 `npm run dev:local -- --hostname 0.0.0.0` 실행 후 Ports의 3000 링크로 앱에 접속한다.
  대표 route는 `/reports/codex-design-review-report`, 로그인은 기존 seed의 `demo@dealmind.kr` / `Demo1234!` (예시 계정 전용).
  Codespace 중지는 파일을 이어 쓸 수 있지만 삭제는 별개다. 중요한 코드는 commit/push하고 DB 파일은 Git에 넣지 않는다.
- 실제 Before/After 핵심 6개 이미지를 `docs/design-review-2026-10-01/`로 복사하여 클라우드에서도 검토할 수 있게 준비했다.
  원본 스크린샷·로그·로컬 DB는 그대로 보존했다. `test-vc-design-review.ts seed`는 기존 fixture를 보존하며 없는 경우만 생성한다.
- 검증: devcontainer JSON 파싱, `node --check .devcontainer/setup.mjs`, fixture seed 보존 실행, `npx tsc --noEmit`, `git diff --check` PASS.
  아래 후속 실행 기록을 제외한 실제 클라우드 앱 검증은 NOT VERIFIED.
- 후속 실행: GitHub CLI 기기 인증 완료. 커밋 `64634f9dda22f1a0ae3904d30e211f892db4a4ad`를
  `origin/codex/vc-design-review`로 push하고 원격 SHA 일치를 확인했다. main과 PR #118은 변경하지 않았다.
  GitHub 웹에서 기존 Codespaces 0개 및 이번 달 Codespaces 사용 기록 없음을 확인한 후,
  Southeast Asia / 2-core / 위 devcontainer 설정으로 작업 공간 1개를 생성했다.
  공용 개발 작업 공간: https://animated-engine-qv6q9qx597gh6666.github.dev/
  생성 직후 컨테이너 빌드 및 연결 진행을 확인했다. 로컬 SQLite DB와 미커밋 파일을 전송한 것은 아니다.
- 클라우드 검증: `/workspaces/vcwoong`, Node v24.21.0, branch/HEAD 일치 및 clean 상태 확인.
  setup 후 `DATABASE_URL=file:./dev.db npx tsx tools/test-vc-design-review.ts seed`는 기존 fixture 보존 성공.
  `npm run dev:local -- --hostname 0.0.0.0` 실행 성공(Next.js Ready), Ports에서 3000 **Private** 확인.
  예시 계정 로그인 → VC 대표 화면 → 상충 근거 95억/110억 출처 전환 → 새로고침 후 인증/결정 화면 유지 PASS.
  첫 로그인 직후 결정 API 401이 한 번 나타났으며 UI 재시도 후 성공, 이후 새로고침에서는 재현되지 않았다. 원인은 미확정.
  전체 회귀/typecheck/lint/build의 클라우드 재실행은 NOT VERIFIED(앞 절의 로컬 결과와 구분).
  개발 앱: https://animated-engine-qv6q9qx597gh6666-3000.app.github.dev/reports/codex-design-review-report
  회사·집에서 동일 GitHub 계정으로 같은 Codespace를 열고, 서버가 중지됐다면 위 dev 명령을 다시 실행한다.
  운영 DB/env/schema/결제·PR·main·운영 배포 변경 없음. 디자인 승인은 여전히 대기 중이다.

## 2026-10-01 — Codex 로컬 VC 대표 화면 디자인 검토

이번 인수의 실행 기록이다. 아래 과거 섹션의 테스트·운영 상태를 현재 결과로 간주하지 않는다.

- **인수**: 시작 시 `D:\Dealmind`는 빈 폴더였다. 기존 `https://github.com/vcwoong-ai/vcwoong.git`를 clone했다(새 원격 저장소 생성 아님).
  원격 main `a60f465f45aa54bc22ef48361308a54169cd6cc4`, PR #114~#117 병합 확인.
  열린 디자인 PR #118의 `99885fcfcec258c183bb721af11ac06ec1662f5e`를 이어받아 로컬 브랜치 `codex/vc-design-review` 생성, upstream 미설정.
  HEAD는 이 인수 기준점 그대로다. 다른 환경의 미커밋 작업은 새 clone에 포함되지 않으며 외부 Claude 세션의 현재 실행 상태는 미확인이다.
  로컬 앱 목록에서 같은 저장소를 수정 중인 다른 Codex 채팅은 발견되지 않았다. PR #118 원격 브랜치는 수정하지 않았다.
- **자료**: 저장소 `CLAUDE.md`, 본 현황 문서의 최신 작업 기록, 첨부 ZIP의 `01_HANDOVER.md`·`02_DESIGN_BRIEF.md` 확인.
  저장소 내 `AGENTS.md`/`AGENTS.override.md` 없음. 인수인계 문서는 복사하지 않았고 기존 지침도 덮어쓰지 않았다.
- **대표 화면**: 실제 `/reports/[id]` → 로컬 `/reports/codex-design-review-report` (비전AI, **예시 데이터**).
  논지·검토 의견 분리, 상단 상충/필요 자료 바로가기, 상충 값과 가격·회수의 2열 배치,
  투자 근거/논지 훼손 요인 및 미확인 정보/IC 질문을 비교하는 구획으로 개편했다.
  390px에서도 95억원/110억원과 각 출처가 나란히 보인다. 원문 뷰어를 새로 만든 것은 아니다.
  기존 근거 패널에 canonical 근거 상태·검증 한계·키보드 방향키/Home/End 전환을 추가하고 긴 출처명 잘림을 줄였다.
  미확인 정보의 이유·필요 근거·P0 우선순위, 가격/수익의 산출 불가 사유를 유지했다. IC 질문은 8개 제한 없이 모두 표시한다.
  조회 취소와 보고서별 컴포넌트 key로 이전 응답/열린 근거 패널의 잔류를 방어한다.
- **canonical 연결**: `reportReadWhere` → `/api/reports/[id]/decision` + `REPORT_FOR_DECISION_INCLUDE`
  → `computeReportDecision` → `traceReportEvidence` / `buildInvestmentDecision` / `checkVCDecisionGate`
  → `DecisionWorkspace`·기존 근거 패널. Export는 `loadReportForExport` → 같은 `computeReportDecision` → memo.
  React에는 새 계산/판정 엔진 없음. 엔진·API·auth·결제·운영 schema 변경 없음.
  API와 export는 독립 조회이며 원자적인 동일 snapshot을 보장하지 않는다. 이번 고정 fixture에서는 두 loader의 decision을 비교하고
  Before/After 입력 hash와 decision hash가 동일함을 확인했다. 이 검증을 운영 동시성 보장으로 확대하지 않는다.
  입력 SHA256 `5d8232fc95e6d7f4350ca8fa09d135f1e6804b81c170591389c16b66d0d6e336`,
  decision SHA256 `f529bbb89340045126a60720de29c1b03ae6922585868c985709bd065cd0192c`.
- **변경 범위**: `src/app/reports/[id]/report-page-client.tsx`, `src/components/vc/`의
  `decision-workspace.tsx`, `decision-workspace.module.css`(신규), `decision-header.tsx`,
  `decision-sections.tsx`, `contradiction-panel.tsx`, `evidence-panel.tsx`.
  `tools/test-vc-design-review.ts` 신규. 기존 VC decision/parity 및 PE frontend E2E에는 Windows 실행용
  `PLAYWRIGHT_EXECUTABLE_PATH` override만 추가(기존 assertion 삭제/약화 없음). 전역/PE 스타일 변경 없음.
- **격리 실행**: Node 24.15.0 / npm 11.12.1. `npm ci --ignore-scripts --no-audit --no-fund` 후
  `npm_config_script_shell=C:\Program Files\Git\bin\bash.exe`로 기존 `npm run db:setup:local`, `npm run dev:local -- --hostname 127.0.0.1` 실행.
  DB는 `DATABASE_URL=file:./dev.db` → `D:\Dealmind\prisma\dev.db` SQLite뿐이다. 별도 운영 env 파일/API 키 없음.
  최초 DB setup은 Windows Prisma schema engine 오류로 실패했으며, 존재하지 않던 로컬 DB 파일을 빈 파일로 만든 후 동일 스크립트 성공.
  `npm run setup:fonts`는 기존 패키지의 Pretendard 자산을 생성했다(ignored, 폰트 커밋 없음).
- **검증**:
  - 최초 baseline 시도는 Prisma client 생성 전 실행하여 `MODULE_NOT_FOUND`로 실패. 생성 후 VC decision layer(40), contradiction(15), memo(16) PASS.
  - 변경 전 `npm run test:vc-decision-e2e` PASS, 변경 후 동일 targeted 3종 PASS.
  - `npm run test:all` PASS (공유 VC/PE 오프라인 회귀).
  - `npm run test:vc-decision-e2e`, `npm run test:vc-parity-e2e`, `npm run test:pe-frontend-productization-e2e` PASS.
    parity는 상충/다중 값/음수/장문 출처/가격 누락/점수 없음/API 오류/로딩/gate 실패와 API·화면·DOCX의 정합성을 검증했다.
  - `DATABASE_URL=file:./dev.db`, `PLAYWRIGHT_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` 설정 후
    `npx tsx tools/test-vc-design-review.ts before` 및 `after` PASS.
    1440/390 Before, 1440/390/430/768/1024 After: 동일 입력, canonical 논지, 가로 넘침, 양쪽 출처, 키보드 값 전환/포커스 가둠/Escape/복귀 확인.
  - 최종 `npx tsc --noEmit`, `npm run lint`(경고/오류 없음), `npm run build`, `git diff --check` PASS.
    build 전 dev 서버를 종료했다. 이후 `npm run start -- --hostname 127.0.0.1`은 자동 승인 검토가
    `blocked by policy`로 차단(상세 이유 미제공). 따라서 현재 로컬 서버는 중지 상태이며 저장된 실제 화면으로 검토한다.
- **실제 화면/로그**: `screenshots/vc-design-review/` (Git ignored, 로컬 보존).
  `before-1440.png` / `after-1440.png`, `before-390.png` / `after-390.png`,
  `*-workspace.png`, `*-evidence.png`, `after-390-comparison.png`, `snapshot.json` 및 검증 로그.
- **권한/남은 범위**: commit/stage/push/PR 생성·수정/merge/production 배포 없음. 운영 DB/env/schema/결제 변경·유료 AI 호출 없음.
  인증된 Production 앱, PostgreSQL 동시성, 스크린리더 실제 청취·실사용자 디자인 평가는 NOT VERIFIED.
  사용자 디자인 승인 전이며, 다음 단계는 대표 화면 디자인 확인이다. 승인 전 전체 사이트 확장/운영 변경은 하지 않는다.
  최종 상태: **READY FOR DESIGN REVIEW**. tracked 수정 10개, 신규 untracked 코드/테스트 2개, staged 없음.
  스크린샷·로그·로컬 DB·의존성은 ignored 로컬 실행 산출물이며, 인수인계 복사본으로 생긴 untracked는 없다.

## -4. 유료 제품 프론트엔드 개편 — 검토 대기열 · 근거 패널 · 랜딩/요금 (2026-09-30)

엔진(VC 결정 · PE readiness · QoE · LBO · DD · fingerprint · 권한)은 바꾸지 않고 화면의 정보 구조를 바꿨다.

- **디자인 언어**: 앱 배경 #F6F7F9 / 패널 흰색 / 딥 네이비 primary(#244C85) 토큰(`globals.css`, 대비 계산은 주석).
  화면마다 하드코딩된 `bg-blue-600`은 `bg-primary`로 통합. 랜딩·요금·가입도 같은 토큰을 쓴다.
- **VC**: 딜 목록이 검토 대기열(표) — `GET /api/deals/decision-summaries`가 인가된 딜의 최신 보고서를 `computeReportDecision`
  (화면·상세 API·DOCX와 같은 경로)으로 요약. 다음 행동은 상충 → P0 공백 → Thesis Breaker → (권고가 '상정 준비됨'일 때만) 상정.
  근거 패널(`evidence-panel.tsx`): 상충 값·투자 근거의 문서·위치·원문 발췌를 데스크톱은 오른쪽 패널, 모바일은 아래 드로어로.
- **PE**: 개요 첫 블록이 검토 상황·차단 요인·다음 행동. 목록은 차단된 딜 우선 표. 탭은 `?tab=`과 동기.
  엔진 문구는 그대로 두고(바꾸면 위원회 자료 fingerprint가 달라져 완료된 검토가 '재검토 필요'로 뒤집힘)
  `lib/pe/blocker-display.ts`가 표시만 다듬는다(내부 id 제거 · 계정 코드 한국어 · 원→억원 · BLOCKED→차단됨).
- **대시보드**: 인가된 딜만 대상으로 VC 판단 요약과 PE 준비 상태를 나란히(점수를 합치지 않음). 딜이 없으면 VC/PE 첫 행동 안내.
- **랜딩/요금/가입**: 결과물(결정 화면·검토 상황 예시, "예시 데이터" 표기) 중심. 검증되지 않은 주장(10분 생성 · 80% 단축 ·
  가장 많이 선택 · 팀 10명 · 경쟁사 비교표 · 학습 미사용)을 제거. 요금 비교표는 `PLAN_LIMITS`/`hasFeature`에서 읽는다.
  `/register?plan=`은 알려진 유료 플랜만 인정하고 가입 후 구독 영역으로 **이동만** 시킨다(결제 없음).
- **검증 스크립트**: `test:deal-queue`(순수 규칙), `test:pe-blocker-display`, `test:deal-queue-security`(로컬 SQLite + dev 서버,
  권한 필터를 제거하면 실제로 실패하는지 변이 확인), `test:paid-product-e2e`(5개 너비 반응형 포함).
  `tools/seed-showcase-local.ts`는 로컬 SQLite 전용 "예시 데이터" PE 딜을 만든다(원격 DB에서는 즉시 중단).

남은 한계: 실사용자 검증(사용성·전환)은 하지 않았다. 원문 뷰어는 없다(저장된 발췌·위치만 표시). PE 위원회 자료에는
자문사 양식 재현이 없다. 운영 화면은 샌드박스에서 접근할 수 없어 확인하지 못했다(운영 DB는 Neon 월 컴퓨트 한도 소진 상태였음).

## -3. 보고서 생성 checkpoint 자동 재개 — 브라우저 비의존화 (2026-09-11)

기존: `report-generation.ts`가 시간 예산(180초) 소진 시 완성된 섹션까지
저장하고 스스로 멈추면(checkpoint, `Report.status=PENDING`), 그 다음
invocation을 트리거하는 건 **브라우저 폴링뿐**이었다 — 탭을 닫거나
새로고침하면 아무도 이어받지 않아 보고서가 PENDING에 영구히 멈췄다(가장
유력했던 "생성 중 오류" 증상의 실제 원인, 관련 PR #64로 두 UI 화면 모두
자동 재개는 우선 맞춰둠).

이번에 서버 측 안전망을 추가했다:

- `/api/cron/resume-generations`(신규, Vercel Cron 15분 간격(2026-09 Neon 컴퓨트 한도 소진으로 1분에서 변경), `CRON_SECRET`으로
  인증) — PENDING(checkpoint) 또는 오래 멈춘 GENERATING 보고서를 찾아
  **브라우저 없이** `generateSectionsAsync`를 직접 호출해 이어서 생성한다.
- `claimPendingGeneration()`(report-generation.ts, 신규 export) — 브라우저
  트리거(`/run`)와 cron 트리거가 같은 원자적 락(조건부 `updateMany`)을
  공유해, 둘이 동시에 같은 보고서를 재개하려 해도 하나만 성공한다(중복
  생성/토큰 이중 소비 없음).
- `Report.autoResumeCount`(신규 컬럼) — cron은 매 tick이 stateless라
  브라우저의 in-memory `MAX_AUTO_RESUMES`처럼 진행 여부를 메모리로 비교할
  수 없다. 대신 DB에 시도 횟수를 남기고 상한(30)에서 멈춰 무한 재시도를
  막는다.

브라우저 폴링(report-wizard.tsx/report-page-client.tsx)은 그대로 유지 —
탭이 열려 있으면 즉시(수 초 내) 재개돼 더 빠르고, cron은 탭이 없어도
최대 1분 안에 반드시 이어받는 하위 안전망이다. **브라우저는 더 이상
"없으면 생성이 영영 멈추는" 구조적 의존이 아니라 가속 경로다.**

Production 검증 필요(이 세션은 egress 정책상 Production URL 접근 불가):
Vercel 대시보드에서 `CRON_SECRET` env var 설정 확인 + Cron Jobs 탭에서
실제 tick이 도는지, 탭을 닫은 상태에서도 checkpoint된 보고서가 저절로
COMPLETE 되는지.

## -2. VC/PE Track 아키텍처 및 PE Engine 설계 (2026-09-11, 설계만 — 미구현)

Production 전체 감사 결과, 랜딩페이지의 VC/PE·M&A 트랙 선택은 **UI 배지("Coming
soon")뿐** — `prisma/schema.prisma`에 track/PE 관련 필드 0건, `SCORE_DIMENSIONS`도
VC 전용 6개뿐. `/register`도 `?track=` 쿼리를 안 읽음. PE는 코드가 전혀 없다(VC의
복사본도 아닌, 더 이전 단계). 이 섹션은 향후 PE Engine을 실제로 만들 때의 설계
기준점이다 — 이번 라운드에서는 구현하지 않는다.

### 공통 엔진 (이미 도메인 무관하게 설계돼 있어 그대로 재사용)

```
Document → Extraction → Evidence → Analysis → Risk → Questions → IC Review → Decision
```
- document parsing, `evidence.ts`, report generation(`generateSectionsAsync`),
  `ic-questions.ts`, `ic-review.ts`, auth, billing, team-access — 전부 섹터/트랙
  무관. VC 전용 로직이 섞여 있지 않아 PE에도 그대로 얹을 수 있다.

### VC Engine (구현됨)

`SCORE_DIMENSIONS`(marketSize/team/product/businessModel/financials/moat) +
6개 섹터 에이전트. `deal-scoring.ts` → `deal-scoring-evidence.ts` →
`ic-questions.ts` → `ic-review.ts`로 이미 연결돼 있음(Phase 6에서 확인).

### PE Engine (설계만 — 핵심 원칙: AI와 결정론적 계산을 분리)

VC를 복사해서 만들면 안 된다 — PE는 재무 정확성이 생명이라 **IRR/MOIC/LBO
숫자를 AI가 직접 계산하게 두면 안 된다.**

| 계층 | 역할 | 담당 |
|------|------|------|
| AI | 문서에서 숫자·가정 추출, QoE(Quality of Earnings) 후보 식별, 리스크 식별, IC 질문 생성 | 기존 evidence.ts/ic-questions.ts 패턴 재사용 |
| 결정론적 엔진(신규) | EBITDA, FCF, Net Debt, Entry EV, Entry/Exit Multiple, Debt Paydown, IRR, MOIC, Sensitivity, Downside | AI 호출 없는 순수 계산 함수 — deal-scoring-evidence.ts와 같은 성격 |

**재사용 가능 자산**: `fund-analytics.ts`의 Newton-Raphson XIRR 솔버가
불규칙 현금흐름을 처리하므로 LBO IRR 계산의 코어로 재사용 가능. 워터폴
시뮬레이터도 배수×시점 민감도 그리드 로직을 그대로 응용 가능. 반대로
`irr-calculator.ts`(공개 리드젠 도구)는 "투자금 → N년 뒤 단일 회수" 단순
연복리 가정이라 LBO 진입/퇴출 다중 현금흐름 구조에는 **부적합** — 혼동
주의.

**PE 평가 차원(안)**: Business Quality, Revenue Quality, EBITDA, FCF, Net
Debt, Working Capital, Capex, Management, Leverage, Entry Multiple, Exit
Multiple, Debt Paydown, IRR, MOIC, Downside — VC의 6차원과 겹치지 않는
완전히 별도 세트. `SCORE_DIMENSIONS`와 같은 형태(`{key, label, desc}`)로
`PE_SCORE_DIMENSIONS`를 신설하고, `ic-review.ts`의 Investment
Signal/Key Strength/Key Risk 선정 로직은 트랙 무관하게 재사용 가능(입력
차원 배열만 바뀌면 됨 — 코드 자체는 이미 `ScoreDimensionKey` 제네릭하게
설계돼 있어 구조 변경 최소).

**다음 단계(구현 시)**: `/register`가 `?track=` 파라미터를 실제로
읽어 팀/딜 레벨에 track을 저장 → 딜 생성 시 track에 따라
`SCORE_DIMENSIONS` vs `PE_SCORE_DIMENSIONS` 분기 → PE 전용 deterministic
계산 모듈(`src/lib/pe-financials.ts` 등, 신규) 추가. 이번 라운드에서는
코드 작성 안 함.

## -1. VCNote 갭 해소 (2026-08-11 추가)

VCNote 실제 사이트 확인 후 "뒤처진 것"으로 기록했던 항목들을 처리했다.

| 항목 | 상태 | 비고 |
|------|------|------|
| 딜 스코어링 + 레이더 비교 | **동작** — `src/lib/deal-scoring.ts` | 투자 매력도 점수(시장성·팀·제품·사업모델·재무·경쟁우위 6차원), AI 호출. `/deals/[id]` 투자매력도 탭, `/deals/compare`에서 여러 딜 오버레이 비교 |
| 펀드 워터폴·XIRR·회수시뮬레이션·민감도/자본잠식 | **동작** — `src/lib/fund-analytics.ts` | Newton-Raphson XIRR, 유럽식 4단계 워터폴 시뮬레이터, 배수×시점 민감도 그리드, 자본잠식(투자원금 대비 손상) 지표. `/lp-report/[id]/analytics`. AI 호출 없는 순수 계산 |
| DART(공시) 연동 | **동작(API 키 필요)** — `src/lib/dart.ts` | KIPRIS와 같은 패턴: 키 없으면 조용히 빈 결과. `/deals/[id]` 전자공시 탭 |
| 보안 인증 마케팅 | **의도적으로 안 함** | SOC2·ISO27001 등 실제로 받지 않은 인증은 배지로 걸지 않음(허위광고 소지) — 대신 랜딩에 실제 적용된 것만(TLS, 저장 암호화, bcrypt, 팀 권한 분리, 웹훅 서명·레이트리밋) 정직하게 안내 |
| 무료 IRR 계산기 | **동작** — `/irr-calculator` | 로그인 불필요 공개 리드젠 도구. VCNote 자체 예시(10억→50억,5년=38.0%,5.0x)와 동일 결과로 검증 |
| 포트폴리오 관리등급 맵 | **동작** — `/portfolio` 관리등급 맵 뷰 | A~F 등급, 상태 태그(WATCH/RISK)가 MOIC 숫자보다 우선 |
| 딥다이브 검증(보조 리서치) | **동작(API 키 필요)** — `src/lib/deep-dive.ts` | evidence.ts와 반대 방향 — 보고서 핵심 주장(시장 규모·성장률·시장 지위)을 Naver 뉴스·웹 검색으로 "밖에서" 교차 검증 후 AI가 지지/불일치/불명확 판정. `/reports/[id]` 딥다이브 패널. 키(NAVER_CLIENT_ID/SECRET) 없거나 검색 결과 0건이면 항상 "불명확"(데모 모드 시 "데모 모드" 안내) |

한계(정확도 과장 금지):
- 펀드 XIRR/워터폴은 `Fund.paidIn` 총액만 쓴다 — capital call 시점별 이력이 없어 납입 시점 정밀도는 낮다
- 미실현 포지션은 "오늘 시점에 현재가치로 청산했다"고 가정해 XIRR에 포함한다(VC/PE 업계 표준 관행, 실제 회수 아님)
- DART는 API 키가 있어야 실제로 조회되며, 비상장 스타트업 대부분은 애초에 DART에 없는 게 정상이다
- 딥다이브는 정규식으로 뽑은 문장만 검증 대상이다(시장 규모/성장률/시장 지위 패턴에 안 걸리는 주장은 애초에 검증 후보에도 안 오름) — "검증 안 됨"이 아니라 "검증 대상으로도 안 뽑힘"일 수 있음을 구분해야 함

검증: `npm run test:deal-scoring`, `test:fund-analytics`, `test:dart`, `test:irr-calculator`, `test:portfolio-grade`, `test:deep-dive` (전부 `test:all`에 포함, API 키 불필요)

## 0. 수치 근거 추적 (2026-08-11 추가)

| 항목 | 상태 |
|------|------|
| 보고서 수치 ↔ 업로드 자료 대조 | **동작** — `src/lib/evidence.ts` |
| 상태 구분 (문서 확인 / 딜 입력 / 근거 없음) | 동작 |
| 근거 문서명 + 원문 발췌 표시 | 동작 |
| 보고서 화면 패널 | 동작 — `report-evidence-panel.tsx` |
| API | `GET /api/reports/[id]/evidence` (AI 호출 없음, 문자열 대조라 무료) |
| 노이즈 제외 | 연도·항목번호·NCT 식별자·자동 품질 메모 |
| 오매칭 방지 | 숫자 토큰 단위 정확 비교 (45가 1450에 걸리지 않음) |
| 검증 | `npm run test:evidence` (8케이스) |

시드 보고서 실측: 수치 29개 중 문서 확인 18 / 딜 입력 2 / 근거 없음 9 (추적 69%).
근거 없음으로 잡힌 값은 "Phase II→III 전환 확률 40%", "항암제 시장 연 10% 성장"처럼
AI가 업계 통념에서 끌어온 수치들로, 실제로 심사역이 IC 전에 확인해야 하는 것들이다.

> **한계(과장 금지)**: '문서 확인'은 같은 값이 자료에 있다는 뜻이지 해석이 맞다는
> 보증이 아니다. 반대 방향(자료의 팩트가 보고서에 쓰였는지)은
> `report-quality.ts`의 `checkFactConsistency`가 따로 본다.

## 1. 섹터별 전문 AI 에이전트

| 항목 | 상태 |
|------|------|
| BIO / IT / Neuron / Maker / Story / Vault | 제품·시장·재무·밸류·리스크 5섹션 특화 |
| Climate / Consumer | 5섹션 특화 + 투자개요 |
| 전 에이전트 투자개요·회사개요 | 섹터별 특화 (`src/agents/overview-helpers.ts`) |
| 투자조건·의견종합 | 한국 VC 텀시트/권고 라벨 프롬프트 |
| 라우팅 | 저장된 `agentType`이 섹터와 어긋나면 섹터 전문가 우선 |
| 외부 데이터 | PubMed / ClinicalTrials / OpenFDA (BIO) |
| KIPRIS 특허 | **동작** — API 키 시 실시간 검색, 없으면 IR 문서에서 추출 |

## 2. 회사별 보고서 양식 재현

| 항목 | 상태 |
|------|------|
| DOCX·PPTX 양식 업로드·파싱 | 동작 |
| 섹션 구조 → SectionKey 매핑 | 동작 (키워드 + AI) |
| **원본 DOCX 서식 1:1 재현** | **동작** — 원본 파일에 본문 단락만 치환 |
| 폰트·색상·헤더/푸터·표지·styles.xml 보존 | 동작 (`test:template`으로 검증) |
| 마크다운 → 단락·불릿·표 변환 | 동작 |
| 플레이스홀더 치환 (`{{기업명}}`, `[기업명]`) | 동작 |
| 재현 미리보기 (교체 구간 표시) | 동작 |
| PPTX 출력 | **동작** — 섹션별 슬라이드 생성 또는 **원본 PPTX 1:1 재현** |
| PPTX 양식 1:1 재현 | **동작** — 원본 슬라이드 본문 placeholder만 치환 |
| 원본 대비 렌더 이미지 비교 | **구조 QA로 대체** — `POST /api/templates/[id]/qa` (styles/헤더/슬라이드 보존 점수) |

### 재현 동작 방식

새 문서를 만들지 않고 **업로드된 원본 DOCX를 열어 본문만 갈아끼운다.**
`styles.xml`·theme·헤더/푸터·이미지·번호매기기를 건드리지 않으므로
회사 양식의 폰트·색상·여백이 원본과 동일하게 유지된다.

내보내기는 3단 폴백으로 동작한다 (응답의 `X-Export-Mode` 헤더로 확인 가능).

| 순위 | 모드 | 조건 |
|------|------|------|
| 1 | `reconstructed:N/M` | DOCX 원본을 읽고 섹션 제목 매칭 성공 |
| 2 | `template-ordered` | 매칭 실패 — 섹션 순서만 반영한 신규 DOCX |
| 3 | `default` | 양식 없음 또는 플랜 미해당 |

관련 파일: `src/lib/template/docx-xml.ts`, `template-reconstructor.ts`

> **2026-09-01 추가— 표준 10섹션 밖 슬라이드/헤딩 보조 추출**: "인력 구성",
> "주주 구성", "사업 계획"처럼 표준 10개 섹션(`SectionKey`)에 대응하지
> 않는 슬라이드·헤딩은 AI 생성 섹션으로는 못 채웠다(원본 예시 회사 내용이
> 그대로 남음). `src/lib/template/slide-extraction.ts`가 이런 자리를
> 업로드된 IR 자료 원문에서 관련 내용을 찾아 채운다 — 새로 판단·서술하지
> 않고 "찾아서 정리"만 하며, 자료에 없으면 null을 반환해 원본을 그대로
> 둔다(지어내지 않음). API 키 없는 데모 모드에서는 목 응답이 실제 추출
> 결과가 아니므로 항상 건너뛴다(`usedModel === "demo-mock"` 가드).
> 한 번의 내보내기에서 최대 6개 슬라이드까지 시도(`MAX_EXTRACTION_ATTEMPTS`).
> `X-Export-Mode`에 `+extracted:N`으로 몇 개가 이 경로로 채워졌는지 표시.
> 검증: `npm run test:template`(데모 모드에서 추측성 내용을 주입하지
> 않는지 확인). 실제 사용자가 제공한 16슬라이드 PPTX 기준 — 표준 섹션
> 매핑으로 9/16, 이 보조 추출까지 더하면(실 API 키 환경에서) 최대
> 14/16까지 채울 수 있는 구조(자료에 실제 내용이 있는 경우에 한함).

## 3. 풀사이클

| 단계 | 상태 |
|------|------|
| 딜소싱 | `/sourcing` 인박스, 메일 붙여넣기, Webhook, **폴링 UI** (`/api/sourcing/poll`), **팀 공유** |
| 심사 | 딜 칸반, 문서 업로드·파싱, 10섹션 IC 보고서, 품질 점수, 섹션 재생성 |
| 사후관리 | `/portfolio` MOIC·DPI·TVPI, 분기 KPI 시계열, 마일스톤, AI 분기 노트, 알림 · **팀 공유** |
| LP 리포팅 | `/lp-report` 펀드 지표·섹터 배분 실계산, 분기 리포트 생성·저장, DOCX 내보내기 · **팀 공유** |

데이터 모델: `Fund` → `PortfolioCompany` → `CompanyKPI` / `Milestone` / `PortfolioUpdate`, `LpReport`, `InboundDeal`

## 4. 셀프서브 가격

| 항목 | 상태 |
|------|------|
| `/pricing` 공개 가격 페이지 | 6개 플랜 + FAQ |
| 단일 정의 소스 | `src/lib/plans.ts` (랜딩·가격페이지 공용) |
| 월 한도 (보고서·양식) | `src/lib/quotas.ts` 에서 강제 |
| 기능 게이트 | `requireFeature()` — LP 리포팅·포트폴리오 402 응답 |
| 구독 해지 | `POST /api/payments/cancel` + 설정 화면 버튼 |
| **팀 협업** | **동작** — 딜·양식·펀드·포트폴리오·인바운드 (심사역=조회, 파트너=편집) |
| **연간 결제** | **동작** — 월간/연간 토글, 연간 시 2개월 무료 (월×10) |
| 미구현 | — |

## 내보내기

| 형식 | IC 보고서 | LP 리포트 |
|------|-----------|-----------|
| DOCX | O | O |
| PDF | O (브라우저 인쇄 뷰 `/reports/[id]/print`) | O (`/lp-report/[id]/print`) |
| PPTX | O (`?format=pptx`) | O (`?format=pptx`) |

> 한글 PDF는 폰트 임베딩(15MB+)이 필요해 브라우저 "PDF로 저장"을 사용합니다.

> **2026-08-10 실사용 버그 수정**: 문서 업로드(PDF)와 PPTX 신규 생성이
> 프로덕션에서 실제로는 동작하지 않았던 게 발견돼 수정됨 — 로컬
> 검증(python-pptx 등 느슨한 파서, `next build`)에서는 안 드러나고
> 실사용자가 직접 열어봐야만 재현되는 종류의 버그였음. **이 표의 "O"는
> 코드 존재 여부일 뿐 실사용자 테스트로 확인된 게 아닐 수 있다는 뜻으로
> 읽을 것.** (`pdf-parse` v1→v2 API 불일치, `@napi-rs/canvas` 네이티브
> 바이너리 배포 누락, PPTX 필수 파트(테마) 누락 — 상세는 PR #34~#37)
> PPTX 신규 생성은 이번에 pptxgenjs로 교체하면서 표 자동 변환 + 브랜드
> 테마 + 핵심 지표 막대차트도 추가됨.
>
> **2026-08-13 추가**: 업로드한 DOCX·PPTX(IR 자료)에서 내장 이미지를
> 추출해 PPTX 내보내기 끝에 "첨부 이미지" 슬라이드로 자동 삽입한다
> (`src/lib/document-images.ts`, `src/lib/pptx-export.ts`). 8KB 미만
> 이미지(로고·아이콘 추정)는 제외, 문서당 최대 6개·보고서 전체 최대
> 8개로 상한. PDF는 지원 안 함(텍스트 레이어만 뽑는 pdf-parse로는
> 이미지를 못 꺼냄 — pdfjs-dist 같은 무거운 의존성 추가가 필요해 범위
> 밖으로 뺌). 양식 재현(reconstructed) 경로는 원본 PPTX 구조를 그대로
> 쓰므로 이미지 첨부 대상이 아니고, 신규 생성(`pptx-generated`) 경로만
> 해당. 검증: `npm run test:document-images`. 실제 이미지 담긴 DOCX
> 업로드 → PPTX 내보내기 → 결과물을 JSZip으로 열어 `ppt/media/`에
> 이미지가, 마지막 슬라이드에 참조(`r:embed`)가 들어있는 것까지
> end-to-end로 확인함.

## 로컬 실행

```bash
npm run db:setup:local     # SQLite + 시드 (펀드·포트폴리오·인바운드 포함)
npm run dev:local
npm run test:all           # quality + fixtures + routing + template + 근거추적 (API 키 불필요)
npm run test:template      # 양식 1:1 재현 서식 보존 검증
```

데모 계정 (시드 후, FULL 플랜 · 동일 팀):

| 계정 | 비밀번호 | 역할 |
|------|----------|------|
| `demo@dealmind.kr` | `Demo1234!` | ADMIN (소유·공유 관리) |
| `partner@dealmind.kr` | `Partner1234!` | PARTNER (공유 딜 편집) |
| `analyst@dealmind.kr` | `Analyst1234!` | ANALYST (공유 딜 조회 전용) |

샘플 딜·펀드·포트폴리오·인바운드는 팀에 공유되어 역할별 권한을 바로 확인할 수 있습니다.

## 남은 우선순위 (2026-08-13 갱신)

완료된 것 (이전 목록에서 이동):

- ~~딥다이브 검증 프로덕션 반영~~ — SQL 패치·Naver 키 등록·재배포 전부
  완료, 프로덕션에서 실제 뉴스·웹 검색 → AI 판정("지지" + 출처 링크)까지
  end-to-end 확인함. 다만 검색 API 인증 방식이 두 번 헤맨 지점이었다 —
  developers.naver.com(구, `X-Naver-Client-Id`)과 NAVER API HUB/NCP
  (`X-NCP-APIGW-API-KEY-ID`)가 호스트·헤더 모두 다르고, 호스트 이름도
  한 글자 오타(`naveropenapi` vs 실제 `naverapihub`)로 계속 401/404가
  났었음. 지금은 공식 문서로 확정된 `naverapihub.apigw.ntruss.com`
  으로 고정.
- ~~PPTX/보고서에 실제 이미지·차트 삽입~~ — 업로드 DOCX·PPTX에서 내장
  이미지를 추출해 PPTX 내보내기 끝에 첨부 슬라이드로 삽입 (아래 "내보내기"
  섹션 참고). PDF는 범위 밖.
- 딜 파이프라인 단계명 정리 — 스크리닝→검토, 딥다이브→IR 예정,
  IC 준비→투자심의위원회, IC 심의→IR 심의로 변경. 라벨이
  `deal-card.tsx`/`deal-kanban.tsx`/`edit-deal-dialog.tsx`/
  `dashboard/page.tsx`/`portfolio-page-client.tsx`/`reports/new/page.tsx`
  여섯 곳에 따로 복사돼 있어서 상세 페이지 헤더 하나를 빠뜨려 "IC_PREP"
  같은 enum 원본값이 그대로 노출된 적이 있었다 — `src/lib/deal-labels.ts`
  하나로 통합해 같은 종류 버그가 구조적으로 재발 못 하게 함
- `/deals` 일괄 삭제 UI
- 양식 업로드 후 분석이 `ANALYZING`에 영원히 멈추는 실사용 버그 수정 —
  Vercel 서버리스는 응답을 보낸 직후 함수를 얼릴 수 있는데, 분석을
  `waitUntil()` 없이 fire-and-forget으로 돌리고 있었음(보고서 생성
  쪽은 이미 `waitUntil` 적용돼 있었으나 양식 분석만 빠져 있었음)
- 양식 재현 시 같은 표준 섹션에 매핑된 슬라이드/헤딩이 여러 개면 첫
  번째만 채우고 나머지는 원본 예시 회사 데이터가 그대로 남던 버그 수정
  (실사용자 리포트로 발견). 표준 10개 섹션에 아예 대응하지 않는
  슬라이드("인력 구성" 등)는 업로드 자료에서 관련 내용을 찾아 대신
  채우는 보조 추출도 추가 — 위 "2. 회사별 보고서 양식 재현" 섹션 참고

남은 것:

1. **실사용자 테스트**: 딜 스코어링·펀드 심화 분석은 아직 실제
   OpenRouter 키로 AI 응답 품질을 안 봤다. 이 프로젝트는 코드만 보고
   "동작"이라 적었다가 프로덕션에서 몇 주간 조용히 깨져 있던 전적이
   두 번 있다(PDF 파싱, PPTX 내보내기) — 같은 실수 반복 안 하려면 필수
2. DART_API_KEY / KIPRIS_API_KEY / IMAP(Gmail 앱 비밀번호) — 사용자가
   Vercel에 등록 완료라고 확인함. 이 세션(에이전트)은 샌드박스 네트워크
   제약으로 실제 외부 API 호출을 검증할 수 없으니, 배포 후 딜 상세의
   전자공시 탭·특허 검색·딜소싱 인박스가 실제로 데이터를 가져오는지
   직접 확인 필요
3. Toss Payments 라이브 키 전환 — 통신판매업 등록 필요, 진행 상황 확인 필요
4. 픽셀 렌더 이미지 비교 (현재는 OOXML 구조 QA)
5. **코드상 "동작"으로 표시된 기능도 실사용자 테스트 없이는 신뢰하기
   어렵다는 게 이번에 확인됨** — 문서 파싱·PPTX 내보내기 둘 다 몇 주간
   조용히 깨져 있었음. 우선순위가 높은 기능부터 실제 파일로 한 번씩
   직접 테스트해볼 가치가 있음

## 2026-09-01 — Vercel Hobby(무료) 플랜 대비

상용화를 잠시 보류하기로 하고 Pro 구독을 이번 달까지만 쓰기로 함
(트래픽이 적어 Hobby 무료 한도로 충분, 매달 고정비 부담을 없애는 목적).

- `vercel.json`의 `maxDuration`을 800초 → 60초로 전부 낮춤. Hobby는
  함수 실행시간이 60초로 강제 상한돼서, 800초로 둬도 어차피 무시되고
  강제 종료된다 — 미리 낮춰서 배포 실패나 예상치 못한 동작을 방지.
- `report-generation.ts`의 `GENERATION_BUDGET_MS`(자체 중단 시간)도
  660초 → 40초로 낮춤. 이제 보고서 생성이 섹션 몇 개 만들면 스스로
  멈추고 저장한 뒤 "다시 시도"로 이어서 만드는 방식이 훨씬 자주
  발생함 — 느려지지만 깨지진 않음. `REPORT_GENERATION_BUDGET_MS`
  환경변수로 오버라이드 가능하니, 나중에 Pro로 복귀하면 이 값만
  올리면 됨(코드 변경 불필요).
- 점검 중 `src/app/api/agents/*/analyze/route.ts`(7개)와
  `src/app/api/lp-report/generate/route.ts`가 어디서도 호출되지 않는
  죽은 코드로 확인됨 — 예전 아키텍처의 흔적으로 보임. 이후 재확인해서
  실제로 삭제 완료(아래 항목 참고).
- Hobby 플랜은 약관상 비상업 프로젝트 전용이라, 상용화를 다시
  검토할 때는 Pro 재구독이 필요함.

### 후속 — 죽은 API 라우트 정리 + Pro 종료 전 전체 품질 게이트 재확인

Pro 구독 종료(다운그레이드) 전 마지막으로 리소스를 활용해 다음을 확인·정리:

- 위에서 발견한 8개 죽은 라우트(`agents/*/analyze` 7개 +
  `lp-report/generate`)를 삭제 전 다시 grep으로 검증 — 호출부·내부
  함수(`runBioAnalysis` 등) 모두 자기 자신(route.ts)에서만 참조되고
  다른 곳에서 안 쓰임을 재확인한 뒤 라우트 파일만 삭제(기반이 된
  `src/agents/sectors/*` 라이브러리 모듈은 남겨둠 — 범위 밖).
  같은 디렉터리에 있던 살아있는 라우트(`agents/bio/pipeline-npv`,
  `lp-report/[id]/export`)는 영향 없음.
- `vercel.json`의 `regions: ["icn1"]`는 Hobby 플랜에서도 단일 리전
  선택은 지원되는 걸로 확인 — 다운그레이드해도 안 바꿔도 됨.
- 다운그레이드 전 마지막 전체 검증: `tsc --noEmit` / `next lint`(경고
  0건) / `npm run test:all`(17개 스위트 전부) / `next build` 전부
  통과 확인.
- 이 세션(에이전트)은 Vercel 계정/API에 직접 접근하는 도구가 없어
  (MCP 툴 없음, `*.vercel.app`·`vercel.com` 아웃바운드도 프록시가
  차단) 실제 플랜 다운그레이드 버튼을 누르거나 배포 로그를 직접
  조회하는 건 불가능 — 코드 레벨 준비까지만 가능. 아래 "사용자가
  직접 해야 하는 것" 참고.

**사용자가 Vercel 대시보드에서 직접 해야 하는 것:**
1. Settings → Billing에서 Pro → Hobby 다운그레이드(또는 구독 취소)
2. 다운그레이드 직후 실제 보고서 생성 1회를 끝까지 테스트 — 60초마다
   멈췄다 이어지는 방식이 실사용에서 너무 느리진 않은지 확인
3. 팀(Team) 기능을 쓰고 있었다면 Hobby는 1인 계정 전용이라 팀원 접근이
   막힐 수 있음 — 필요하면 사용자 계정 전환 여부 미리 확인

(다운그레이드는 사용자가 대시보드에서 직접 완료함 — `mcp__Vercel__list_teams`로
`plan: "hobby"` 확인됨. PR #49 머지 직후 배포도 Ready, 런타임 에러 0건.)

## 2026-09-08 — patenty.ai 벤치마킹 (특허 AI 서비스)

사용자 요청으로 `patenty.ai`(한국 특허 출원/명세서 작성/선행기술조사 AI
서비스)를 조사. 직접 접속은 샌드박스 아웃바운드 차단으로 못 했고, 웹검색
결과 기반 — 필요하면 사용자가 직접 방문해 재확인 권장.

**정직한 판단: 대부분 직접 벤치마킹 대상이 아니다.**
Patenty의 고객은 "특허를 출원·등록시키려는" 발명가·변리사이고, 우리(BIO
에이전트의 KIPRIS 연동)의 목적은 "이미 있는 특허가 투자 판단에 어떤
신호인가"를 보는 VC 심사역이다. 특허 초안 작성·명세서 생성·거절이유
대응(OA response) 기능은 우리 제품과 job-to-be-done이 아예 다르다 —
이 부분을 억지로 따라할 이유가 없다.

**실제로 겹치는 지점(특허 데이터 활용 품질)에서 점검·개선한 것:**
- KIPRIS 특허 상세 `url` 필드가 실제로는 서비스키 없이 안 열리는 API
  엔드포인트였다(사람이 보는 페이지가 아님) — 어디서도 렌더링되진
  않았지만(죽은 필드), 검증 안 된 URL을 지어내느니 비우는 게 맞아서
  수정. KIPRIS Open API는 애초에 공식 딥링크 형식을 제공하지 않는다.
- 특허 목록을 최신 출원순으로 정렬(예전엔 API가 준 순서 그대로).
- **등록/출원(미등록) 건수, 출원 연도 범위, IPC 대분류 다양성**을
  미리 계산해 프롬프트에 고정 사실로 주입(`summarizePatentPortfolio`) —
  기존엔 AI가 raw 목록을 보고 매번 다르게 셀 수 있었다. 이건 정확히
  Patenty가 강조하는 "구조화된 분석" 방향에서 배울 만한 지점이었다:
  특허를 그냥 나열하지 않고 등록 여부 등 신호로 정리해서 보여준다.
  IR 자료 추출분(KIPRIS 미조회, 등록 여부 확인 불가)은 통계에서 분리.
- `tools/test-kipris.ts` 신규(5개 assertion) — test:all에 포함.

**검토했지만 지금 당장 적용 안 한 것 (판단 필요, 사용자 확인 권장):**
- **크레딧 기반(사용한 만큼만 결제) 가격 모델** — Patenty는 고정 구독
  없이 크레딧 선불(가입 시 100크레딧 무료, 추가 구매 1크레딧=100원,
  기능별로 2~10크레딧 소진)만 쓴다. 이건 사용자가 이전에 Vercel에서
  겪은 것과 정확히 같은 불만("매달 고정 결제가 부담스럽다")의 해법과
  같은 방향 — DealMind의 "셀프서브 가격 공개"는 이미 강점이지만
  6개 고정 월 구독뿐이다. 다만 이건 결제 시스템(Toss 정기결제 → 선불
  차감) 전체를 새로 설계해야 하는 사업 모델 결정이라, 상용화를 잠시
  보류한 지금 시점에 임의로 구현하지 않았다. 나중에 재개할 때 검토
  가치 있음.
- KIPRIS 자체를 "의미 기반(semantic) 검색"으로 바꾸는 것 — Patenty의
  핵심 차별점이지만 KIPRIS Open API 자체엔 그런 기능이 없어 임베딩
  기반 재구현이 필요한 큰 작업. 지금 나열형 검색(출원인명→키워드
  폴백)도 "투자 심사용 보조 신호"로는 충분해 보여 우선순위 낮음.

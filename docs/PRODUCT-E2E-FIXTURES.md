# 전체 제품 E2E — fixture 의존 제거

2026-10-01. 기준 `3ad2c3b` (#123), 브랜치 `codex/product-e2e-fixtures`.
3주차의 전체 제품 E2E는 네오비전 시드 보고서가 없어 실제 흐름 실행 전 중단됐다.
이를 테스트가 매번 자기 합성 데이터를 생성하는 방식으로 해결한다. 기존 DB 전체 시드는 재실행하지 않는다.

## 변경 범위

- `tools/helpers/paid-product-fixture.ts`: 전용 ANALYST 사용자와 VC/PE 데이터만 생성한다.
  - VC: 95억/110억의 자료 상충과 실제 evidence tracing/score assessment를 사용하는 초안.
  - VC: 보고서는 있지만 근거 자료가 없는 바이오 초안, 보고서가 없는 딜을 별도로 둔다.
  - PE: 기존 showcase fixture와 같은 3개 연도 재무, 1,200억/1,180억 상충, 승인/제안 QoE, 미해결 DD.
  - PE: 자료가 없는 별도 딜. 차단 요인이 없다는 것이 READY라는 뜻은 아니다.
- 기존 demo 계정/딜/보고서/원문은 조회 조건으로도 사용하지 않는다. 시드 이름 충돌이 있더라도 영향이 없다.
- 생성 실패, 브라우저 시작 실패, 본문 테스트 실패에도 finally에서 자기 fixture를 정리한다.
- 이전 `rateLimit.deleteMany({})`를 제거했다. 예약된 문서용 IPv6 테스트 IP에 해당하는 두 키만 정리한다.
- DB는 정확히 `file:./dev.db`, 대상은 `http://localhost:3000`만 허용한다. 원격 대상으로 실행하지 않는다.
- 브라우저 외부 요청은 로컬에서 빈 204로 대체한다. 실제 AI·Toss·DART 호출/외부 telemetry는 실행하지 않는다.
- 기존 UI/보안/반응형 assertion을 유지하고 hydration 오류의 광범위한 무시 조건을 제거했다.
  생성 fixture에서 실제 builder가 만든 상충과 readiness를 UI가 표시한다. React/엔진/권한/요금 정책을 수정하지 않는다.

## 실행·남은 범위

`DATABASE_URL=file:./dev.db`, Edge를 PLAYWRIGHT_EXECUTABLE_PATH로 지정.
앱은 이전 로그인 수정의 로컬 production build를 `npm run start`로 제공한다.
이번 변경은 tools/docs뿐이므로 제공 중인 application source와 현재 branch의 application source가 같다.

- `npm run test:paid-product-e2e`: 랜딩/요금/실제 가입·settings 이동/빈 계정/소유자 VC·PE/근거 패널/권한 404/
  390·430·768·1024·1440px에서 11개 화면을 실행했다. 최종 exit 0, 134개 assertion PASS.
  정상 실행 후에도 테스트 사용자 0건과 기존 demo/검토용 계정 유지 확인: PASS.
- 브라우저 실행 경로를 존재하지 않는 로컬 파일로 지정해 의도적으로 실패시켰다.
  예상 exit 1 후 전용 owner/empty/signup fixture 0건, 기존 demo와 사용자 검토용 로그인 계정 유지 확인: PASS.
- `npx tsc --noEmit`, `npm run lint`, `git diff --check`: PASS.
- 실제 유료 결제, AI 보고서 생성, 외부 DART, 원본 PDF 다운로드/뷰어, production/Neon/클라우드 인증은 NOT VERIFIED.
- 테스트명 'paid-product'는 유료 제품의 UI 회귀 이름이며 결제 승인·청구 검증 성공을 뜻하지 않는다.
- 예상 401/404, navigation 중 취소되는 NextAuth 세션 조회 관련 console 제외 조건은 기존 suite에 남아 있다.
  따라서 모든 네트워크·콘솔 오류를 무조건 검증했다고 주장하지 않는다.

이전의 fixture 부족 FAIL은 역사적 기록으로 유지한다. 이번 결과가 당시 실행을 PASS로 바꾸는 것은 아니다.

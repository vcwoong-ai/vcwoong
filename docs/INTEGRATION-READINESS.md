# 통합 준비 상태 — 2026-10-01

사용자의 “굿 그대로 진행하자”는 #125에 제시한 메인페이지 시각 구성 방향 승인으로 기록한다.
이번 문장은 main 병합/운영 배포의 명시적 지시로 확대하지 않는다.

후속: 사용자가 npm.cmd로 로컬 서버를 실행해 차단 상태를 해소했다.
HTTP 200/새 디자인 표시 및 최종 local build의 1440/390 E2E PASS.
Vercel 전용 Speed Insights asset의 로컬 404는 명시적 test stub만 추가했으며 실제 계측은 NOT VERIFIED.
아래 차단 기록은 복구 이전의 기록이다. 병합/운영 검증은 아직 남아 있다.

## 실제 확인

main은 `b919e5db52e1474dd245fdbb6fc9ddddf8587a8e`다. 아래 PR들은 모두 OPEN/Draft, MERGEABLE이며,
각 아래 head에서 GitHub CI `check` 성공과 Vercel 체크 성공을 확인했다.
Vercel 체크 성공은 운영 배포·인증된 앱·alias·runtime 검증 PASS가 아니다.

| PR | 역할 | base | 확인한 head |
|---|---|---|---|
| #119 | VC/PE 디자인·근거 원문 | main | 133a33821b131cb057124d658e02521a60a5711c |
| #120 | 첫 딜 안내·정책/측정/인터뷰 설계 | codex/vc-design-review | 1de40c466bb8db9a23cca2b4d5fdb37000205485 |
| #121 | Claude의 로그인 보강 | codex/vc-design-review | dbe553b7e0ea76c630f33f0aecc2769b0627efb5 |
| #122 | 접근성·성능 검증 | codex/week3-onboarding-research | bb315eae57e22836bc0e17b70afc5eb9e744f669 |
| #123 | 이메일 대소문자 충돌·중복 가입 보강 | codex/week4-verification | 3ad2c3b30825094976463600c21f20ef96697ba8 |
| #124 | 전체 제품 E2E fixture | codex/login-email-resolution | 5917ac7e52defbc5bb6766c9324b5895a5bb6fb1 |
| #125 | 메인페이지 시각 구성 | codex/product-e2e-fixtures | ed654e233db3434dbef8647d430928ca7fbe34ff |

이후 문서 커밋이 #125 head를 바꾸면 위 CI 결과는 새 head에 대한 결과가 아니다.

## 통합 순서와 중복

명시적 병합 승인 후의 순서는 #119 → #120 → #122 → #123 → #124 → #125다.
squash 병합은 원래 branch commit을 main에 그대로 남기지 않으므로, 각 다음 PR의 base 변경과
diff/충돌/검증을 실제 새 main 위에서 확인해야 한다. 미리 rebase/force-push하지 않았다.

#121의 실제 diff 두 파일은 `src/lib/auth.ts`, `src/app/api/auth/register/route.ts`다.
#123도 이 두 파일을 수정하지만 parameterized LOWER(email) 조회와 여러 후보 거부,
case-insensitive 가입 중복 검사/unique race 처리를 추가한다. #121의 lowercase 우선/입력 원문 fallback을
독립적으로 함께 적용하면 충돌하거나 보강을 되돌릴 수 있다. #123을 기준으로 통합 시 #121의 필요성을
별도 검토하고 작성자/사용자에게 확인한다. #121을 닫거나 branch를 수정하지 않았다.

## 남은 확인

- #125 시각 구성 방향 승인. 다른 전체 디자인/문서 정책·요금 문구 승인까지 의미하지 않는다.
- 최종 local build 브라우저 확인: 서버 실행이 자동 승인 검토에서 차단되어 NOT VERIFIED.
  로컬 SQLite와 localhost를 지정한 시도 및 loopback `127.0.0.1` 한정 시도 모두 차단됐다.
  구체적 사유 미제공. 현재 서버 종료 상태. 다른 실행 수단으로 우회하지 않았다.
- #123 PostgreSQL 실제 실행/조회 성능과 운영 legacy email 충돌 데이터: NOT VERIFIED.
- 운영 인증 VC/PE, 배포 SHA/alias/aliasError/runtime 로그: 이번 턴 NOT VERIFIED.
- 모든 PR 통합 후 실제 통합 HEAD의 test:all/tsc/lint/관련 E2E 필요. 개별 head의 과거 PASS로 대체하지 않는다.

새 DB/env/schema/권한/결제 변경, main 쓰기/병합, 배포 없음. 현 단계는 디자인 방향 승인 및 통합 준비 완료,
로컬 서버 실행 차단 해소와 명시적 병합 지시 대기다.

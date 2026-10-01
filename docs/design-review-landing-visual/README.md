# 메인페이지 시각 구성 보강

2026-10-01. 브랜치 `codex/landing-visual-story`, 시작 HEAD `5917ac7e52defbc5bb6766c9324b5895a5bb6fb1` (#124).
기존 main `b919e5d`, #119–#124 Draft를 보존한 후속 작업이다. 운영 사이트는 이전 디자인이며 이번 화면은 로컬 검토본이다.

## 바뀐 화면

- Hero의 작은 수치 표를 문서 출처 두 장, 큰 수치, 비교 막대로 표현했다. VC 95억/110억과 PE 1,200억/1,180억은 합성 예시다.
- 근거 설명을 문서 → 같은 기간/통화의 상충 대조 → IC 질문/확인 자료로 이어지는 시각 구성으로 바꿨다.
- 기존 여섯 상세 설명은 키보드로 펼칠 수 있다. 기존 기능 설명은 보존했다.
- VC/PE 트랙 카드에 업무 흐름을 추가했다. 완료율/투자 승인/새 기능을 암시하는 표현은 넣지 않았다.
- 요금/정책/보안 문구, canonical/API/권한/인증/결제는 변경하지 않았다. 이미지 생성·외부 이미지·새 라이브러리·AI 호출 없음.

| 화면 | 1440px | 390px |
|---|---|---|
| Before | [desktop](before-1440.png) | [mobile](before-390.png) |
| After VC | [desktop](after-1440.png) | [mobile](after-390.png) |
| After PE | [desktop](after-pe-1440.png) | [mobile](after-pe-390.png) |

Before는 직전 #124의 실제 전체 제품 E2E 캡처에서 복사했다. 운영 Before와 혼동하지 않는다.
초기 baseline 도구는 인증된 layout의 app-ready marker를 공개 랜딩에 기다려 timeout했다.
공개 화면의 실제 탭 전환으로 hydration을 확인하도록 고친 뒤 After를 실행했다. 앱 오류로 해석하지 않는다.

## 검증

- 로컬 SQLite `file:./dev.db`, NextAuth localhost, local storage. 외부 브라우저 요청은 204 stub.
- `npm run test:landing-visual-e2e`: 1440/390 PASS. 실제 hydration, VC↔PE 키보드 탭/포커스,
  설명 Enter 펼치기, 예시 표시, PE 가입 링크 이동, 가로 넘침, h1/FAQ, console/pageerror 확인.
- `npm run test:vc-contradiction-decision`, `test:pe-blocker-display`, `test:pe-overview-readiness`: PASS.
- `npx tsc --noEmit`, `npm run lint`, `git diff --check`: PASS (최종 결과는 PRODUCT-STATUS).
- `npm run build`: PASS, exit 0. 스크린샷/E2E는 localhost:3001 dev에서 실행했다.
  build 전 두 로컬 서버를 정상 종료했다. build 후 `npm run start` 재시작은 실행 정책에서 두 번 차단되어
  production build의 브라우저 E2E 재실행은 NOT VERIFIED이며 현재 로컬 서버는 종료 상태다.
  첫 시도는 로컬 test secret을 지정했고 두 번째는 기존 인증 설정을 유지했으나 둘 다 차단됐다.
  도구는 구체적인 거절 사유를 제공하지 않았다. 다른 실행 경로로 우회하지 않는다.
- React 검토: 시각 설명은 server component, 미리보기의 기존 탭 state만 client.
  외부 fetch/추가 계산 엔진 없음, 장식 아이콘은 aria-hidden, 비교 수치는 텍스트, 스타일은 CSS modules.
- NOT VERIFIED: 운영/클라우드 최신 반영, 인증된 운영 VC·PE, 실제 결제/외부 AI/DART.
  이번 범위에서는 test:all 및 전체 제품 134개 E2E를 재실행하지 않았다. 이전 결과는 이번 PASS에 포함하지 않는다.

Draft PR까지만 진행. 운영 배포/병합하지 않는다. READY FOR DESIGN REVIEW.

## 사용자 확인 후속

2026-10-01 “굿 그대로 진행하자”로 이 시각 구성 방향 승인.
현재 head `ed654e2`의 CI/Vercel 체크 성공을 확인했다. 운영 인증 검증을 뜻하지 않는다.
로컬 서버 재실행은 loopback 한정 실행까지 자동 승인 검토에서 차단됐다. 최종 build 브라우저 확인은 여전히 NOT VERIFIED.
통합 순서/Claude #121 중복은 [통합 준비 기록](../INTEGRATION-READINESS.md)에 정리했다. 병합/배포 지시로 확대하지 않는다.

## 로컬 실행 복구·최종 빌드 확인

같은 날 사용자 터미널에서 `npm.cmd run start -- --hostname 127.0.0.1` 실행.
Windows PowerShell은 `npm.ps1`을 execution policy로 거절했지만 npm.cmd 실행 후 서버가 정상 응답했다.
실행 정책/운영 env 변경 없음. 사용자가 실행한 서버는 종료하지 않고 유지한다.
`Ready` 출력 확인 대신 127.0.0.1:3000 HTTP 200과 새 시각 구성 표시를 실제로 확인했다.

`BASE_URL=http://localhost:3000 npm.cmd run test:landing-visual-e2e`: 최종 build에서 1440/390 PASS, exit 0.
최초 production build 검사는 `/_vercel/speed-insights/script.js` 로컬 404로 FAIL했다.
이 Vercel 전용 계측 asset만 빈 JavaScript 200으로 대체하는 명시적 test stub을 추가했다.
앱 404/hydration/console assertion은 유지했고 failed response URL 진단도 추가했다.
계측 실제 작동은 NOT VERIFIED이며 일반 로컬 브라우저에서는 해당 asset 404가 남을 수 있다.
최종 tsc/lint PASS. 도구/캡처/기록만 바뀌었으므로 앱 build 재실행은 하지 않았다.

[최종 hero desktop](hero-1440.png), [mobile](hero-390.png),
[근거 시각 구성 desktop](evidence-1440.png), [mobile](evidence-390.png).
Codex 브라우저에서도 실제 공개 메인페이지를 열고 검토 탭을 유지했다. 운영 배포·로그인 검증을 뜻하지 않는다.
앞선 로컬 서버 차단 상태는 해소됐다. 병합/운영 배포는 여전히 대기한다.

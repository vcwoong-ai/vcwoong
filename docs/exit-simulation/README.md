# 회수 시뮬레이션 — 1단계 검토

## 구현과 경계

- 브랜치: `codex/exit-simulation-phase1`, 시작 main/HEAD `a5796bbff127e0398e042baff04aa3acb75d429c`.
- 원래 `D:\Dealmind`의 `codex/site-review-release` (`f355ca4`)는 clean 상태로 보존했다.
  전용 checkout은 다른 환경의 미커밋 변경을 포함하지 않는다. Claude 브랜치/PR은 수정하지 않았다.
- main에는 엔진이 아직 없었다. OPEN PR #127의 head `1268db41c619d2f2f45500d50163db7af6cf17e8`에서
  엔진과 기존 테스트만 그대로 가져왔다. main 대상 이 PR에는 두 원본 파일이 함께 포함된다.
  #127을 먼저 병합하면 동일 파일에 대한 diff가 사라질 수 있으며, 독립 엔진 변경으로 취급하지 않는다.
- 원본 blob 대조: 엔진 `c01dce9551143ae286fe01e10460043f188f6a31`, 테스트 `ea7004c0bf72e146865964fc470fe7e1f46d698f` 일치.
- 딜 상세의 새 탭 → `exit-simulation.tsx` → 입력 검증/억원→원 변환 어댑터 →
  `simulateCapTable` → 같은 마지막 Stage로 `exitWaterfall`/`exitPayoutCurve`.
  IRR은 실제 납입액·회수액을 억원으로 환산해 기존 `calculateSimpleIrr`를 호출한다.
- 새로운 API·AI·유료 요청·저장 기능 없음. DB/env/schema/권한/결제 코드 변경 없음.
  `vc-decision.ts`와 MOIC/IRR `NOT_COMPUTABLE`도 변경하지 않았다.
- 기존 딜에 투자금·포스트밸류가 모두 있으면 프리머니를 `valuation - investAmount`로 채운다.
  그 외 주식수·우선주 조건·청산 순위·회수 가정은 직접 입력한다. 공동투자 시 프리머니 재확인을 안내한다.
- SAFE, 공동투자자, 옵션풀, 후속 라운드, 참가 상한, 리픽싱 방식/하한을 입력할 수 있다.
  라운드별 지분, 주주 분배액, 우선권/전환 선택, MOIC/IRR, 40구간 회수 곡선, 엔진 원문 경고를 표시한다.
- 입력을 고치면 이전 결과임을 알리고 재계산을 요청한다. 탭 이동은 입력을 보존하고 새로고침은 초기화한다.
  계약서 의존·단순 IRR·주당 반올림/신주 내림·스톡옵션 행사가·미부여 풀 제외 등 엔진 한계를 화면에 안내한다.

## 실제 검증 (2026-10-02)

| 명령/검증 | 결과 |
|---|---|
| `npm.cmd run test:exit-waterfall` | PASS, 기존 12건 |
| `npm.cmd run test:exit-simulation-input` | PASS, 빈 가정/단위/옵션/입력 검증/손계산 |
| `npm.cmd run test:all` | PASS, 기존 VC/PE 공통 체인 + 새 입력 테스트 + 끝의 exit-waterfall |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS, 경고 없음 |
| `npm.cmd run build` | PASS, 로컬 production build |
| `npm.cmd run test:exit-simulation-e2e` | PASS, 실제 인증 딜 상세, 개발 서버 1440/390 |
| 브라우저 가로 넘침/입력 유지/초기화 | PASS, document와 테이블/입력/차트 확인, overflow 숨김 추가 없음 |
| 복합 입력의 동일 엔진 snapshot 결과 대조 | PASS, 공동투자+SAFE+후속+참가 상한+풀 래칫/하한+동순위 |
| 화면 오류/앱 HTTP 오류/계산 API 쓰기/딜 데이터 변경 | PASS, 각각 없음 |
| 최적화 build 브라우저 재검증 | NOT VERIFIED, 서버 시작 명령 자동 승인 검토 거절 (`blocked by policy`) |
| 원격 CI / Vercel Preview / 운영 인증 화면 | NOT VERIFIED, 로컬 결과로 대체하지 않음 |

손계산: 창업자 10,000,000주, 프리 40억원, 우리 펀드 10억원, 1x 비참가적.
주당 400원·우리 지분 20%, 엑싯 30억원에서 10억원(우선권), 100억원에서 20억원(전환).
후자의 MOIC 2.00x, 회수 시점 5년을 직접 입력하면 단순 IRR 14.87%; 기간 빈칸은 미계산.

브라우저 검증 초기 실행은 문서 탭의 실제 이름, 새로고침 후 hydration 대기,
Next.js route announcer와 앱 오류의 alert 범위가 맞지 않아 실패했다.
해당 테스트 선택자/대기/범위를 수정한 최종 실행은 PASS. 제품 검증 assertion을 삭제하거나 약화하지 않았다.

## 격리 실행

`D:\Dealmind-exit-simulation\prisma\dev.db`는 기존 로컬 SQLite의 복사본이다.
스키마 push/migration/seed를 하지 않았고, 테스트는 복사본에 만든 임시 사용자/딜만 정리했다.
사용자의 기존 3000/3001 서버를 보존하고 이 작업이 시작한 3002 개발 서버만 종료했다.

```powershell
cd D:\Dealmind-exit-simulation
$env:DATABASE_URL='file:./dev.db'
$env:NEXTAUTH_URL='http://localhost:3002'
$env:NEXTAUTH_SECRET='exit-simulation-local-fixture-only-secret-2026'
$env:STORAGE_MODE='local'
$env:BASE_URL='http://localhost:3002'
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
# 클라이언트 생성만 한다. schema/db 변경 명령이 아니다.
npx.cmd prisma generate --schema prisma/schema.sqlite.prisma
npm.cmd run dev -- --hostname 127.0.0.1 --port 3002
# 별도 터미널에 위 환경 변수를 동일하게 설정 후:
npm.cmd run test:exit-simulation-e2e
```

검증 로그/JSON은 ignored `screenshots/exit-simulation/`에 있다. 캡처는 임시 예시 기업 데이터만 포함한다.

- [1440px 실제 화면](after-1440.png)
- [390px 실제 화면](after-390.png)
- [390px 복합 가정](advanced-390.png)

## 남은 일과 승인

READY FOR DESIGN REVIEW. main 대상 Draft PR까지만 요청받았으며 병합·운영 배포는 하지 않는다.
시나리오 DB 저장, VC computed 판단, 보고서 회수 섹션은 별도 승인 후 2단계 PR 범위다.
진행하던 PE 운영 스키마 복구 작업은 이번 기능과 분리해 보존했고, 이 작업에서 운영 DDL을 실행하지 않았다.

# SGC-PC 격리 PostgreSQL 집중 검증

2026년 10월 6일 15:31 KST, 이 컴퓨터에서 실행한 제한된 결과다. Ruflo MCP 호출은 수행하지 않았다. native 개발·테스트·리뷰 위임 중 테스트 담당의 기록이며 제품 소스 수정, 운영 migration, 실제 외부 서비스 연결, commit/push/배포는 하지 않았다.

## 격리와 보존

- 소스 기준은 `W:/Dealmind/primary`의 현재 파일이다. Git tracked 및 nonignored 목록 863개 파일을 새 TEMP 사본으로 복사했다. 기존 로컬 소스 변경을 포함하며 `.env*`, `.git`, `.agents`, `.codex`, `node_modules`, `.next`, 업로드, DB와 백업은 제외했다.
- 검증 루트: `C:/Users/user/AppData/Local/Temp/dealmind-sgc-pg-cbab701109a0432aa4951d3588769d28`. 소스는 그 아래 `source`, DB cluster는 `pgdata`, npm cache는 `npm-cache`이다. 폴더는 재개 조사용으로 남겼으며 현재 서버는 모두 중지했다.
- Node 24.15.0의 npm CLI와 lockfile로 새 `npm ci --ignore-scripts --cache <검증루트>/npm-cache --no-audit --no-fund`를 실행했다. 종료 0, 389초. registry 다운로드는 느렸지만 HTTP 200으로 진행했고 deprecated 경고가 있었다. 의존성 추가·갱신은 하지 않았다.
- PostgreSQL 17 설치 바이너리를 이용한 새 cluster, loopback `127.0.0.1:55449`, 전용 `dealmind_test` DB만 사용했다. 시작 전에 TCP bind로 55449/3129가 비어 있음을 확인했다. 새 합성 cluster의 trust 인증은 loopback 전용이다.
- 자식 실행 환경은 PATH/SystemRoot/사용자 TEMP 등 기본 Windows 변수만 whitelist로 전달했다. 외부 AI·메일·스토리지·결제 키를 전달하지 않았다. `NODE_ENV=test`, `STORAGE_MODE=local`, `UPLOAD_DIR=./.e2e-uploads`, `DEALMIND_E2E_ISOLATED=1`, 동일한 `DATABASE_URL`/`TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55449/dealmind_test`, `BASE_URL`/`NEXTAUTH_URL=http://127.0.0.1:3129`와 테스트 전용 합성 인증값을 사용했다. 환경파일은 만들지 않았다.
- 기존 가드 `assertCleanE2EWorkspace`, `assertE2ETarget`, `assertNoExternalE2ECredentials`가 실행되었다. PostgreSQL Prisma client는 TEMP 자체 `node_modules`에만 생성했다. primary의 SQLite client를 재생성하지 않았다.
- 최종 SHA256 비교에서 primary `.env.local`, `prisma/dev.db`, `node_modules/.prisma/client/schema.prisma` 세 파일 모두 시작 전과 같았다. 해시값·환경값은 이 문서에 싣지 않는다. `vcwoong`은 접근·수정하지 않았다.

## 실제 명령과 결과

아래 명령의 작업 디렉터리는 모두 `<검증루트>/source`이다. TEMP `prepare.mjs`, `runner.mjs`, `verify-preservation.mjs`, `results.jsonl`에 실행기와 결과가 남아 있다.

```powershell
# 설치 바이너리의 절대 경로로 실행
& 'C:/Program Files/PostgreSQL/17/bin/initdb.exe' -D '<검증루트>/pgdata' -U postgres --auth=trust --encoding=UTF8 --locale=C
& 'C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe' -D '<검증루트>/pgdata' -l '<검증루트>/postgres.log' -o '-h 127.0.0.1 -p 55449' -w start
& 'C:/Program Files/PostgreSQL/17/bin/createdb.exe' -h 127.0.0.1 -p 55449 -U postgres dealmind_test
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
node node_modules/prisma/build/index.js db push --schema prisma/schema.prisma --skip-generate
node node_modules/tsx/dist/cli.mjs tools/test-free-customer-journey.ts --serve-source-api
```

`initdb` 종료 0(83초), `createdb` 종료 0, `SELECT current_database()`로 전용 DB 이름 확인. Prisma generate 종료 0(32초), db push 종료 0(5초). 기존 DB와 운영 patch에는 적용하지 않았다. API 실행기는 기존 source route allowlist를 불러오는 테스트용 서버이며 Next 브라우저 서버가 아니다.

각 검사 명령의 공통 앞부분은 `node node_modules/tsx/dist/cli.mjs tools/`이다.

| 도구와 인자 | 최종 종료/시간 | 이번에 확인한 범위 |
| --- | --- | --- |
| `test-pe-document-reparse-integration.ts --run-db` | 0 / 40초 | 실제 PG의 동시 claim 한 승자, 만료 takeover, 이전 worker 차단, 동일 원본 복구와 한 번 파싱. bytes/storage/parser ports는 합성이다. |
| `test-billing-persistence-integration.ts --run-db` | 0 / 5초 | vault·repository roundtrip, 소유자·폐기 거절, 동시 예약/합성 한 청구, UNKNOWN query-only 재시작, stale fence, 갱신·취소 hold·범위 이용권. |
| `test-checkout-session-integration.ts --run-db` | 0 / 4초 | 소유자 binding, 서버 가격, callback 중복 차단, 불확실 발급 HOLD, rollback·불변 재시도·stale fence·기간 중 취소. provider 발급·청구는 합성이다. |
| `test-export-state-integration.ts` | 0 / 9초 | 본문 재승인/헤더 변경 뒤 오래된 export 무효화, 최종 입력 버전, draft/생성 상태 보존. 실제 DOCX/PPTX 파일 생성 검사가 아니다. |
| `test-team-workflow-integration.ts --run-api --fresh-isolated-server` | 0 / 23초 | 실제 소스 API/PG 동시 팀 생성, 초대 동의/CAS, 소유권 이전, 만료·membership 경쟁. |
| `test-report-generation-integration.ts --run-api --fresh-isolated-server` | 0 / 34초 | 중복 create/claim CAS, 만료된 이전 worker의 실제 promise 완료 뒤 차단, FREE 최종 quota 경쟁·full-quota resume. 모델은 명시적 합성 대체이다. |
| `test-report-quota-ledger-integration.ts --run-api --fresh-isolated-server` | 0 / 72초 | 원자 admission, report/deal 삭제 이후 사용량 유지, 재개·재시작, 기존 row 이중집계 방지, 마지막 slot 경쟁, KST 월 경계, insert 실패 rollback/dispatch 차단. |
| `test-section-regeneration-integration.ts --run-api --fresh-isolated-server` | 0 / 17초 | 중복/동일 deal/전체 생성 claim, 수동 편집 CAS, 만료 worker 차단, 실패 release·retry, 응답 비공개 필드. |

## 실패 시도와 실행기 보완

- Windows `pg_ctl`은 서버 시작 후에도 자손 프로세스가 stdout pipe를 보유해 TEMP Node 실행기의 `close` 대기를 지연시켰다. PostgreSQL 로그는 시작 완료였으며, 해당 TEMP 실행기 프로세스만 중지했다. TEMP `runner.mjs`에서 `exit` 이벤트로 완료를 수집하도록 바꾸고 `createdb`를 별도 실행했다. 제품 소스의 변경·실패가 아니다.
- 소스 API preload가 준비되기 전에 API 4개를 실행한 첫 시도는 각각 종료 1이었다. TCP3129는 `ECONNREFUSED`였으며 팀/보고서/사용량/섹션 도구는 guard 또는 합성 계정 생성 단계에서 중단했다. 실패를 통과로 기록하지 않았다.
- `source-api.log`의 `Synthetic source API harness ready`와 TCP3129 ready를 확인한 뒤 같은 기존 도구를 다시 실행해 표의 네 최종 종료 0을 얻었다. 첫 실패로그는 `team-workflow.initial-readiness.log`, `report-generation.initial-readiness.log`, `quota-ledger.initial-readiness.log`, `section-regeneration.initial-readiness.log`로 보존했다. `results.jsonl`에도 실패/재실행이 모두 남아 있다.
- 중간 상태 조회 명령에 PowerShell quoting 오류와 TEMP에서의 Git 조회 오류가 있었다. 테스트 실패로 분류하지 않는다. 주 checkout에서 별도로 Git 상태를 확인했다.

## 종료 확인과 한계

검사 후 `cleanup-counts.sql`로 User, Team, TeamInvitation, Deal, Report, ReportQuotaAdmission, MADeal, BillingCheckoutSession, BillingPaymentMethod, BillingSubscription, BillingIntent, BillingPayment, UsageLog 13개 테이블 count가 전부 0임을 확인했다. 기존 fixture-only cleanup과 합성 자료만 대상으로 했다.

자체 API PID32984의 자식 프로세스만 `taskkill /PID 32984 /T /F`로 종료했다. `pg_ctl -D <검증루트>/pgdata -m fast -w stop` 종료 0. 15:31:20 KST TCP 검사에서 3129/55449는 listener 없음, primary3000은 listener 유지였다. netstat에서 기존 `127.0.0.1:3000` PID31856 확인. `preservation-final.json`에 시각/불변 비교 결과가 있다.

브라우저·UI·모바일·실제 Next renderer 검증은 수행하지 않았다. localhost 브라우저 권한 거절을 우회하지 않았다. 실제 AI 품질, Toss issuance/청구·환불·webhook, 실메일, 실제 파일 cloud ACL, 강제 동시 cross-user 결제 영수증 충돌은 미검증이다. PE 실제 대용량/압축 전체 확장 한도/CPU·메모리 격리도 이번 DB 집중 검사의 범위가 아니다. 전체 제품/전체 회귀 통과를 뜻하지 않는다.

재개 시 이 TEMP 서버가 실행 중이라고 가정하지 않는다. `runner.mjs`의 환경 whitelist와 기존 집중 도구를 참고하되 새로운 고유 합성 환경/준비 확인을 먼저 수행한다. 남은 parser 계획은 병렬 개발·리뷰 문서에 따라 이어간다. 클라우드 지정 checkout 실행 확인은 여전히 미확인이다.

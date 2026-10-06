# 세 개선 작업 구현·검증 기록

2026-10-03, 분석 기준 Git HEAD `f355ca40592bf7050a4ef43ee6bcd1273aa457a4`의 기존 사용자 변경을 유지한 워크트리에서 구현했습니다. 커밋·push·배포·운영 DB/스토리지 작업·결제·키 변경·의존성 설치는 하지 않았습니다. Prisma 스키마와 lockfile은 변경하지 않았습니다.

## 결과

1. 운영 DB를 자동으로 수정하지 않는 스키마 readiness 도구 및 별도 적용 절차.
2. 비공개 신규 파일 저장, 서명된 직접 업로드, 소유자/팀 권한을 확인하는 VC·PE·템플릿 다운로드, 원본 주소 노출 제거.
3. 전용 PostgreSQL/깨끗한 환경을 요구하는 테스트 가드, 실제 로그인·권한·다운로드 HTTP suite, 격리 CI 서비스 및 검사 도구 타입 검사.

## 변경 파일

### 저장소·업로드·다운로드·화면

- `src/lib/storage.ts`
- `src/lib/upload-security.ts` (신규)
- `src/lib/pptx-export.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/upload/blob-token/route.ts`
- `src/app/api/templates/route.ts`
- `src/app/api/templates/blob-token/route.ts`
- `src/app/api/templates/[id]/route.ts`
- `src/app/api/deals/[id]/route.ts`
- `src/app/api/documents/[id]/download/route.ts` (신규)
- `src/app/api/templates/[id]/download/route.ts` (신규)
- `src/app/api/ma-deals/[id]/documents/[documentId]/download/route.ts` (신규)
- `src/app/deals/[id]/page.tsx`
- `src/app/deals/[id]/deal-detail-client.tsx`
- `src/app/templates/page.tsx`
- `src/app/templates/templates-client.tsx`
- `src/components/ma-deals/ma-deal-data-room.tsx`
- `src/components/upload/file-uploader.tsx`

### 검사 도구·테스트·CI

- `tools/lib/schema-readiness.ts` (신규)
- `tools/check-schema-readiness.ts` (신규)
- `tools/test-schema-readiness.ts` (신규)
- `tools/helpers/e2e-environment.ts` (신규)
- `tools/check-e2e-environment.ts` (신규)
- `tools/test-e2e-environment.ts` (신규)
- `tools/test-upload-security.ts` (신규)
- `tools/test-auth-authorization-integration.ts` (신규)
- `tools/test-security.ts`
- `tools/test-login-email-e2e.ts`
- `tools/test-mobile.ts`
- `tools/test-pe-production-readiness-e2e.ts`
- `tools/test-pe-ic-audit-e2e.ts`
- `tools/test-pe-frontend-productization-e2e.ts`
- `tsconfig.e2e.json` (신규)
- `.github/workflows/ci.yml`
- `package.json` (명령 추가만; 의존성 변경 없음)
- `.gitignore` (기존 변경을 보존하고 private/격리 fixture 디렉터리 제외 추가)

### 문서

- `docs/schema-readiness.md` (신규)
- `docs/private-document-storage.md` (신규)
- `docs/e2e-testing.md` (신규)
- `docs/implementation-verification.md` (이 문서)

기존 `.agents/`, `AGENTS.md` 및 Ruflo 설치 설정은 이번 기능 구현 변경 목록에 포함하지 않습니다. Ruflo MCP 호출에 따른 역할·작업·swarm 로컬 조정 기록은 갱신됐습니다.

## 최초 단계 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run test:all` | 종료 0. 오프라인 집계 통과. 이후 추가된 업로드 검사는 아래 명령으로 별도 최종 확인 |
| `npm run test:upload-security` | 종료 0, 최종 변경 재검사 통과 |
| `npm run test:e2e-environment` | 종료 0, 환경 파일·전용 DB·loopback·외부 키 가드 통과 |
| `npm run test:security` | 종료 0, 자체 store 제한·경로 등 보안 회귀 통과 |
| `npm run test:schema-readiness` | 종료 0, mock runner로 DB 선택·명령 구성·상태·오류 숨김·임시파일 정리 검증 |
| `npm run test:permissions` | 종료 0 |
| `npm run test:document-images` | 종료 0, 손상된 ZIP 경고는 예상된 부정 사례 |
| `npm run test:pptx-export` | 종료 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 종료 0, 프로젝트 타입 검사 |
| `node node_modules/typescript/bin/tsc -p tsconfig.e2e.json` | 종료 0, 이번 변경의 검사 도구 포함 |
| `npm run lint -- --file <변경된 src 파일 각각>` | 최종 18개 source 파일 종료 0, warning/error 없음 |
| `git diff --check` | 종료 0; Windows 줄바꿈 변환 안내 외 공백 오류 없음 |

초기 focused lint의 unused variable 5건은 수정 후 재검사로 통과했습니다. 존재하지 않는 `npm run typecheck:e2e`는 실패했고 실제 compiler 명령으로 검사했습니다. DB URL 미설정 상태의 readiness CLI는 `DATABASE_NOT_SELECTED / unverified` 및 종료 1로 거부했습니다. 이는 실제 DB 연결 성공 검증이 아닙니다.

## 최초 단계의 미실행 항목과 한계

- 로컬 PostgreSQL/Docker 실행 도구가 없어 새 HTTP 통합 suite, 실제 CI job, 브라우저 E2E, build 및 앱 서버는 실행하지 않았습니다. CI 구성 완료를 CI 통과로 표현하지 않습니다.
- 운영 DB 카탈로그를 읽거나 DDL을 적용하지 않았습니다. 과거 `MADeal` 누락이 현재 운영에서 해결됐는지는 미확인입니다.
- 실제 Blob/S3 연동 및 private store·S3 Block Public Access 설정은 미확인입니다. Blob 신규 업로드에는 실제 private store 및 `BLOB_STORE_ACCESS=private` 조건이 필요합니다. 운영 환경변수는 변경하지 않았습니다.
- 이미 공개된 Blob/`public/uploads` 파일은 별도 이전·참조 갱신·삭제 전까지 알려진 URL로 접근할 수 있습니다.
- 업로드 UUID 예약 후 프로세스가 강제 종료되면 추출 중 문서/ANALYZING 템플릿이 남을 수 있습니다. 이번 변경은 중복 실행을 막지만 자동 복구 작업은 구현하지 않았습니다.
- 모든 레거시 E2E를 일괄 보호하지 않았습니다. 새 가드는 새 HTTP suite, PE 브라우저 3개, 로그인 이메일 E2E에 적용했습니다. mobile은 브라우저 경로만 변경했습니다. 수동 실행에서는 localhost 서버가 동일한 전용 DB로 시작됐는지 별도로 보장해야 합니다.
- 스키마 diff는 Prisma 지원 객체만 비교하며 RLS/view/trigger/extension, migration 이력, 생성 client 일치, 실제 데이터는 보장하지 않습니다.

이 절은 최초 단계의 기록입니다. 이어서 실행한 검증과 복구 구현은 아래 후속 결과를 우선 확인합니다.

## 작업 분담

Ruflo `swarm_init`, `agent_spawn`, `task_create`로 4개 역할을 등록했습니다. 실제 구현은 Codex 개발·테스트 하위 에이전트와 주 에이전트(스키마 도구)가 수행했고 리뷰 하위 에이전트는 읽기 전용으로 검토했습니다. 개발은 src, 테스트는 tools/CI/package/검사 config, 주 에이전트는 schema 도구/문서와 최종 검증을 담당했습니다. 의존 작업은 구현 후 리뷰·최종 검증 순으로 수행했습니다. `task_complete` 및 `swarm_shutdown`으로 조정 작업을 정리합니다. Ruflo `agent_execute` 또는 외부 LLM API로 구현을 실행하지 않았습니다.

## 후속 구현과 검증 — 2026-10-03

### 추가한 기능과 변경 이유

- `src/lib/upload-recovery.ts`: 기존 JSON 필드에 작업 상태·10분 lease·최대 3회 시도·1분 backoff를 기록합니다. DB CAS로 한 worker만 선점하며, 만료된 이전 worker의 완료 저장을 차단합니다. 새 테이블/컬럼은 없습니다.
- `src/app/api/upload/route.ts`, `src/app/api/templates/route.ts`: 최초 등록과 복구가 같은 worker를 사용하도록 연결합니다.
- `src/app/api/documents/[id]/resume/route.ts`, `src/app/api/templates/[id]/resume/route.ts`: 현재 EDIT 권한을 확인한 후 미완료 작업의 재개를 요청합니다.
- `src/app/api/cron/resume-uploads/route.ts`, `vercel.json`: CRON_SECRET 인증 후 호출당 총 1건을 복구하는 작업과 15분 스케줄을 정의합니다. 배포/스케줄 활성화는 하지 않았습니다.
- `src/lib/upload-security.ts`: 내부 복구 token/state를 사용자 응답에서 제거합니다.
- `tools/test-upload-recovery.ts`, `tools/test-upload-recovery-integration.ts`: lease 정책과 실제 PostgreSQL CAS·재예약·이전 worker 차단·로컬 파싱·재시도 한도를 검사합니다.
- `tools/test-isolated-browser-e2e.ts`, `tools/test-auth-authorization-integration.ts`: 실제 앱의 화면/HTTP 로그인, 권한, 로컬 문서 업로드·다운로드 및 cron을 검사합니다.
- `tools/ops-readiness.ts`, `tools/lib/ops-readiness.ts`, `tools/test-ops-readiness.ts`, `docs/operating-readiness-plan.md`: 운영 변경 없이 이전 순서·검증·조건부 참조 전환·롤백 계획을 준비합니다. 입력 메타데이터를 원본 URL/ID 없이 요약하며 실제 storage 정책 확인으로 간주하지 않습니다.
- `package.json`, `.github/workflows/ci.yml`, `tsconfig.e2e.json`, 관련 문서: 검사 명령·CI 브라우저 검사·타입 검사 대상과 사용법을 추가합니다. npm 의존성과 lockfile은 변경하지 않았습니다.
- 기존 E2E 9개(`tools/test-week4-accessibility-e2e.ts`, `tools/test-landing-visual-e2e.ts`, `tools/test-mobile.ts`, `tools/test-week3-onboarding-e2e.ts`, `tools/test-site-review-e2e.ts`, `tools/test-vc-decision-e2e.ts`, `tools/test-paid-product-e2e.ts`, `tools/test-pe-document-text-e2e.ts`, `tools/test-vc-parity-e2e.ts`)와 `tools/helpers/paid-product-fixture.ts`: DB/browser 작업 전에 공통 격리 환경 가드를 확인하도록 보완했습니다. 예전 SQLite 조건과의 충돌을 제거하고 fixture 존재/email 조건을 명시적으로 검사합니다.

### 후속 검증 환경

자동 환경 파일을 복사하지 않은 임시 앱 사본, 별도의 PostgreSQL 16.15 cluster와 새 `dealmind_test` DB, Microsoft Edge를 사용했습니다. 외부 AI/스토리지/결제 자격정보를 전달하지 않았고 합성 로컬 파일과 사용자만 생성했습니다. Prisma DB push는 이 새 폐기용 DB에만 실행했습니다. 스키마 점검은 실제 DB에서 `SCHEMA_MATCH`를 확인했습니다.

Windows short/long 경로 차이 때문에 최초 node_modules junction 분리가 실패해 기존 ignored 생성 client가 PostgreSQL용으로 바뀐 것을 발견했습니다. 원래 SQLite용 client로 복원하고, 실제 복사된 별도 node_modules가 junction이 아님을 확인한 뒤 검증을 진행했습니다. 소스 스키마/원래 DB는 변경하지 않았습니다.

| 실행 명령 | 후속 결과 |
|---|---|
| `npm run test:all` | 종료 0, 83개 오프라인 하위 검사 통과. 최초 사본에 docs/fixtures 누락으로 실패한 뒤 예제 문서를 보완하고 재실행 |
| `npm run test:integration-preflight` | 종료 0, 폐기용 DB/환경/loopback 가드 통과 |
| `npm run db:check-schema` | 종료 0, 실제 격리 PostgreSQL의 SCHEMA_MATCH |
| `npm run test:upload-recovery-integration` | 종료 0, 실제 PostgreSQL 동시 claim 8개 중 1개 성공·takeover·stale/duplicate commit 거부·TXT/DOCX 파싱·실패 backoff |
| `npm run test:auth-authorization-integration` | 종료 0, 실제 로그인/세션·VC/PE/양식 권한·합성 파일 다운로드·업로드 승인 거부·재개 권한·cron 두 호출에서 각각 1개 문서 복구 |
| `npm run test:isolated-browser-e2e` | 종료 0, Edge 실제 UI 로그인·대시보드·VC TXT 업로드/다운로드·DOCX 양식 READY/다운로드·보고서 DOCX 내보내기·PE 다운로드·4역할 권한 검사. 외부 브라우저 요청 시도 0 |
| `npm run build` | 종료 0, 실제 프로덕션 build·lint·type·페이지 생성 통과 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 종료 0 |
| `node node_modules/typescript/bin/tsc -p tsconfig.e2e.json` | 종료 0 |
| 담당 source 파일 ESLint 및 `git diff --check` | 종료 0 |

최종 강화 후 `test:ops-readiness`, `test:e2e-environment`, `test:upload-recovery`를 다시 실행해 종료 0을 확인했습니다. 확대된 `tsconfig.e2e.json`은 원래 SQLite 생성 client와 격리 PostgreSQL 생성 client 기준 모두 통과했습니다. 임시 앱과 PostgreSQL은 종료했고 포트가 닫힌 것을 확인했습니다.

### 운영에서 아직 확인하지 않은 사항

- 운영 MADeal 스키마, 실제 private Blob/S3 권한, 기존 공개 파일의 이전·공개 URL 폐기는 운영 대상과 승인 없이 실행하지 않았습니다. 구체 이전/검증/롤백 계획은 `docs/operating-readiness-plan.md`에 있습니다.
- 실제 AI 요청 중 강제 종료 후 재시도가 발생하면 공급자 호출의 exactly-once는 보장할 수 없습니다. DB 결과와 이미지 정리는 lease/CAS로 제한합니다.
- DB 레코드 생성 전 중단된 고아 객체, 복구 cron의 후보 20+20 조회/1건 처리에 따른 지연·처리량 제한, Prisma diff가 비교하지 않는 RLS/view/trigger/extension은 남은 운영 검토 항목입니다.
- 로컬에서 CI와 같은 명령을 실행한 결과이며 GitHub Actions 서버의 job 실행 결과는 아닙니다.
- 가드를 추가한 기존 E2E 9개의 전체 사용자 시나리오는 이번에 실행하지 않았습니다. 이번 목적의 실제 화면/권한/복구 경로는 새 격리 suite로 검증했고, 기존 도구는 정적/타입 검사를 수행합니다.

### 추가 위임과 확인한 범위

개발은 복구 source/cron, 테스트는 새 회귀 검사·CI·검사 helper, 리뷰는 복구 정적 검토·운영 준비 계획·레거시 E2E 가드, 주 에이전트는 격리 런타임·실제 build/schema/오프라인 검증과 결과 통합을 담당했습니다. 서로 같은 파일을 동시에 수정하지 않도록 나눴습니다. Ruflo는 `swarm_init`, `agent_spawn`, `task_create`로 조정 기록을 남겼으며 실제 조사는 Codex의 하위 에이전트가 수행했습니다. 등록 응답의 모델 라벨은 실행 증거가 아니며 Ruflo `agent_execute`나 외부 Anthropic 호출은 하지 않았습니다.

직접 다시 확인할 화면은 `/login`, `/dashboard`, VC 딜 상세의 업로드/원본 링크, `/templates`, 보고서의 DOCX 내보내기, PE 딜의 데이터룸입니다. 격리 테스트 계정/문서는 정리되므로 운영 계정/실문서를 자동으로 시험한 결과가 아닙니다.

민감정보 없는 결정·실제 검증·운영 미확인 범위를 Ruflo namespace `patterns`, key `dealmind-2026-10-03-storage-schema-ci`에 저장했습니다. `memory_retrieve`의 `found: true`와 저장 값의 완전 일치를 확인했습니다. 로컬 저장소는 `.swarm/memory.db`이며 URL/계정/문서 원문/자격정보는 저장하지 않았습니다. `task_complete`와 `swarm_shutdown`으로 조정 기록도 정리했습니다.

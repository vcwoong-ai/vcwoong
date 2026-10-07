# DealMind Windows 개발 환경과 클라우드 연결 상태

2026년 10월 6일 기준 주 개발 폴더는 `W:\Dealmind\primary`이다. 기존 `W:\Dealmind\vcwoong`의 미커밋 변경과 환경 파일은 원래 위치에 보존했다. 새 폴더는 같은 Git 이력을 공유하는 별도 worktree이며, 기존 폴더의 `.git`이 필요하므로 기존 폴더를 삭제하거나 이동하지 않는다.

## 소스 기준과 보존

- 저장소: `https://github.com/vcwoong-ai/vcwoong.git`
- 브랜치: `codex/cloud-migration-20261006`
- 시작 커밋: `7de0f5831b072dbccc55ba3888100cbf51fa4654`
- 기존 폴더: `main`, `.env.local.example` 삭제와 `package-lock.json` 수정 보존.
- `AGENTS.md`, `docs/cloud-handoff.md`, `docs/external-service-connections.md`, `docs/autonomous-progress.md` 확인.
- 요청된 `docs/development-status-2026-10-06.md`는 fetch 이후 지정 원격 브랜치와 `origin/main` 모두에 없다. 다른 컴퓨터의 미공개 문서가 있다면 별도 전달이 필요하다. 이 문서는 그 원본을 대체하지 않는다.

## 로컬 실행

Node.js 24.15.0, npm 11.12.1, GitHub CLI 2.94.0을 확인했고 lockfile 기반으로 1051개 패키지를 설치했다. PostgreSQL 17 바이너리는 설치되어 있으며 현재 PATH에는 없다.

초기 설정 후 개발 서버는 `http://127.0.0.1:3000`에서 Next.js Ready 상태를 확인했다. 2026년 10월 6일 15시 20분 KST에 `netstat`으로 127.0.0.1:3000의 기존 node 프로세스 PID 31856 listener를 다시 확인했다. 앞선 listener 조회의 빈 출력을 서버 종료로 해석한 기록은 이 재확인으로 정정한다. 이번 격리 검증에서는 primary 서버를 재시작하거나 변경하지 않는다. 필요하면 아래 명령으로 재실행한다. Codex 프로젝트는 현재 상위 `W:\Dealmind` 폴더에 등록되어 있으므로 이 폴더의 `AGENTS.md`가 primary를 안내한다. 향후 프로젝트 폴더를 직접 지정할 때는 primary를 선택한다.

PowerShell에서 다음과 같이 실행한다.

```powershell
Set-Location W:\Dealmind\primary
node .devcontainer/setup.mjs
npm run dev:local -- --hostname 127.0.0.1
```

초기 설정은 키 없는 SQLite 합성 디자인 환경이다. `.env.local`에 로컬 인증 비밀값을 생성하며 파일은 Git에서 제외된다. 기존 환경 파일은 가져오지 않는다. 외부 DATABASE_URL 또는 기존 일반 환경 파일이 있으면 중단한다. `db:setup:local`은 기존 DB를 보존하기 위해 재초기화를 거절한다. Codespaces 설정은 기존 합성 DB에서 client만 재생성하며 기존 동작대로 없는 디자인 fixture를 추가할 수 있다.

Windows에서 동작하도록 `db:setup:local`과 `dev:local`의 Unix 환경변수 문법을 Node 실행기로 변경했다. npm CLI를 Node로 실행하므로 Windows의 npm.cmd와 shell quoting 문제를 피한다.

의존성 설치가 이미 끝났다면 `node .devcontainer/setup.mjs --skip-install`로 재설치를 생략할 수 있다. 시딩 중 중단된 새 DB는 자동 재시딩하지 않는다. 이번 초기화에서는 sandbox 사용자 조회 오류로 시딩이 중단되어, 이번에 생성한 빈 합성 DB에만 시딩을 별도 완료했다. 기존 고객 DB에 같은 명령을 실행하지 않는다.

## 이번 컴퓨터에서 통과한 검사

- `node .devcontainer/setup.mjs --skip-install`: SQLite client, 합성 VC·PE fixture 및 폰트 준비 완료.
- `npm run dev:local -- --hostname 127.0.0.1`: Next.js 14.2.35 Ready 확인.
- `npm exec -- tsc --noEmit --incremental false`: exit 0.
- `test:pe-document-upload`, `test:pe-storage-read-bound`, `test:pe-document-reparse-formats`: 모두 exit 0. 실제 Office/PDF 파서는 합성 메모리 자료를 사용했고 repository/storage는 mock이므로 실제 클라우드 접근이나 PostgreSQL 검증을 의미하지 않는다.
- Node 실행기 구문 검사와 변경 파일 whitespace 검사 통과.

초기 npm/Prisma 다운로드는 sandbox 네트워크 제한으로 실패하여 승인된 일반 사용자 실행으로 완료했다. tsx의 sandbox 사용자 정보 조회는 `uv_os_get_passwd ENOMEM`으로 실패했으며 일반 사용자 환경에서는 검사와 시딩이 통과했다. 내장 브라우저의 localhost 접근은 권한 거절로 차단되어 화면·콘솔·로그인 UI 검증은 미완료다. 다른 브라우저나 우회 경로로 재접근하지 않았다.

SQLite에서의 디자인 실행은 PostgreSQL CAS·예약·결제·팀·보고서 영속 검증을 대신하지 않는다. 실제 제품 검증은 별도의 loopback PostgreSQL과 합성 자료를 사용해야 한다. 운영 환경 파일·원본 자료·서비스 키를 복사하거나 운영 DB에 schema를 적용하지 않는다.

## 클라우드 병행 상태

기존 `클라우드 연결 상태 확인` 채팅의 실행 결과와 연결된 durable 작업을 확인했다. 클라우드 명령 실행은 성공했으나 해당 작업 공간은 Git 저장소가 없는 scratch 폴더였다. 별도 발견된 저장소는 main의 `9764833a81a7b0320637c4b7e877f1f7dbdc8465`이며 이전 브랜치와 기준 커밋을 찾지 못했다. 조회 당시 해당 작업은 idle이었다.

클라우드에서 지정 브랜치로 실행 중인 병행 작업은 확인되지 않았다. 로컬 자동화의 클라우드 이전과 이 컴퓨터를 껐을 때 작업 지속도 확인되지 않았다. 기존 작업의 기록만으로 환경 게시 상태 전체를 확정할 수는 없다.

클라우드 재개에는 저장소 환경 연결, 시작 브랜치 지정, 기준 커밋 확인, 실제 실행 결과 확인이 필요하다. 병행 구현은 서로 다른 codex 작업 브랜치와 파일 담당 범위를 사용한다. 합류 전 fetch와 변경 비교를 수행하고 미커밋 파일을 덮어쓰지 않는다.

## 개발 재개 우선순위

1. 격리 PostgreSQL 환경을 준비해 PE 원본 재추출의 CAS와 실제 API 흐름을 검증한다. 이미 완료된 VC 편집·승인·내보내기를 재구현하지 않는다.
2. PE 문서 파서의 총 압축 확장 크기, CPU와 메모리 격리, UNKNOWN 저장 결과 조정 및 4MiB 초과 지원의 설계를 이어간다. 기존 수동 재추출과 형식별 합성 검증 범위를 먼저 확인한다.
3. 외부 AI 품질·메일 전달·Toss 계약·비공개 저장 정책과 운영 schema 이전은 `external-service-connections.md`의 조건에 따라 별도로 연결한다. 키 입력만으로 출시 완료를 선언하지 않는다.

이번 준비에서는 커밋·푸시·main 병합·운영 배포와 유료 서비스 호출을 수행하지 않았다.

## SGC PC 후속 조사와 Ruflo 연결

후속 조사의 원격 인계에 따르면 `development-status-2026-10-06.md`는 이전 업로드 이후 기존 컴퓨터에서 작성됐다. 지정 브랜치에 없는 상태가 맞으며 이 컴퓨터에서 원본을 임의 복원하지 않는다.

SGC PC의 `.agents/skills/swarm-orchestration/SKILL.md`와 `.agents/config.toml`은 존재한다. 프로젝트 설정에는 `cmd /c npx -y ruflo@latest mcp start`가 적혀 있으나, 이 세션의 callable tool 목록에는 Ruflo가 없고 `codex mcp list --json`에도 Ruflo 등록이 없다. 프로젝트 설정 파일의 존재를 실제 MCP 연결 성공으로 해석하지 않는다. 기존 컴퓨터의 terminated swarm이나 pending task 상태도 SGC PC의 상태로 가져오지 않는다.

실제 Ruflo task 생성·완료·메모리 저장은 수행하지 않았다. native 하위 에이전트는 파서 조사 문서, 격리 PostgreSQL 검증 문서, 읽기 전용 보안 리뷰로 담당을 나눴다. 이는 Ruflo MCP task 기록과 별개다. 파서 조사와 격리 DB 담당의 문서 외에는 제품 소스 수정 권한을 주지 않았다.

연결을 재개할 때는 Codex가 실제 읽는 사용자 또는 프로젝트 `.codex/config.toml`에 MCP를 등록하고 세션을 다시 열어 도구 노출을 확인해야 한다. 설치·버전을 확인한 Ruflo 실행기를 사용하는 것이 좋다. 현재 프로젝트의 명령을 그대로 등록하는 후보는 아래와 같다. 이 명령은 이번 조사에서 실행하지 않았고 최신 패키지 설치 또는 MCP 연결 성공을 검증한 명령이 아니다.

```powershell
codex mcp add ruflo -- cmd /c npx -y ruflo@latest mcp start
codex mcp list --json
```

Git은 새 worktree를 만들었던 sandbox 계정과 현재 사용자 계정의 소유자 차이로 경고했다. 이번 조사에서는 `git -c safe.directory=W:/Dealmind/primary ...`로 해당 경로만 명시해 조회했고 전역 신뢰 설정은 변경하지 않았다. 기존 primary 변경 4개와 상위 AGENTS.md를 보존한다.

파서 자원 보완 계획은 [파서 조사](parser-resource-plan-2026-10-06.md), 이번 컴퓨터의 실제 격리 DB 검증은 [PostgreSQL 검증](postgresql-validation-2026-10-06.md)을 따른다. 클라우드 checkout 실행과 localhost 브라우저 UI 검증은 계속 미확인이다.

파서 계획의 읽기 전용 리뷰를 완료했다. 500,000자 clamp가 파싱 이후에 수행되는 점, DOCX/XLSX의 ZIP guard 공백, PPTX 개별 항목 제한의 총량 공백과 부분 누락 경고, kill 가능한 실행과 RSS 보장의 차이를 확인했다. 계획은 새 bounded 정책을 PE에서만 선택적으로 연결하며 공통 파서의 VC 기본 동작을 바로 변경하지 않는다. 신규 의존성·schema·파서 소스 변경은 이번 조사에서 하지 않았다.

리뷰한 PE 업로드·재추출·다운로드 경로에서는 정적으로 확인 가능한 권한 우회가 발견되지 않았다. 인증/딜 쓰기 범위 확인 후 본문을 읽고, 재추출은 같은 딜의 확정 비공개 원본과 해시/4MiB를 검증한다. 문서 목록은 원본 URL·metadata·본문을 감춘다. 이는 실제 배포·외부 저장 정책 검증이 아니며 legacy 공개 Blob URL의 접근 회수 문제는 그대로 남는다.

별도 TEMP 사본의 PostgreSQL 17에서 PE 재추출, 결제 영속 저장, 체크아웃 세션, 보고서 내보내기 상태, 팀 워크플로, 보고서 생성, 보고서 사용량 원장, 섹션 재생성의 기존 집중 검사 8개가 최종 exit 0을 기록했다. 최초 API 검사 4개는 소스 서버 TCP 준비 전에 실행해 실패했으며 준비 확인 뒤 같은 검사를 다시 실행했다. 초기 실패 로그를 보존하며 최초 실행을 통과로 기록하지 않는다.

검사 후 확인한 합성 관련 테이블 13개의 count는 0이었고 전용 API 서버와 PG를 종료했다. 자세한 실행 명령·로그·포트와 primary 보존 검사는 PostgreSQL 검증 문서에 기록한다. 실제 SQL·소스 API 검증이며 결제 공급자/파서/저장소 ports 및 AI 생성은 합성 범위다. 운영 PostgreSQL schema 일치·실결제·외부 저장·실제 AI 품질과 브라우저 검증은 포함하지 않는다.

최종 보존 확인에서 primary `.env.local`, `prisma/dev.db`, SQLite client의 schema는 모두 시작 전 SHA256과 같았다. 전용 3129/55449 listener는 없고 기존 3000번 PID31856은 유지됐다. 기존 로컬 변경도 보존했으며 이번 추가 변경은 조사/검증 문서다. 다음 재개 지점은 파서 계획의 PE 선택적 자원 정책과 합성 경계 검사 구현이다.

## 관리자·외부 조회·미팅 기록 후속 구현

위 보존 결과는 당시 파서 조사 범위의 기록이다. 후속 미팅 구현에서는 SQLite client를
새 schema로 재생성했으며 기존 `prisma/dev.db`에는 새 테이블을 적용하지 않았다.
기능은 기본 꺼짐으로 유지한다. 새 모델과 additive PostgreSQL patch는 전용 TEMP
합성 DB에서만 검사했다. 기존 vcwoong 환경 파일과 로컬 변경은 계속 보존한다.

문의 주소·운영자 전용 샘플 페이지와 DART/KIPRIS 조회 어댑터를 보완했다.
실제 두 조회 키는 별도 Git 무시 파일 `.env.services.local`에 있으며
`npm run dev:services`로 읽을 수 있다. 일반 `dev:local`은 이 파일을 읽지 않는다.
서버 연결과 배포 조건은 [서비스 연결 기록](release-connections-2026-10-06.md),
회의 기록 범위·검증과 실행 조건은 [개발 현황](meeting-intelligence-plan-2026-10-06.md)을 따른다.

후속 검사에서 기존 3000번 listener가 없는 것을 확인하고 `dev:services`로
127.0.0.1:3000 서버를 실행해 Ready를 확인했다. 별도 빌드 경로
`DEALMIND_LOCAL_REVIEW=1`을 사용하며 두 외부 조회 키만 시작 프로세스에 읽었다.
문의 이메일 전송과 회의 전사 키는 주입하지 않았다. 기존 fixture DB를 재초기화하지
않았다. localhost 브라우저 접근 차단은 유지해 화면·앱 요청 검증은 수행하지 않았다.

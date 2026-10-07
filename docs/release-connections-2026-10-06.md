# DealMind 서비스 연결 준비와 지속 배포

2026년 10월 6일 확인 기준이다. 기존 실제 작업환경은 `W:/Dealmind/vcwoong`이며 새 브랜치 소스는 `W:/Dealmind/primary`에서 이어간다. primary의 외부 키 없는 SQLite 합성 환경을 실제 서비스 연결 상태와 혼동하지 않는다. 기존 파일과 자격정보는 이동하거나 덮어쓰지 않았다.

## 실제 확인한 연결 수준

기존 vcwoong 환경 파일에서 값의 존재 여부만 확인했다. PostgreSQL 접속 설정, OpenRouter 키, Toss client/secret 키, 이메일 발신 주소와 인증 설정이 있다. 키 유효성, 모델 이용 권한, 잔액, 상점 계약, 실제 전달·청구와 DB 대상 일치는 이번 조회로 확인하지 않았다. 파일 저장은 local 설정이다. Resend 키, Blob/S3 키, billing vault, DART/KIPRIS 키는 확인한 해당 파일에 없다. Vercel 운영 환경에 별도로 설정됐을 가능성은 남아 있다.

Vercel 연결 도구로 기존 dealsync 프로젝트와 최신 운영 배포 3개를 조회했다. 최신 조회 배포는 `dpl_4hyTcapJt6GSFgzw1EF8jgU2KEaj`, 2026년 10월 4일, production/READY이며 이전 기록과 일치한다. 처음 teamId를 지정한 상세 요청은 404였지만 teamId를 생략한 연결 도구 요청으로 프로젝트와 환경변수 메타데이터 조회에 성공했다. 로컬 CLI 62.4.0은 기존 로그인 자격정보가 없어 조회하지 못했다. 연결 도구 성공과 CLI 로그인을 혼동하지 않는다. 프로젝트 응답은 Git 연결 필드를 제공하지 않아 자동 배포 연결은 여전히 미확인이다.

환경변수는 복호화 없이 이름·대상·유형만 조회했다(28개, hiddenProductionEnvCount=0). 단일 `DATABASE_URL`·`DIRECT_URL`·일반 `BLOB_READ_WRITE_TOKEN` 항목이 preview와 production 양쪽에 지정돼 있다. 분리된 검증용 DB·파일로 설정됐다는 증거가 없으므로 현재 Preview를 운영과 격리됐다고 취급하지 않는다. 비공개 Blob 키와 운영자 이메일은 production에 있고 `PLATFORM_ADMIN_USER_IDS`, DART/KIPRIS/Resend 키, MEETING 변수는 조회 목록에 없다. 실제 값은 읽거나 문서에 저장하지 않았다.

현재 `vercel.json`은 `codex/cloud-migration-20261006`의 Git 자동 배포를 끈다. CI는 이미 pull_request와 main push의 타입·린트·오프라인/격리 PG 검사·빌드를 포함한다. billing maintenance cron은 등록돼 있지 않으며 생성/업로드 재개 cron 두 개는 설정 파일에 존재한다. 실제 배포 스케줄 작동은 별도 확인해야 한다.

## 사용자가 먼저 준비할 일

| 순서 | 항목 | 직접 준비할 일 | 완료 확인 |
| --- | --- | --- | --- |
| 1 | OpenRouter | 기존 계정에서 키 유효성·잔액·허용 모델을 확인하고 검증 호출의 비용 상한을 정한다. 고객 투자자료 전송 전 제공자 보관 정책을 확인한다. 새 계정을 중복 생성할 필요는 없다. | 사용 가능한 기존 키, 호출 비용 범위와 자료 전송 범위 확정 |
| 2 | Resend 이메일 | 발신 도메인/하위 도메인을 등록하고 공급자가 제시하는 DNS 레코드를 도메인 관리 화면에 입력한다. Verified 상태와 발신 주소를 확정하고 발송 권한 키를 비밀 설정에 저장한다. | 도메인 Verified와 발신 주소·키 준비 |
| 3 | 운영과 Preview DB/파일 | 기존 DB/저장소 계정과 프로젝트를 확인한다. 데이터 보관·접근 정책과 백업 담당을 정한다. Preview는 운영과 분리된 검증용 PostgreSQL/비공개 파일 저장소를 사용할 수 있도록 준비한다. 새 운영 DB나 저장소를 무조건 만들지 않는다. | 기존 프로젝트와 백업 지점 확인, 분리 Preview 대상 확정 |
| 4 | Toss | 기존 키가 자동결제용 MID의 동일 모드 키인지 확인한다. 자동결제 계약/심사 상태와 실제 제공할 요금·환불/해지 정책을 확정한다. | 테스트 상점/키 조합 및 계약·정책 상태 확인 |
| 5 | 클라우드 작업 | Codex Cloud 환경에 vcwoong-ai/vcwoong을 연결하고 이전 브랜치 기준으로 준비·게시한다. 새 작업에서 브랜치/커밋을 확인한다. 운영 자격정보를 기본으로 공급하지 않는다. | 해당 소스에서 실제 클라우드 작업 실행 성공 |
| 로컬 확인 | DART/KIPRIS | 키를 별도 Git 무시 파일에 연결했다. 앱 서버와 배포 환경에는 별도 연결이 필요하다. | DART 공개 기업 예제 정상 코드 000 / KIPRIS 공개 출원인 조회와 실제 어댑터 파싱 성공 |

비밀값은 채팅·GitHub에 보내지 않는다. 공급자/Vercel의 비밀 설정 또는 별도 보호된 검증 환경에 입력하고 완료 상태만 전달한다. 현재 primary 합성 환경 파일에는 실제 서비스 키를 한꺼번에 덮어쓰지 않는다.

## 개발과 배포에서 이어 처리할 일

- 기존 자격정보를 필요한 범위에만 연결한 별도 검증 환경, 실제 AI·메일·비공개 파일의 합성 검증과 PostgreSQL 스키마 차이 확인.
- Toss 테스트 공급자 연결, 중복 callback·결과 불확정 복구·구독 갱신/취소·vault 보관 검증. 현재 checkout hard hold는 키 입력만으로 해제하지 않는다.
- PE 파서의 총 압축 확장량·부분 추출 경고·실행 자원 격리와 대용량/UNKNOWN 복구 개발.
- Preview 배포 경로와 기존 Git/Vercel 연결 확인. 사용자 로그인·도메인 소유 확인·계약 절차 외에는 개발자가 처리할 작업으로 둔다.

## 작은 변경을 지속 배포하는 흐름

완료한 변경마다 작업 브랜치/PR → 기존 CI 검사 → Preview 배포 → 핵심 흐름 검증 → 운영 반영과 결과 기록 순서를 사용한다. Preview는 검증용 DB와 파일·테스트 공급자를 사용하고 운영 cron·실청구를 실행하지 않는다. Git 연동은 production 외 브랜치 push에 Preview를 만들 수 있지만 현재 이전 브랜치의 비활성화와 환경 설정을 확인하기 전에는 자동 배포가 연결됐다고 선언하지 않는다.

CI가 통과한 것과 운영 DB가 최신 소스와 일치하는 것은 다르다. 현재 팀/결제/생성 lease/사용량 원장 등 additive schema와 기존 writer 이전 조건을 먼저 대조한다. DB schema 변경이 없는 호환 변경은 작게 자주 배포하고, schema·결제·권한 변경은 검증된 전환 범위를 별도 기록해 적용한다. 운영에 db push/seed를 실행하지 않는다.

각 배포 결과에는 Preview URL, 적용 변경, 검사 범위, 운영 반영 여부, 직전 배포/복구 기준을 함께 기록한다. 이번 요청은 지속 배포 방식을 준비하는 단계이며 이번 턴에 commit/push/main 병합·배포·운영 설정 변경은 수행하지 않았다.

## 공식 설정 안내

### 2026-10-06 이메일 연결 후속 확인

사용자는 Vercel에서 `dealmind.space`를 보유하고 있다. 이후 유료 Workspace 메일함 개설을 보류하고 DealMind 문의 주소를 `dealmindspace@gmail.com`으로 확정했다. 브랜드 공통 연락처와 Resend 테스트 수신 주소를 수정했고 자동 발송의 Reply-To에도 이 주소를 사용한다. Gmail 계정 생성·소유 확인·실제 송수신은 이번 소스 수정으로 검증되지 않는다. Vercel 도메인 목록에서 해당 팀 소유, verified 및 Vercel DNS nameserver를 확인했다. 이는 Resend 발신 인증을 뜻하지 않는다.

Google Workspace 신규 가입과 Google 메일 수신 DNS 변경은 진행하지 않는다. `dealmindspace@gmail.com`은 문의/답장 주소이며 Resend `EMAIL_FROM`으로 사용하지 않는다. 인증한 도메인의 발신 주소가 여전히 필요하고 `onboarding@resend.dev` 테스트 발신은 Resend 가입 이메일로 수신이 제한된다. 새 Gmail이 그 계정 이메일인지 미확인이다.

Resend 예제는 기존 `src/lib/email.ts`의 API 발송 함수를 재사용하는 `tools/send-resend-test.ts`와 `npm run email:resend-test`로 추가했다. `.env.resend.example`의 placeholder를 실제 키로 교체한 `.env.resend.local`은 Git에서 제외되며 primary의 합성 `.env.local`과 기존 vcwoong 환경 파일은 유지했다. 별도 파일은 Next.js에서 자동으로 읽지 않으므로 앱/배포의 이메일 연결이 완료된 상태로 해석하지 않는다.

명령 기본 실행은 설정 존재만 확인하고 네트워크 요청 없이 종료한다. `-- --send`를 명시한 경우에만 사용자 예제의 Hello World 요청을 발송한다. 실제 키의 로컬 설정 확인과 합성 fetch mock의 요청 내용 검증은 통과했고 실제 이메일은 발송하지 않았다. 키 유효성/배달을 검증한 것으로 기록하지 않는다. Resend 도메인 목록 조회는 `401 restricted_api_key`였으므로 제공한 키로 도메인을 관리할 수 없었다. 도메인 인증 여부는 미확인이다. 이 후속 작업에서는 DNS·운영 환경 변경이나 배포를 수행하지 않았다.

- [OpenRouter 시작 안내](https://openrouter.ai/docs/quickstart), [자료 수집 설정](https://openrouter.ai/docs/guides/privacy/data-collection)
- [Resend 발신 도메인 인증](https://resend.com/docs/dashboard/domains/introduction)
- [Toss 자동결제 연결](https://docs.tosspayments.com/guides/v2/billing/integration-api)
- [Vercel Git 배포](https://vercel.com/docs/git), [Blob SDK 비공개 접근](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Codex Cloud 환경 준비와 게시](https://learn.chatgpt.com/docs/environments/cloud-environments)

## 관리자·공시·특허 연결 후속 작업

문의 주소는 `dealmindspace@gmail.com`으로 변경했다. `/admin` 운영자 홈과
`/admin/demo` 읽기 전용 샘플 목록·상세를 추가했으며 기존 비용 화면도 같은 운영자
레이아웃과 권한 검사에 연결했다. 일반 로그인 화면의 공개 데모 버튼·계정 안내를
제거하고 운영 환경에서 기존 seed 계정 로그인과 이전 세션 사용을 차단했다.
개발·격리 검사 환경의 합성 계정과 샘플 데이터는 유지했다.

모든 관리자 페이지는 데이터 조회 전에 현재 DB 계정의 ID와 이메일을 확인한다.
`PLATFORM_ADMIN_USER_IDS`와 `PLATFORM_ADMIN_EMAILS` 양쪽에 등록한 계정만
접근할 수 있으며 데모 계정은 등록해도 제외된다. 기존 이메일만 지정한 비용 운영자도
배포 전에 소유를 확인한 계정 ID를 추가해야 한다. 사용자의 실제 관리자 계정은 아직
확정하지 않았고, 문의 Gmail을 자동으로 운영자 계정으로 등록하지 않았다.
샘플 자료만 조회하며 고객 계정 전환·자료 다운로드·데모 수정 기능은 추가하지 않았다.

제공받은 DART 키는 Git 무시 파일 `.env.services.local`에만 저장했다. 공식 기업 개황
예제 `corp_code=00126380`을 1회 호출해 HTTP 200, 정상 코드 `000`, 예제 종목코드
일치를 확인했다. 전체 재무 수집이나 운영 DB 반영·배포 검증의 증거는 아니다.
키나 요청 URL은 로그와 문서에 기록하지 않는다.

기존 KIPRIS 어댑터의 HTTP 주소와 혼용된 인증·페이지 인자를 공식 `/openapi/rest`
형식으로 수정했다. HTTPS, `accessKey`, `docsStart`, `docsCount`를 사용하고 공식
`PatentUtilityInfo`와 기존 `item` XML 응답을 읽는다. API 거절에는 두 번째 검색을
실행하지 않으며 요청 URL을 포함할 수 있는 예외를 출력하지 않는다. 최초 키 없는 HTTPS
응답은 인증 성공으로 기록하지 않았다. 이후 사용자가 제공한 키를 같은 Git 무시 파일에
입력하고 공개 출원인 예제 1건의 인증 조회를 확인했다. 실제 `searchKiprisPatents`로도
별도 1회 호출하여 출원번호·발명명·출원인이 파싱됨을 확인했다. 원문과 키는 출력하지 않았다.

신규 연결 시 KIPRIS Plus에서 **특허·실용 공개·등록공보의 REST Open API**를 이용 신청하고
해당 서비스 이용 승인·인증키를 확인한 후 `.env.services.local`의 `KIPRIS_API_KEY`에
직접 입력한다. 이번 제공 키는 조회 가능한 상태이며 계정의 승인 화면 자체는 확인하지 않았다.
추가 키를 채팅이나 GitHub에 붙여넣지 않는다. 호출 한도·상용 서비스 이용
조건은 신청 화면과 승인 조건을 확인하며 무료·무제한 이용으로 가정하지 않는다.

`npm run services:check`는 키 존재만 확인한다. `-- --dart`, `-- --kipris`는 선택한
공개 예제만 호출하고 고정된 상태 메시지만 출력한다. `npm run dev:services`가 이 파일을
읽어 로컬 합성 환경으로 실행한다. 기존 3000번 서버가 더 이상 listen하지 않는 것을
확인한 뒤 해당 명령으로 127.0.0.1:3000 서버를 새로 실행해 Ready를 확인했다.
실제 두 키가 시작 프로세스에 연결됐으며 브라우저·앱 요청에서의 조회는 미확인이다.
Next.js는 `.env.services.local`을 자동으로 읽지 않는다.
실제 배포에서는 같은 서버 변수 이름을 해당 Vercel 환경에 따로 연결해야 한다.

신규 KIPRIS 계약 검사는 외부 호출 없이 공식 응답 모양·키 인코딩·페이지 제한·검색
fallback·오류·로그 비밀값 제외를 확인했다. 관리자 검사는 기존 seed 로그인 차단,
현재 계정 기준 권한, 각 페이지의 조회 전 권한 검사와 샘플 소유자 범위를 확인했다.
운영 로그인·실제 브라우저·이메일 전달·배포는 미확인이다. 앱과 검사 도구 TypeScript
검사 및 변경한 화면·인증·KIPRIS 어댑터의 집중 lint는 통과했다.

추가 질문 없이 개발을 이어가라는 요청에 따라 녹음 파일 업로드·딜 연결·비공개 원본·전사 작업·회의록 수정과 확정·내보내기를 구현했다. [개발 현황](meeting-intelligence-plan-2026-10-06.md)에 실제 범위와 실행 조건을 기록했다. 격리 SQLite/PG에서 권한·동시 한도·처리 불확정·확정 충돌·삭제를 검사했으며 합성 WAV의 FFprobe 길이 검증도 통과했다. 전체 테스트와 타입·집중 lint·Next.js 빌드를 통과했다. 실제 전사 공급자 호출·브라우저 확인·외부 작업 호스팅·운영 schema 적용은 수행하지 않았다. 기능은 기본 꺼짐이다. 직접 녹음과 기존 IR 대조·보고서 반영은 후속 범위다.

배포 전에는 운영과 분리된 Preview DB·비공개 파일 저장소, 외부 키의 환경별 연결, 소유 확인한 운영자 계정 ID, 새 모델의 적용 범위를 준비한다. 기존 운영 환경을 기본으로 사용하는 Preview는 배포하지 않는다. 개발·검증은 질문 없이 수행하고 배포 직전에만 사용자에게 확인한다. 이번에는 커밋·푸시·배포·운영 설정 변경을 수행하지 않았다.

- [DART 기업 개황 명세](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019002)
- [KIPRIS 출원인 REST 명세](https://plus.kipris.or.kr/portal/popup/DBII_000000000000001/SC002/ADI_0000000000015118/apiDescriptionSearch.do)
- [KIPRIS Open API 개발 가이드](https://plus.kipris.or.kr/portal/bbs/view.do?bbsId=B0000001&menuNo=210149&nttId=1060&pageIndex=1)

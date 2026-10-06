# 격리된 인증·권한 검증

`npm run test:all`은 오프라인 검사입니다. 실제 앱·DB 호출은 `test:auth-authorization-integration`, `test:upload-recovery-integration`, `test:isolated-browser-e2e`로 분리되어 있으며 CI에서 새 PostgreSQL 서비스와 새 앱 프로세스를 대상으로 실행합니다. 합성 로컬 파일을 검사하며 실제 Blob/S3/AI/결제 연동까지 통과했다는 의미는 아닙니다.

## 실행 조건

- 운영 환경 파일이 없는 별도 깨끗한 checkout을 사용합니다. `.env`, `.env.local`, 개발/운영/테스트용 자동 로드 파일이 있으면 내용을 읽지 않고 거부합니다.
- 앱 주소는 경로·query·사용자정보 없는 loopback HTTP origin이어야 합니다.
- `DATABASE_URL`과 `TEST_DATABASE_URL`은 동일한 로컬 PostgreSQL `dealmind_test` DB를 명시해야 하며 `DEALMIND_E2E_ISOLATED=1`이 필요합니다. 기존 `dev.db` 및 운영 DB는 허용하지 않습니다.
- CI와 같이 DB와 앱 프로세스를 새로 만듭니다. 이미 실행된 localhost 서버가 어떤 DB나 환경으로 시작되었는지는 클라이언트 가드가 증명할 수 없습니다. 개발 서버 재사용을 피합니다.
- 외부 AI·스토리지·결제·메일 등의 실제 공급자 자격정보를 전달하지 않습니다. `STORAGE_MODE=local`, `UPLOAD_DIR=./.e2e-uploads`를 사용합니다.
- 앱과 테스트의 `NEXTAUTH_URL`/`BASE_URL`은 같아야 하며 테스트 전용 세션 서명 설정만 전달합니다. 실제 사용자 키를 복사하지 않습니다.

`npm run test:integration-preflight`은 DB 연결·파일 내용 읽기·앱 실행 전에 위 조건을 확인합니다. 통과 후에도 앱 프로세스는 같은 환경으로 별도로 시작해야 합니다. `.github/workflows/ci.yml`이 새로운 DB 초기화와 서버 시작 순서를 보여줍니다. 기존 DB에 `prisma db push`를 실행하는 안내가 아닙니다.

## 검증 범위

- 실제 NextAuth 로그인 성공/실패, 대소문자 이메일과 세션 사용자/역할.
- VC 딜 요약 및 PE 문서 목록의 소유자·같은 팀 ANALYST/PARTNER·외부인 권한.
- 공유/비공개 VC·PE·템플릿 다운로드의 실제 합성 파일 바이트, 익명/타인 거부, `private, no-store` 및 attachment 헤더.
- PE HTTP 수정의 읽기전용 사용자 거부, PARTNER의 공유 딜 수정, 소유자의 비공개 딜 수정과 DB 반영.
- Blob 설정이 없는 상태의 토큰 발급 거부. 실제 Blob 토큰은 발급하지 않습니다.
- 테스트 세션 서명 설정으로 생성한 합성 업로드 승인에 대한 최종 등록 HTTP 요청: 변조/다른 사용자 사용 거부, 유효한 승인이라도 딜 쓰기권한이 없는 사용자 거부. 외부 객체 조회까지 진행하지 않습니다.
- 복구 예약의 PostgreSQL 동시 claim 8개 중 승자 1개, 만료 후 재예약, 오래된 worker의 결과 저장 거부, 중복 완료 거부, 기존 pending/ANALYZING 레코드의 예약 채택 및 재시도 한도.
- 실제 복구 worker의 합성 로컬 TXT 추출·DOCX 파싱/키워드 매핑, 로컬 파일 없음의 backoff. 종료된 worker는 만료 예약 fixture로 재현하며 운영 프로세스를 종료하지 않습니다.
- 실제 브라우저 로그인·대시보드·소형 TXT 업로드·원본 링크 다운로드·DOCX 양식 업로드/파싱·양식 기반 보고서 DOCX 내보내기. 보고서 본문은 합성 DB fixture이며 AI 생성은 실행하지 않습니다.
- 복구 API의 현재 편집 권한과 cron 인증 거부, 합성 cron 인증으로 두 tick에서 각각 문서 한 개씩 복구. 조회 권한만으로 worker를 시작할 수 없습니다.

fixture는 무작위 `e2e-auth-` 접두사를 쓰고 생성한 ID만 정리합니다. DB fixture와 합성 파일은 `finally`에서 정리합니다. 앱 자체의 외부 연동 코드 전체를 테스트에서 대체한 것은 아니므로 신규 검증을 추가할 때 실제 공급자 호출이 발생하지 않는지 확인해야 합니다.

## 오프라인 검사와 한계

`test:e2e-environment`, `test:upload-security`, `test:upload-recovery`, `test:ops-readiness`, `test:security`, `test:schema-readiness`는 실제 공급자·DB·브라우저 없이 실행합니다. `ops:readiness`는 입력된 메타데이터로 계획만 생성하며 운영 연결이나 객체 복사를 하지 않습니다. `npx tsc -p tsconfig.e2e.json`은 프로젝트 기본 타입 검사에서 제외된 이번 변경의 검사 도구도 확인합니다.

PE 브라우저 E2E 3개와 로그인 이메일 E2E에도 동일한 환경 가드를 적용했습니다. PE fixture 생성/브라우저 실행이 실패해도 이미 생성된 데이터 정리와 DB 연결 종료를 시도합니다. Chromium은 Playwright 기본 설치 또는 `PLAYWRIGHT_EXECUTABLE_PATH`를 사용합니다. CI는 신규 브라우저 suite를 실행하도록 기존 Playwright의 Chromium을 준비합니다. 기존의 모든 PE 기능 E2E를 CI에 포함한 것은 아닙니다.

기존 accessibility·landing·mobile·onboarding·site-review·VC decision·paid-product·PE document text·VC parity 검사 9개와 paid-product fixture helper에도 가드를 추가했습니다. 이 기존 시나리오들은 이번 실제 브라우저 실행 대상에 포함하지 않았으며, 신규 격리 브라우저 suite를 실제 실행했습니다. 기존 데모 사용자에 의존하는 검사는 깨끗한 DB에 해당 합성 fixture를 별도로 준비해야 합니다.

오프라인 grant 테스트는 재시도에 같은 `uploadId`가 유지됨을 검증합니다. 실제 Blob 업로드 완료 후 재등록의 동시성·파싱·공급자 metadata 조회는 실제 private Blob 환경에서 별도 검증해야 합니다. 공개되어 있던 기존 Blob URL은 코드 변경만으로 접근이 철회되지 않습니다.

## VC 모바일 온보딩·오류 화면 검증 환경

격리 사본은 `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`를 함께 포함해야 합니다. `.js`만 복사하면 실제 `.mjs` 설정이 빠질 수 있습니다. PostCSS 설정 없이 생성한 캐시에는 처리되지 않은 `@tailwind`가 남을 수 있으므로 설정을 복구한 뒤 이전 사본의 빌드 캐시를 분리하고 새로 빌드합니다. 운영/사용자 작업 디렉터리의 캐시를 무조건 지우지 않습니다.

`test-isolated-browser-e2e.ts`는 설정 파일 존재와 실제 body 기본 여백/box-sizing을 확인해 스타일 없는 화면에서 검증을 통과했다고 보고하지 않습니다. 모바일 overflow 실패 진단은 합성 환경의 태그·클래스·치수만 출력하며 입력값·고객명·세션을 출력하지 않습니다. 스크린샷은 해당 격리 사본의 `.e2e-artifacts/`에만 저장합니다.

확장된 모바일 검증은 키보드 첫 VC 딜 CTA/필수 섹터 오류 포커스, UI 딜 등록, 거절된 파일 요청0/문서0, 작은 합성 TXT 업로드, 실제 AI 미연결 503 안내/report0/quota admission0, 같은 화면 삭제 카드 제거, 메뉴 Escape 포커스 반환, 승인된 합성 보고서 편집/새로고침/DOCX·PPTX 다운로드를 확인합니다. 실제 AI로 생성한 보고서의 근거 품질이나 실제 기기 터치·외부 Blob을 검증한 결과가 아닙니다.
### VC 조회 실패와 복구 회귀 (2026-10-05)

`npm run test:vc-client-error-flow`는 기존 업로드와 실제 TSX의 상태 조회/비교/점수/IC 질문 콜백을 합성 React hooks/effect 및 요청으로 검증한다. 인증·HTTP·네트워크·형식 오류, 5회 조회 실패, GET-only 재시도, 쿼리/딜 변경·unmount의 늦은 응답/POST 콜백/finally를 포함한다. 실제 서버 mutation 취소나 StrictMode 동작을 보장하는 테스트는 아니다.

격리 `test-isolated-browser-e2e.ts`는 모바일 점수 탭과 보고서 IC 질문, 비교 화면에 GET500만 주입하여 오류 안내를 확인하고, 주입을 해제한 뒤 실제 API GET200으로 복구한다. 장애 응답은 합성이며 성공 조회는 격리 DB/서버에 연결한다. API 공급자 장애·유료 모델 품질은 별도 검증 대상이다. 조회 재시도는 생성/계산 POST를 호출하지 않아야 한다.
### 양식·섹터·칸반 보조 흐름 (2026-10-05)

`test:vc-client-error-flow`는 양식 GET 오류/READY 선택 검증/GET 재시도, 섹터 실패와 수동 안내, 닫기·딜 변경의 늦은 응답, wizard 재열기 후 이전 생성 응답 차단·조회 전용 요청0을 합성 React VM에서 실행한다. 칸반 선택의 요청 잠금·확정 성공 반영·오류·새 props 반영도 포함한다.

격리 브라우저는 detail/wizard 양식 GET500과 섹터 POST500, 단계 PATCH403을 주입한다. 오류 원문·실제 공급자 호출은 사용하지 않는다. 양식 복구 GET200과 키보드로 변경한 단계 PATCH200은 실제 격리 서버/DB 결과를 확인한다. 이전 UI 회귀를 함께 실행한다. 390px 브라우저는 실제 휴대폰 터치/스크린리더 검증의 대체가 아니며 다른 탭의 단계 충돌은 현재 서버 last-write-wins 범위에 남는다.
### 생성 응답의 결과 미확정·오류 보호 (2026-10-05)

실제 wizard 콜백을 합성 VM으로 실행하여 HTTP/네트워크/JSON 오류 원문이 화면에 나오지 않는지, 생성 동일이벤트 POST1인지, 잘못된 ID로 downstream 요청이 없는지 검증한다. canonical 전체 섹션 수/개수/상태와 완료 일관성을 검사하며 정상 PENDING checkpoint, 409와 20회 재개 상한도 회귀 대상으로 유지한다.

격리 브라우저는 생성 성공201에 잘못된 ID만 주입해 role alert와 결과 확인 경로, 상태 조회0·추가 생성0·실제 report0을 확인한다. 다음 사용자 동작의 실제 AI 미연결503 안내도 검증한다. 장애 주입은 실제 공급자 장애/모델 품질 검증을 대체하지 않는다. 정상 자동 재개는 기존 정책이며 새 생성 재시도와 구분한다.
# PE 조회 실패·문서 원문 격리 회귀 (2026-10-05)

`npm run test:pe-client-error-flow`는 실제 MA 상세 TSX 콜백을 합성 hook VM에서 실행한다. 조회 실패를 빈 결과와 구분하고 자동 반복 GET 차단, 명시 GET-only 복구, 바뀐 딜/해제의 늦은 응답 차단을 검증한다. 공급자/DB/브라우저 호출은 없다.

`tsx tools/test-pe-document-text-e2e.ts`는 외부 키·환경 파일을 제거한 격리 Next/PostgreSQL 사본에서만 실행한다. `BASE_URL`, `TEST_DATABASE_URL`, `DEALMIND_E2E_ISOLATED=1`과 격리 브라우저 실행 파일 설정이 필요하다. 테스트 guard가 localhost 주소만으로 충분한 격리를 보장하는 것은 아니다. 사용자·팀·딜·자료는 합성 생성 후 scoped transaction으로 정리하고 count0을 확인한다. 실제 투자자료나 운영 DB를 사용하지 않는다.

1440/390px에서 자료/근거 조회 GET500 주입→탭 전환 추가 요청 없음→수동 실제 GET복구, 원문 pagination·XSS 비실행·문서 변경시 이전 텍스트 없음·빈텍스트·503복구·포커스·viewport 검증. HTTP는 인증/팀·개인·교차 딜 scope/동일404/offset/no-store/목록 원문 제외/POST405를 확인한다. 스크린샷 `.e2e-artifacts/pe-document-text/after-{1440|390}.png`. 브라우저 외부 origin HTTP·serviceworker 제한은 서버 outbound 전체 차단과 다르다. 자료는 DB로 미리 생성하므로 신규 업로드나 실제 스토리지 연결 검증이 아니다.
## PE 재무 저장과 재조회 분리 (2026-10-05)

`test:pe-client-error-flow`는 실제 상세/입력 TSX 콜백의 재무 GET 실패·이전 목록 보존·조회 복구·저장 성공 후 callback 실패·같은 이벤트 POST1·결과 미확정 재저장 차단·변경 딜/해제 응답 차단을 합성 VM에서 검증한다.

문서 텍스트 E2E에는 모바일 실제 재무 POST201→후속 GET500 주입→명시 GET200→화면 갱신·DB 기간1·POST1 회귀를 추가했다. 조회 오류 배너는 재시도 시작에도 사라질 수 있어, 테스트는 GET200 응답과 FY2024 화면 반영을 기다린 뒤 완료를 판정한다. 초기 테스트의 조기 화면 확인 실패를 이 대기로 수정했다. 스크린샷 `.e2e-artifacts/pe-document-text/financial-after-390.png`. 실제 금융 자료·DART·AI·운영DB는 사용하지 않는다.
## PE 파일 업로드 (2026-10-05)

`npm run test:pe-document-upload`는 저장소·파서·DB 포트를 합성해 4MiB 상한/형식/MIME/유형/빈 파일·UUID 검증, 엄격한 multipart 필드·선언/실제 스트림 한도·초과 취소, route 인증/권한 확인 전 본문 읽기0, 사용자·딜별 작업 ID, 동일 파일 재전송·동시 예약의 저장1, 다른 내용 거절, 파싱 경고, 저장 결과 미확정 보류, 응답 비공개 정보 제외를 실행한다. 실제 파서 호출 계약의 파일명 전달도 확인한다. DB/파일/외부 호출이 없는 모의 검증이다.

`test:pe-client-error-flow`에는 실제 `PeFileUploader` TSX 콜백 VM 회귀를 추가했다. 동일 이벤트 POST1, 확정 저장 뒤 목록 오류와 저장 실패 분리, 미확정 응답의 새 작업 차단·GET 확인·미등록 때만 같은 UUID 명시 재전송, 다른 업로드 UUID 응답 거절, 권한/딜 변경·해제 후 늦은 응답 차단을 확인한다.

`tsx tools/test-pe-document-text-e2e.ts`는 명시한 합성 PostgreSQL/Next·비공개 로컬 저장만 사용한다. STORAGE_MODE=local, UPLOAD_DIR=./.e2e-uploads 조건을 추가했다. 실제 합성 TXT 업로드→추출→protected download 원본 byte 일치→새로고침 후 텍스트 조회, POST 저장 성공 후 목록 GET500 수동 복구, auth401/조회전용·다른 팀404, 동일 작업200 replay/다른 내용409/동시 작업 생성1, 4MiB+1 요청413·문서 증가0을 확인한다. fixture 소유 문서의 private-local 파일 경로를 전용 폴더 안으로 확인한 뒤 파일과 DB 행을 정리한다. 기존 파일·운영 데이터에는 접근하지 않는다. screenshot upload-after-390.png. 스캔/복합 실제 투자문서·실제 Blob/S3·중단 복구·큰 파일 검증을 대신하지 않는다.
## PE 변경 결과·ORM 로그 보호 (2026-10-05)

`test:prisma-log-policy`는 실제 singleton 소스를 각 NODE_ENV VM에서 실행하여 새 생성 log[]와 cache 재사용을 확인한다. 변경 전 설정으로 RED를 확인했고 변경 후 GREEN이다. 이미 생성된 Prisma 인스턴스의 옵션을 재설정하는 테스트는 아니며 프로세스 재시작이 필요하다.

PE client VM은 변경 전 DART HTTP500 원문 toast를 RED로 재현했다. 변경 후 DART HTTP/HTML/network/malformed 응답 고정 안내, 동기 요청1, 부분 저장 미확정·GET-only 확인·자동 재가져오기0, importedPeriods0 신규 저장 오인0, 상태 GET 확인 이후 실제 상태 기반 다음 PATCH, canEdit 공유 편집/조회 전용 및 늦은 응답 보호를 확인한다.

격리 문서 E2E의 모바일 DART POST500은 브라우저에서 주입해 실제 공급자 호출 없이 고정 안내·GET 목록 확인·추가POST0/기간 변화0을 검증한다. 상태 PATCH500 주입은 실제 DB ACTIVE를 유지하고, 명시 GET 복구 후 사용자 클릭의 실제 PATCH200으로 ARCHIVED를 확인한다. 다른 탭의 변경 경쟁이나 실제 DART 데이터를 재현한 것이 아니다. 기존 파일·재무·원문·권한 회귀도 함께 실행한다.

## PE 검토·내보내기 격리 브라우저 검증 (2026-10-05)

기존 `test:pe-production-readiness-e2e`, `test:pe-ic-audit-e2e`, `test:pe-frontend-productization-e2e`를 재사용했다. `tools/helpers/pe-browser-actor.ts`가 명시한 loopback PostgreSQL dealmind_test에 실행별 합성 PARTNER 계정·팀을 생성하고, 소유 딜·계정·팀만 정리하며 잔존 0을 확인한다. 데모/SMOKE 계정에 의존하지 않는다. 실행 전 clean workspace/외부 자격정보 부재/동일 TEST_DATABASE_URL/격리 플래그를 검사한다. 서비스 워커와 외부 브라우저 요청을 차단한다. 원본 콘솔·예외·계정·딜 식별자는 출력하지 않는다.

로컬 Next에는 Vercel 전용 `/_vercel/speed-insights/script.js`가 없어 최초 세 테스트는 기능 검증 후 콘솔 404로 실패했다. 해당 exact-origin 단일 계측 스크립트에만 명시한 빈 JS 모의를 적용한 뒤 세 명령 모두 exit0. 제품 API·화면 오류의 검사는 유지한다. 이 검증은 실제 Vercel 계측의 검증이 아니다. 준비 상태 테스트 문서 URL도 외부 주소 대신 inert private-local 합성 참조를 사용한다. 패널이 없을 때 모바일 검사가 통과하던 조건은 실패하도록 바꿨다.

확인: 재무 출처 모순 3탭/목록 경고, 문서 목록 parsedText 제외, 검토 완료→Review #1→자료 변경→재검토 필요→Review #2와 이전 스냅샷 보존, 빈 변경 요청 차단·코멘트/감사 이력, DOCX/PPTX/인쇄 본문의 현재 fingerprint, 390/768/1024px 화면과 전체 탭 회귀. 서버와 DB는 별도 env-free TEMP 사본의 전용 Next3119/PostgreSQL55448이며 공급자 호출 없음. 각 실행 cleanup 성공.

당시 한계(후속 「PE 검토 자료 버전 보호」에서 화면/서버 버전 검사를 보완): 순차 재검토만으로는 사용자가 보고 있던 버전에 대한 동시성 보호를 증명하지 못했다. `src/app/api/ma-deals/[id]/ic-review-signoff/route.ts:60`의 자료 계산과 `src/lib/pe/pe-ic-review-signoff-repository.ts:126` 저장 사이 변경 경쟁, 사용자 화면의 expected fingerprint 전달 여부는 다음 한정 조사 대상이다. 현재 서명은 서버에서 새로 계산한 자료를 저장하므로 사용자가 본 뒤 바뀐 자료를 서명할 가능성이 남는다. 내보내기 명시적 private/no-store 헤더도 별도 검토 대상이며 공개 유출을 재현한 것은 아니다. 실제 공급자·운영·고객 투자자료 품질은 미확인. 이번 단계는 테스트·문서만 변경했고 앱 기능·스키마·의존성은 변경하지 않았다.

## PE 검토 자료 버전 보호 (2026-10-05)

- 화면에 실제 렌더된 canonical 판단 자료·근거 요청 상태를 공통 JSON material로 만들고 WebCrypto SHA256으로 계산한다. 뒤늦은 GET의 fingerprint를 승인용으로 복사하지 않는다. material 객체가 바뀌면 이전 비동기 해시로 검토 완료할 수 없다. 해시가 준비되지 않거나 WebCrypto가 실패하면 완료 버튼을 활성화하지 않는다.
- REVIEWED PATCH는 lowerhex64 expectedFingerprint가 필수이며 누락/형식 오류400. 서버는 현재 사용자/team 역할·쓰기 권한, canonical 조회, 서버 해시 비교, 서명·불변 snapshot·audit 저장을 동일 Serializable transaction으로 처리한다. 값이 다르면409/쓰기0. P2034/P2002 최대3회 재시도도 원래 expected를 유지하며 초과409. 서버 계산값만 저장한다.
- 패널은 동기 pending ref로 같은 화면 중복 클릭을 막고, 늦은 다른 resource/언마운트 조회를 버린다. 409 또는 결과 미확정은 추가 상태 변경을 보류하고 ‘최신 자료 다시 불러오기’로 전체 화면을 다시 확인한다. 오류 원문을 표시하지 않는다. 새 의존성·DB schema 변경 없음.
- 실제 PATCH 모듈의 변경 전 테스트는 expected 누락이200(기대400)으로 RED. `npm run test:pe-signoff-version` 최종 GREEN. 같은 transaction port 전달, bounded retry, 합성 rollback, 고정 오류 및 한국어/zero/sort/material변경의 browser/server hash parity를 오프라인으로 확인한다. 실제 PostgreSQL SSI의 경쟁을 이 VM으로 증명하지 않는다.
- 격리 `npm run test:pe-ic-audit-e2e -- http://localhost:3119`에서 화면 확인 후 합성 DB finding 변경→실제 PATCH409→review/snapshot/audit 불변→완료 버튼 보류→명시 전체 reload→Review1/자료변경/Review2→DOCX/PPTX/인쇄 fingerprint·모바일까지 최종 PASS. 예상409의 브라우저 resource 콘솔 메시지는 그 단계·정확한 endpoint·오류형식에만 제한하여 제외한다. 다른 제품 오류는 검사를 유지한다.
- 기존 production-readiness/frontend-productization E2E도 최종 PASS. `test:all`, 집중 lint, 앱/E2E 타입 검사와 production build PASS. 실제 공급자·운영자료·키·배포는 사용하지 않았다.

잔여 한계: 저장 이후 별도 변경은 정상 재검토 대상이다. 실제 PostgreSQL 동시 writer를 강제로 경합시킨 검증은 미실행이며, 반복 성공 서명은 기존 정책대로 새 snapshot을 추가한다(멱등 보장 없음). 해시 범위는 기존 canonical decision과 evidence request subset이며 회사명 등 모든 헤더 문구를 포함하지 않는다. 실제 투자자료 품질·공급자·운영 검증은 별도다.

## PE 내보내기 HTTP 응답 보호 (2026-10-05)

`src/lib/private-response-headers.ts`의 공통 상수를 PE `committee-pack/export`와 `ic-memo`에 적용했다. DOCX/PPTX 성공과 401/404/500에 `Cache-Control: private, no-store, max-age=0`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`를 명시한다. 두 GET은 force-dynamic이며 session/team/loader/생성 예외를 고정 한국어 500 안내로 처리한다. 인증·팀 조회 권한·문서 내용·기존 percent-encoded filename·잘못된 format의 DOCX 기본값은 유지했다. 새 의존성/DB schema 변경 없음.

`npm run test:pe-export-privacy`는 실제 route 모듈 VM의 DOCX/PPTX·401·404·loader/generator500, 비로그인 조회/생성0, 파일명 CRLF 인코딩과 오류 원문 비노출을 검증한다. 기존 HEAD의 실제 두 route를 격리 TEMP 사본에서 실행하면 guest401 헤더 assertion RED1, 수정본 GREEN0. 실제문서생성·외부호출은 없는 VM이다.

격리 `test:pe-ic-audit-e2e -- http://localhost:3119`에서 실제 위원회 DOCX/PPTX 내용 fingerprint를 유지하며 헤더, IC메모 두format 실제생성/MIME/헤더, 양route·두format guest401·소유자없는딜404헤더를 확인했다. 기존 stale409→명시reload·불변snapshot·재검토·comments·print·390/768px도 PASS, 합성actor cleanupPASS. 이 검증은 서버 응답의 정책을 확인한 것이며 운영 CDN이나 실제 공개유출을 재현한 것이 아니다. 이미 사용자가 내려받은 파일의 보호/폐기는 별도 정책이다.

당시 다음 범위였던 VC/LP 응답 헤더·오류 로그는 아래 후속 「VC·LP 내보내기 응답 보호」에서 로컬 완료했다. 실제 공급자·운영배포·투자자료 품질은 연결 목록과 고객 검수에 남는다.

## VC·LP 내보내기 응답 보호 (2026-10-05)

기존 `PRIVATE_RESPONSE_HEADERS`를 VC DOCX/PPTX와 LP 내보내기에 적용했다. 성공·비로그인·조회 실패·500 모두 캐시 저장 금지, Cookie 구분, MIME 추측 방지를 명시한다. VC 공용 로더가 반환하는 오류의 본문·상태·기존 헤더는 보존하고 기존 Vary에 Cookie를 합친다. 인증·조회도 예외 처리에 포함하며 오류·양식 대체 로그는 고정 문구만 남긴다. `src/lib/template/slide-extraction.ts`의 실패 로그에서도 자료 제목·원문 예외를 제거했다. 기존 양식 재현·대체·문서 내용·권한·markExported 정책은 유지했다. 새 의존성·DB schema 변경 없음.

`npm run test:vc-lp-export-privacy`의 실제 route VM은 변경 전 DOCX 401 헤더 누락 RED1→수정 후 GREEN0을 확인했다. 기본·재현·대체 모드, 파일 형식/파일명, 401/400/403/404/409 및 인증·조회·생성·상태 저장 실패500, 오류 원문 비노출, 슬라이드 추출 실패→null을 검증한다. 실제 공급자는 모의 포트로 대체한다.

`tsx tools/test-isolated-browser-e2e.ts`는 env-free 합성 PostgreSQL/Next/비공개 로컬 저장에서 실제 VC·LP DOCX/PPTX 생성·헤더, guest401·missing404, 공유 ANALYST/PARTNER·다른 팀 읽기 범위를 확인했다. 기존 가입·업로드·삭제·보고서 수정/검토/재접속·모바일 내보내기 회귀도 통과했다. 합성 사용자·펀드 잔존0과 로컬 파일 정리를 확인하고 서버를 종료했다. 전체 offline suite·집중 lint·최종 앱/E2E types·build도 통과했다.

주의: VC 양식 재현은 설정에 따라 AI 보조 추출이나 저장소 읽기를 수행할 수 있다. 이번 실행은 실제 자격정보가 없었으며 실제 유료 AI·원격 저장소 검증이 아니다. 운영 CDN·실제 투자자료 품질·외부 서비스는 별도 연결/고객 검증 대상이다. 당시 남은 내보내기 버전 문제의 후속 결과는 아래에 기록한다.

## VC 내보내기 입력 버전 보호 (2026-10-05)

`loadReportForExport`가 파일 생성에 사용한 본문·승인 상태와 전체 DB 입력(문서·양식·점수·근거·질문 포함)을 서버에서 기록한다. `markExported`는 Serializable 트랜잭션에서 같은 조회를 다시 수행하고 정확히 일치하는 FINAL/승인 버전만 EXPORTED로 기록한다. 수정·재승인 또는 충돌이면 상태 변경을 건너뛰고 원래 파일은 반환한다. 새 의존성·스키마 변경 없음.

- `npm run test:report-export-state`: 실제 이전 함수로 수정·재승인 B를 오래된 A로 EXPORTED 기록하는 RED를 재현한 뒤 GREEN. 현재 버전/자료 변경·같은 날짜 본문 변경·초기 DRAFT·승인 누락·빈 섹션·반복 기록·P2034 건너뛰기·고정 오류를 실제 소스 VM으로 검증. DB와 공급자는 모의 포트다.
- `npm run test:report-export-state-integration`: 환경/격리 DB/외부 키 가드를 먼저 확인한 실제 PostgreSQL 검증. A 캡처→B 수정·재승인, 회사명과 근거 변경(보고서 날짜 불변), 같은 승인 입력, DRAFT→FINAL, GENERATING 보존 및 합성 자료 정리 통과. 파일·AI 생성 없이 생성 구간 사이 변경을 순차로 삽입하며 실제 동시 SSI 충돌을 강제로 재현한 검증은 아니다. 격리 PostgreSQL 전용으로 실행하고 offline `test:all`에는 넣지 않는다.
- `npm run test:vc-lp-export-privacy`: 두 VC 경로가 정확히 캡처한 서버 상태를 전달하는 회귀 포함 통과. 기존 실제 VC/LP 브라우저 흐름도 통과.

완료 순간의 팀 탈퇴·권한 철회는 별도로 재검사하지 않는다. 최초 읽기 권한은 기존대로 유지된다. 외부 URL 뒤 파일 바이트나 AI 출력의 동일성, 다운로드 후 파일 회수, 실제 모델 품질을 보장하는 기능은 아니다. 전체 입력을 보수적으로 비교하므로 파일에 보이지 않는 DB 필드 변화도 완료 기록을 건너뛸 수 있다.

## 비밀번호 재설정 소비 보호 (2026-10-05)

정확한 토큰 해시와 만료 조건으로 한 요청만 토큰을 소비하고 비밀번호 변경까지 같은 트랜잭션에서 처리한다. 저장 실패 시 소비가 롤백된다. 원문 오류 대신 고정 로그를 남기며 만료된 이전 토큰 정리는 새 링크를 지우지 않는다. 기존 schema/의존성을 그대로 사용한다.

npm run test:password-reset-consumption은 실제 이전 소스 동시 성공2 RED 후 최신 VM GREEN이다. npm run test:password-reset-integration은 가드 통과한 합성 PostgreSQL에서 동시 성공1/재사용 거부/승자 비밀번호/만료 old 삭제·new 보존/missing-user 실제 rollback과 정리를 통과했다. 전체 offline·앱/E2E 타입 검사·집중 lint·최종 빌드 통과. 최초 빌드는 샌드박스 공개 폰트 차단으로 실패했으며 승인된 동일 사본 재실행으로 통과했다.

실제 메일 전달·링크 브라우저 화면·운영 검증은 실행하지 않았다. VM transaction은 모의이고 actual PG 두 호출에는 동일 read barrier를 강제하지 않았다. 동시 링크 발급 시 복수 링크 문제는 이번 소비 수정 범위 밖이다. 다음은 보고서 stale edit와 재생성 뒤 부모 버전 동기화의 정적 후보를 먼저 재현하는 한정 작업이다. 자세한 명령·담당·Ruflo 저장 거부는 autonomous-progress.md 최신 항목을 따른다.

## 보고서 편집·검토 버전 일치 (2026-10-05)

본문 PATCH는 편집을 시작한 원본 section digest가 필수이며 누락400/불일치409로 기존 본문을 보존한다. UI는409나서버갱신에도 작성 중 초안을 유지하고, 저장·재생성·승인한 현재 섹션을 부모 화면과 동기화해 현재 본문으로 완성 요청한다. 기존 FINAL 일괄 승인 정책은 유지한다. 자동 병합이나 외부 클라이언트 전환을 보장하지 않는다.

실제 이전 소스 RED2 후 test:report-edit-review/test:report-editor-consistency 최종 GREEN. 실제 격리 브라우저에서 누락400·다른 요청 B 저장→옛 화면 C 저장409/초안 C·DB B 보존→명시 reload/current save200, 모의 AI 재생성 결과 D→실제 승인/FINAL200을 확인했다. source API/PG 합성 생성 고객 흐름과 재생성 중 수동 편집 보존 회귀도 통과했다. 전체 offline·최종 타입·빌드·lint PASS. 실제 AI·메일·원격 저장소·운영 검증은 별도다. 자세한 실패/재실행·담당·한계는 autonomous-progress.md 최신 항목을 따른다.

## 비밀번호 재설정 링크 동시 발급 (2026-10-05)

기존 토큰 삭제와 새 토큰 생성은 같은 Serializable 트랜잭션이며 P2034만 총3회 이내 재시도한다. 요청별 토큰/해시/30분 expiry는 재시도 중 불변, 실패 시 삭제도 롤백, raw token은 commit 후만 반환한다. 기존 소비 보호·schema·메일 interface 유지.

test:password-reset-issuance 실제 이전 소스 active2 RED→최신 VM GREEN. test:password-reset-integration은 실제 PG 첫두 DELETE 뒤 barrier로 발급 경합을 강제하여 실제 P2034>=1/재시도 뒤 활성1을 확인했고, 추가 중첩3라운드/소비/만료/rollback/정리도 통과했다. 전체 offline·타입·build·lint PASS. 상세 SQLSTATE는 검사하지 않았다. 구버전 writer 혼재·메일 도착 순서·실제 전달·운영 적용은 미확인이다. 여러 메일 중 가장 나중에 도착한 것이 유효하다고 단정하지 않는다.

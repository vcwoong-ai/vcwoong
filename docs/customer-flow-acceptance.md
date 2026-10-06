# 고객 업무 흐름 확인표

2026-10-05 기준. 로컬 변경은 운영 배포와 다르다. 최신 운영 기록은 `deployment-2026-10-04.md`, 각 실행 근거는 `autonomous-progress.md`에 있다.

## VC: 확인한 범위

| 고객 업무 | 실제 로컬 검증 | 남은 확인 |
| --- | --- | --- |
| 가입·로그인·재접속 | 격리 Next/PostgreSQL 브라우저 가입·로그인, 비밀번호 변경 후 JWT 무효화 | 실제 이메일 전달·본인 확인·운영 세션 |
| 딜 등록·자료 업로드 | 합성 파일 업로드, 잘못된 파일 차단, 딜 경계·조회 권한·업로드 오류 회귀 | 실제 비공개 Blob/S3 연결·이전 공개 URL 회수 |
| 보고서 생성·근거 | 실제 소스 API+격리 DB로 합성 10섹션 완료, quota/lease·재개·실패·중복 보호 | AI 내용은 합성. 실제 유료 모델의 정확성·출처·비용·권한은 미검증 |
| 검토·수정·저장 | 실제 격리 API/브라우저 편집·재접속·승인 버전, 늦은 응답 차단 | 실제 투자팀 업무·동시 협업 검수 |
| DOCX/PPTX | 합성 보고서 실제 내보내기·완료 상태 제한 회귀 | 실제 고객 문서·브랜드 양식의 육안 검수 |
| 오류·모바일·권한 | 390px 브라우저, 수동 조회 복구, 팀/개인 범위, 조회 전용·원문 보호 | 실기기 터치·스크린리더·운영 모니터링 |

관련 실행: `tools/test-free-customer-journey.ts`, `test-isolated-browser-e2e.ts`, `test-vc-client-error-flow.ts`, `test-report-generation-integration.ts`, `test-team-workflow-integration.ts`. 브라우저 오류는 합성 응답 주입이며 실제 공급자 장애가 아니다. VM은 실제 TSX 콜백을 사용하지만 React/fetch/timer 환경은 합성이다.

결제 로컬 연결과 합성 검증은 구현되어도 hard hold가 유지된다. 계약·실결제·실제 webhook·운영 스케줄은 확인하지 않았다. 연결·패치 순서·활성화/복구는 `external-service-connections.md` 참조. 환경변수만으로 계약·데이터 이전·실제 모델 검수를 완료할 수 없다.

## PE: 이번에 확인한 범위

- `src/app/ma-deals/[id]/ma-deal-detail-client.tsx:177`: 자료·근거 요청 실패를 빈 결과와 구분하고 자동 GET 반복을 멈춘다. 명시적 다시 조회, 딜 변경/해제 후 응답 차단. VM은 401/403/500/network/invalid/늦은 응답을 검증했다.
- `tools/test-pe-document-text-e2e.ts`: 실제 격리 Next/PostgreSQL + Edge 1440/390px에서 자료/근거 GET500 → 탭 전환 추가 요청 없음 → 명시적 실제 GET200 복구, 문서 텍스트 페이지 이동·XSS 비실행·포커스·빈 텍스트·503 복구·권한401/동일404 확인. 합성 fixture 생성·삭제를 수행하며 조회한 원문 row가 유지되는지 별도로 확인한다.
- 브라우저 외부 HTTP는 차단하고 서비스워커를 끈다. 서버 외부 통신 전체 차단 장치는 아니다. 외부 자격정보를 제거한 사본에서 내부 DB 조회만 실행했다. 실제 스토리지/AI/DART 검증이 아니다.

## PE 복구 작업의 완료 이력과 출시 잔여

1. **PE 작은 파일 업로드 연결 완료(로컬).** documents route에 POST/작업 상태 GET을 추가하고 MA 상세 데이터룸에 `PeFileUploader`를 연결했다. 기존 MADocument/파일 검증/비공개 저장/파서/다운로드를 재사용하며 schema·의존성 추가 없음. 지원 형식 PDF/DOCX/PPTX/XLSX/TXT, 파일당 4MiB 이하. 파일 저장과 텍스트 추출 결과를 구분한다.
   - 검증: 실제 격리 브라우저/DB에 합성 TXT 업로드→텍스트 추출→원본 보호 다운로드→새로고침 후 원문 조회. 저장 완료 뒤 GET500 주입은 목록 GET만 복구. 실제 인증401/조회전용·다른 팀404, 같은 작업 재전송200/다른 내용409, 동시 요청의 문서1/저장 승자1, 4MiB 초과413·새 문서0 확인. 원본 URL·텍스트·잠금 토큰은 업로드 응답에서 제외했다. PDF/DOCX/PPTX/XLSX의 실제 고객 자료 파싱과 실클라우드는 이번 검증 아님.
   - 남은 범위: 4MiB 초과 PE 전용 직접 승인 업로드, 중단된 저장의 관리자 조정/자동 복구, 파싱 재개. 저장 결과 불확정 예약은 재업로드를 보류하며 자동 복구를 구현했다고 주장하지 않는다. VC 승인 토큰/Document recovery를 PE에 그대로 전용하면 안 된다. [업로드 범위·복구](pe-document-upload.md) 참조.
2. **재무 추가 후 재조회 실패 복구 완료(로컬).** MA 상세 `refreshPeriods`와 `add-financial-period-dialog.tsx`는 저장 성공/목록 조회 실패/저장 결과 미확정을 구분한다. 조회 실패 시 기존 목록 보존·고정 안내·GET 전용 복구, 같은 이벤트 중복 저장 차단, 늦은 응답 차단을 추가했다. 미확정 POST 후 재저장은 차단하며 결과 조회만으로 원래 저장 성공을 단정하지 않는다.
   - 검증: actual TSX VM에서 HTTP/network/invalid/동시 클릭/늦은 응답/성공 후 callback 실패. 실제 격리 모바일 브라우저에서 POST201→조회 GET500 주입→수동 GET200→화면 FY2024, DB 기간1·POST1 확인. 실제 DART 가져오기/운영 자료는 호출하지 않았다.
   - DART·딜 상태 변경 오류 보호도 로컬 보완했다. 실제 TSX VM에서 기존 DART 오류 원문 노출을 RED로 확인한 뒤 고정 안내·동기 중복 잠금·늦은 응답 차단·결과 미확정 조회를 검증했다. DART 일부 연도만 저장될 수 있어 network/5xx는 미확정으로 표시하고 GET 목록 성공만으로 재가져오기를 허용하지 않는다. 추가 기간0은 신규 저장 성공으로 표시하지 않는다. 상태 변경은 실제 GET 상태 확인 후 다음 명시 변경을 허용하며 기존 공유 편집 권한을 유지한다.
   - 격리 모바일 브라우저에서 DART POST500은 주입하여 실제 공급자0/추가POST0, 상태 PATCH500 주입→실제 GET ACTIVE→명시 실제 PATCH200 ARCHIVED/DB 일치를 확인했다. 실제 DART 연결은 미확인이고 탭 간 상태 변경은 기존 last-write-wins다. 미확정 hold는 클라이언트 상태이며 새로고침 후의 영속 작업 원장이나 상태 CAS를 추가하지 않았다.
3. **실제 고객·공급자 검증.** VC 핵심 흐름은 로컬 검증을 확보했지만 실제 한국 VC 담당자의 근거 검수, 모델 품질, 문서 양식, 서비스 계약, 운영 패치 이전이 남는다. 자동 테스트 통과만으로 출시 완료를 주장하지 않는다.

당시 PE 세 브라우저 suite는 미실행이었다. 아래 「PE 검토·내보내기 격리 브라우저 검증」에서 합성 fixture/외부 요청 제한/정리를 확인한 뒤 모두 통과했다. 중첩 응답 필드는 현재 id 수준 검증보다 더 깊은 방어가 필요할 수 있다. 이번 업로드 변경은 로컬이며 운영 배포되지 않았다.

## 실제 역할 분담

native development: MA 자료 조회 수정. native testing: PE VM 회귀와 기존 문서 E2E 안전화. native review_security: 소스·격리 경계·문구 읽기 검토. root: VC 안내, 연결 문서, 테스트 연결, 실제 격리 실행, PE 브라우저 실패 복구/정리 확인 추가. 같은 파일의 변경은 testing freeze 후 root로 순서대로 넘겼다.

Ruflo MCP는 상태 확인·지속 작업 기록·안전한 패턴 저장/재조회에 사용했다. 코드 위임과 실행은 native 에이전트/로컬 도구이며 Ruflo가 직접 실행했다고 표현하지 않는다.

공통 Prisma 자동 로그와 대상 DART/API의 원본 오류 로그를 제거했다. 기존 서버 인스턴스에는 재시작이 필요하며 다른 명시적 앱 로그까지 전부 감사했다는 뜻은 아니다. [DB·DART 로그 보호](runtime-log-privacy.md) 참조.

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

주의: VC 양식 재현은 설정에 따라 AI 보조 추출이나 저장소 읽기를 수행할 수 있다. 이번 실행은 실제 자격정보가 없었으며 실제 유료 AI·원격 저장소 검증이 아니다. 운영 CDN·실제 투자자료 품질·외부 서비스는 별도 연결/고객 검증 대상이다. 당시 남은 내보내기 버전 문제는 아래 후속 검증으로 보완했다.

## 파일 생성 중 보고서 수정 (2026-10-05)

완료 조건: A 파일을 만드는 동안 보고서 B가 수정·재승인되면 B를 A의 내보내기 완료로 표시하지 않는다. 본문뿐 아니라 근거·질문·점수·양식·문서 등 DB 입력도 비교한다. 같은 승인 입력만 완료로 기록하고, 수정·생성 중·초기 미승인 자료는 상태를 유지한다. 원래 A 파일 다운로드는 기존대로 허용한다.

실제 소스 회귀와 격리 PostgreSQL에서 본문/헤더/근거 변경 보존, 동일 입력 기록, DRAFT/GENERATING 상태 보존을 확인했다. 실제 브라우저의 가입·업로드·편집·검토·새로고침·VC/LP 양형식 내보내기·팀 접근·모바일 흐름도 통과했다. 실제 유료 AI 품질·원격 파일 내용 변화·완료 순간 권한 철회·강제 동시 DB 충돌은 미검증이며 출시 전 연결/고객 검증 목록에 남는다. 이번 작업은 로컬이며 운영 화면에 배포하지 않았다.

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

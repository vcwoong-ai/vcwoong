# 2026-10-03 운영 배포 결과 및 기록

## 최종 결과: 운영 전환 완료

사용자가 비공개 스토리지 생성·연결·스토리지 키/운영 설정 변경을 추가 승인했습니다. 기존 파일과 데이터는 삭제하지 않는 조건을 유지했습니다. 아래 최초 보류 기록 이후 다음 작업을 완료했습니다.

- 새 private store `dealmind-private-documents` (`store_KWClKfnrAZqoYYJd`, icn1)를 생성했습니다. 기존 Public BlobDB는 유지했습니다.
- 기존 토큰 이름 충돌로 자동 연결이 한 번 실패했습니다. 생성된 store를 재사용해 `PRIVATE_BLOB_READ_WRITE_TOKEN` 접두사로 연결한 뒤, 앱의 token/store ID 및 private access 설정을 업데이트했습니다. store를 중복 생성하지 않았습니다.
- `BLOB_LEGACY_PUBLIC_STORE_IDS`와 `src/lib/storage.ts`의 정확한 이전 public host 허용으로 기존 문서 읽기 호환성을 유지했습니다. `tools/test-upload-security.ts`에 허용 store/타 store 차단/공개 원본에 비공개 credential을 보내지 않는 회귀 검사를 추가했습니다.
- 설정 반영 후 배포 `dpl_HVFduBQSrephgMUyTKtcT3CoZ4tp`, https://dealsync-bdfj65uyw-vcwoong.vercel.app 을 생성했습니다. 원격 build 1분 18초, READY.
- 업로드 검사 통과 후 `vercel promote`로 운영 도메인을 전환했습니다. `vercel inspect www.dealmind.space`에서 위 배포 ID와 production/READY를 확인했습니다.
- 실제 URL: https://www.dealmind.space

### 실제 운영 검증

| 검증 | 결과 |
|---|---|
| 일반 multipart TXT 앱 업로드 | PASS, 새 private store에 저장·문서 추출 |
| 서명 승인/클라이언트 토큰 발급·직접 private 업로드·최종 등록 | PASS |
| 두 신규 문서의 인증 다운로드 | PASS, 합성 원본과 일치·private/no-store |
| 새 private 원본 URL의 익명 접근 | PASS, 거부 |
| 앱 다운로드의 익명 접근 | PASS, HTTP 401 |
| 기존 문서의 인증 다운로드 | PASS, 내용 원문은 출력하지 않음 |
| 인증된 PE 목록 GET | HTTP 200, 전체 PE 기능 검증으로 간주하지 않음 |
| 실제 Edge 운영 로그인·대시보드 렌더·딜 화면 다운로드 | PASS |
| 운영 도메인 `/`, `/login`, `/api/health` | HTTP 200, 공개 health=ok |
| 인증 없는 복구 cron | HTTP 401 |
| 새 배포 최근 15분 error 로그 최대 100건 샘플 | 오류 항목 0, 전역 무오류 보장 아님 |

검증용 딜 `cmushgh7f0001ld04fr0hcmbu`와 합성 문서 2개는 삭제하지 않고 남겼습니다. 기존 딜/파일을 수정하거나 삭제하지 않았습니다. 새 store 확인 시 Blob Count=2, Size=182B였습니다. 검증용 문서에는 고객/회사 실제 자료가 없습니다.

추가 로컬 검사 `test:upload-security`, `test:security`, `test:upload-recovery`, 프로젝트/도구 tsc, storage ESLint, git diff --check가 통과했습니다. 프로젝트 dependency lockfile과 소스 Prisma 스키마는 바꾸지 않았습니다. 운영 DB DDL·seed·기존 데이터 삭제·결제·유료 AI 생성은 실행하지 않았습니다.

기존 public 원본 URL 자체는 별도 이전/폐기 전까지 공개 상태입니다. 이번 결과는 신규 업로드 보호와 기존 다운로드 호환성을 확인한 것이며 기존 public 파일 전체의 비공개 이전 완료를 의미하지 않습니다.

## 최초 배포 및 보류 기록

사용자가 이번 변경의 직접 운영 배포를 승인했습니다. 운영 DB 수정·기존 파일 이전·API 키 변경은 기존 제한 범위에 남아 있습니다.

## 확인한 배포

- 프로젝트: `vcwoong/dealsync` (`prj_Bor0MCAhNfTXwCu803tiazw6zgSK`).
- 배포 ID: `dpl_42oiZ6gjP83FGS98UMD7uYXjqZuZ`.
- URL: https://dealsync-orofxx4pv-vcwoong.vercel.app
- target: production, 상태 READY, 원격 build 1분 32초.
- `vercel deploy --prod --skip-domain --yes`로 생성했습니다. 새 배포 생성과 운영 도메인 전환을 구분합니다.
- 기준 Git HEAD는 `f355ca40592bf7050a4ef43ee6bcd1273aa457a4`이며 이번 작업의 미커밋 변경을 포함한 소스 사본을 업로드했습니다. 커밋/푸시는 하지 않았습니다.
- 사본은 소스·설정·runtime 파일 625개입니다. 로컬 환경 파일/업로드 문서/DB/Ruflo 메모리는 포함하지 않았습니다. Vercel의 기존 환경 설정을 사용했고 운영 환경 파일을 로컬로 pull하지 않았습니다.

## 전환 전 실제 확인

배포 보호 우회는 로그인된 Vercel CLI에서만 사용했습니다. 우회 자격정보는 출력/저장하지 않았습니다.

| GET 요청 | 결과 |
|---|---|
| `/` | HTTP 200 |
| `/login` | HTTP 200 |
| `/api/health` | HTTP 200, 공개 상태 `ok` |
| `/api/auth/session` | HTTP 200 |
| `/api/documents/deployment-check/download` | 익명 HTTP 401 |
| `/api/cron/resume-uploads` | 인증 없는 요청 HTTP 401 |

위 검사는 실제 운영 사용자로 로그인한 업무 화면 검증이 아닙니다. health의 SELECT 1 성공은 모든 PE 테이블의 준비 완료를 의미하지 않습니다. 운영 DB DDL·seed·문서 업로드·AI 생성·결제는 실행하지 않았습니다.

## 운영 도메인 전환을 보류한 이유

실제 연결된 기존 BlobDB의 metadata를 조회해 Access=Public을 확인했습니다. 파일 원문이나 목록은 읽지 않았습니다. 운영 환경 변수 목록에는 `BLOB_STORE_ACCESS`가 없습니다. 이번 코드의 비공개 업로드 가드로 인해 현재 설정에서 새 업로드는 거부됩니다.

비공개 스토리지 생성·연결 및 필요한 스토리지 설정 변경 승인, 또는 업로드 제한을 이해한 상태에서 설정을 유지하는 코드 배포 선택을 사용자에게 요청했습니다. 승인되지 않은 저장소/키 변경·기존 공개 파일 이동/삭제를 수행하지 않았습니다.

전환 전 운영 도메인 `www.dealmind.space`가 가리키는 기존 배포는 `dpl_CaAXbZsgAH17mmT8UJjVrWg6xyVG` (https://dealsync-helqqobvi-vcwoong.vercel.app)입니다. 새 배포를 해당 도메인에 promote하지 않았습니다. 필요 시 기존 배포가 롤백 기준입니다.

## 다음 작업

1. 사용자 스토리지 선택 확인.
2. private store를 연결할 경우 기존 공개 파일의 읽기 호환성과 새 업로드 자격정보를 함께 설계. 기존 파일을 자동 삭제하거나 이동하지 않음.
3. 필요한 설정으로 다시 운영용 build, 익명/권한/스토리지 검사 후 기존 운영 도메인에 promote.
4. 운영 도메인 접속 및 배포 ID 확인, 범위를 제한한 오류 로그 확인. 운영 DB 변경은 별도 확인된 차이와 승인에 따라 진행.

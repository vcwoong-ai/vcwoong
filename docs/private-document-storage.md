# 문서 비공개 저장과 다운로드

신규 VC 문서·템플릿·문서에서 추출된 이미지의 Blob 저장은 `access: private`만 사용한다. 공개 저장으로 재시도하지 않는다. 다운로드는 문서 ID로 현재 로그인 사용자의 소유/팀 조회 권한을 확인한 후 서버에서 원본을 읽어 `attachment`, `private, no-store`, `nosniff` 응답을 반환한다. VC, PE, 템플릿 화면에 인증된 원본 다운로드 링크를 제공한다. 이미지 원본은 클라이언트 metadata에 노출하지 않으며 PPTX 생성 서버가 비공개 저장소에서 직접 읽는다.

## 배포 전 필요한 저장소 조건

- Vercel Blob에는 private access store가 필요하다. 해당 store의 access 설정을 확인한 후 `BLOB_STORE_ACCESS=private`로 명시해야 업로드 준비/토큰 발급/서버 업로드가 허용된다. 이 값은 운영자의 설정 확인이며 자체적으로 실제 store 정책을 검증하는 API 호출은 아니다. 기존 public store에 `private` 옵션을 넣는 것만으로 해당 store나 기존 객체가 비공개로 바뀌지 않는다. 설정 누락 시 업로드를 거절하고 공개 fallback은 없다. 이 작업에서 store/토큰/환경 설정은 변경하지 않았다.
- 자체 store 호스트는 `BLOB_STORE_ID` 또는 런타임 `BLOB_READ_WRITE_TOKEN`의 store 식별자로 제한한다. 토큰은 브라우저에 전달하지 않는다. 다른 store, query/hash/userinfo, 경로 traversal은 거절한다. 원본 읽기는 redirect를 따르지 않고 50MB 바이트 상한을 적용한다.
- S3는 비공개 버킷과 Block Public Access 설정이 필요하다. 코드의 객체 ACL 생략만으로 공개 버킷 정책을 제거할 수 없다. 실제 AWS 설정은 확인하거나 변경하지 않았다.
- 로컬 신규 파일은 기본 `.private-uploads/`에 저장한다. `UPLOAD_DIR`가 앱 `public/` 내부를 가리키면 신규 저장을 거절한다. 새 디렉터리는 Git에서 제외한다.

## 직접 업로드 승인

브라우저는 먼저 인증된 준비 요청으로 서버 생성 경로와 15분 유효 HMAC 승인을 받는다. 승인에는 사용자, 딜/템플릿 범위, 문서명, MIME, 크기, 업로드 UUID가 묶인다. 기존 `NEXTAUTH_SECRET`을 재사용하며 키 추가/변경은 없다. Blob 토큰 발급과 최종 등록에서 승인을 다시 검증한다. 최종 등록 시 자체 private store의 객체 metadata를 조회해 경로·크기·MIME을 확인한다. Blob overwrite는 거절하며 DB 등록 ID를 업로드 UUID로 고정해 동시 재등록도 동일 객체로 제한한다. 현재 사용자 권한은 최종 등록 시 다시 확인한다.

## 기존 공개 파일의 제한

기존 public Blob URL과 `public/uploads` 파일의 공개 접근은 코드 변경만으로 폐기되지 않는다. 기존 원본은 호환 읽기를 유지하지만 API/페이지는 원본 주소 대신 권한 확인 다운로드 경로를 제공한다. 이미 알려진 공개 URL까지 보호하려면 별도로 원본을 private store/디렉터리로 옮기고 DB의 저장 참조를 갱신한 뒤 공개 객체를 삭제해야 한다. 그 전에는 기존 파일의 비공개 전환을 완료했다고 볼 수 없다.

운영 원본 이동, 객체 삭제, DB URL 갱신, bucket/store 변경은 수행하지 않았다. 다른 store의 기존 원본은 자체 store 제한으로 읽기를 거절하므로 이전 URL 목록과 복구/전환 계획을 확인한 후 적용해야 한다. 실제 Blob/S3 연동 및 브라우저 다운로드 흐름은 승인된 비운영 저장소에서 검증해야 한다.

## 중단된 추출과 양식 분석의 자동 복구

기존 Document.metadata 및 ANALYZING Template.structure에 내부 `__uploadRecovery` 처리 상태를 저장한다. 새 DB 컬럼은 추가하지 않는다. 최초 처리와 복구 모두 10분 lease를 원자적 CAS로 선점하며 최대 3회까지 처리한다. 실패 후 최소 1분을 기다리며, 마지막 시도 실패/중단은 문서 경고 또는 Template.ERROR로 종료한다. lease와 내부 token은 클라이언트 응답에서 제외한다. 완료/실패 저장은 해당 lease token·원래 JSON/updatedAt이 그대로일 때만 가능하다. 늦게 돌아온 이전 워커가 새 결과를 덮어쓰지 못한다. 이전 워커가 만든 이미지도 그 token의 파일만 정리한다.

기존 예약 문서는 정확히 기존 ‘텍스트 추출 중’ 경고를 갖고 생성 후 10분이 지난 경우만 복구 대상이다. 일반 파싱 실패 문서를 임의로 다시 처리하지 않는다. 기존 ANALYZING 양식은 updatedAt 이후 10분이 지나면 대상으로 삼는다.

`/api/cron/resume-uploads`는 기존 `CRON_SECRET`으로 인증하며 Vercel 배포 설정에 매시간 7/22/37/52분 호출을 추가했다. 보고서 생성 cron과 실행 예산을 분리하고 매 호출 총 1건만 처리한다. 각 종류에서 후보 최대 20건을 읽어 만료/재시도 시점과 나이를 확인한다. 이번 단계에서는 배포하거나 운영 cron을 활성화하지 않았다. 사용자 수동 재개는 `POST /api/documents/:id/resume`, `POST /api/templates/:id/resume`에서 현재 편집 권한을 다시 확인하며 같은 lease 규칙을 적용한다. 실패 한도가 소진된 파일은 원본을 확인한 후 삭제·재업로드해야 한다.

lease는 함수의 240초 최대 실행시간보다 길다. 완료 저장은 CAS로 보호되지만 외부 AI 제공자의 요청을 exactly-once로 보장하는 것은 아니다. 호출 응답을 받기 전 프로세스가 종료되면 다음 복구에서 해당 요청이 다시 발생할 수 있으며 자동 재시도 한도로 제한된다. DB 등록 전 종료되어 파일만 저장된 고아 업로드는 복구 대상 DB 레코드가 없어 이 흐름에서 자동 등록하지 않는다.

각 종류별 앞선 후보 20건이 아직 실행 중/재시도 대기 중이면 뒤의 만료 작업은 다음 호출로 밀릴 수 있다. lease 10분과 시도 한도, 완료/실패 상태 제거로 이 지연을 제한한다. 처리량이 지속적으로 매 15분 1건을 넘는 환경에서는 전용 큐/워커 처리량 설계가 추가로 필요하다.
# 운영 연결 보완 — 2026-10-03

새 비공개 Blob store 연결로 `BLOB_STORE_ID`가 달라져도 기존 공개 파일을 읽을 수 있도록 `BLOB_LEGACY_PUBLIC_STORE_IDS`에 이전 store ID를 명시합니다. 쉼표로 구분된 영숫자 ID만 허용하고 해당 store의 정확한 public host만 읽습니다. 임의 host/URL은 추가하지 않습니다. 신규 업로드 승인은 계속 현재 private store만 허용합니다.

이번 운영 설정은 기존 공개 store를 삭제하지 않고 새 private store를 추가했습니다. 새 store는 충돌을 피하는 `PRIVATE_BLOB_READ_WRITE_TOKEN` 이름으로 연결한 뒤 실제 앱용 `BLOB_READ_WRITE_TOKEN` 및 `BLOB_STORE_ID`를 새 store에 맞췄습니다. 공유된 토큰/ID 변수의 Production·Preview 대상에 맞춰 access/legacy 설정도 두 환경에 추가했습니다. 자격정보 원문은 기록하지 않습니다.

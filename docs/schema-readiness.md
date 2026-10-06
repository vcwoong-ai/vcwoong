# DB 스키마 준비 상태 확인

앱 빌드 성공은 DB 테이블 준비 완료를 의미하지 않습니다. PE 테이블 누락은 VC dashboard도 중단시킬 수 있습니다. 운영 장애 기록은 `docs/site-review-release/PRODUCTION-BLOCKER.md`에 있으며 현재 운영 상태는 별도 확인해야 합니다.

## 조회 전용 검사

`npm run db:check-schema`는 기존 Prisma 6의 `migrate diff`로 선택한 PostgreSQL DB와 `prisma/schema.prisma`를 비교합니다. SQL 적용, migration 실행, seed, client 생성은 하지 않습니다. 조회 전용 자격정보를 사용하세요.

- `SCHEMA_CHECK_DATABASE_URL`을 의도한 DB/branch/schema에 대해 명시적으로 설정해야 합니다. `DATABASE_URL`로 대체하거나 환경 파일을 자동으로 읽지 않습니다.
- PowerShell: `$env:SCHEMA_CHECK_DATABASE_URL = '<조회 전용 접속 정보>'; npm run db:check-schema`. 실제 값은 문서·로그·Git에 기록하지 않습니다. 사용 후 `Remove-Item Env:SCHEMA_CHECK_DATABASE_URL`로 제거합니다.
- schema 사본을 임시 디렉터리에서 읽고 datasource를 단일 환경변수 참조로 제한합니다. 원본 URL이나 direct/shadow URL을 파일 또는 명령 인수에 저장하지 않습니다.
- 출력에는 접속 URL, DB 오류 원문, SQL, 데이터 내용이 없습니다. 임시 사본은 검사 후 삭제합니다.
- 종료 코드: `0 / ready` 비교 대상 일치, `2 / drift` 차이 발견, `1 / unverified` 미설정·잘못된 입력·실행 실패·시간 초과. `unverified`를 준비 완료로 취급하지 않습니다.

Prisma가 표현할 수 있는 테이블·열·타입·관계·인덱스 등의 차이를 확인합니다. RLS, view, trigger, extension, 실제 데이터, migration 이력 및 생성된 Prisma client의 일치는 보장하지 않습니다. 차이 발견 시 도구가 DDL을 자동 적용하지 않습니다.

## 차이 발견 후 절차

1. 대상 DB/branch/schema와 배포 Git revision을 확인합니다. 런타임 Prisma client와 코드의 revision도 확인합니다.
2. 승인된 조회 환경에서 차이와 `prisma/patches/`의 기존 SQL을 대조합니다. 이 저장소에는 Prisma migration 이력이 없으므로 패치 적용 기록을 따로 확보합니다.
3. 누락 객체별 최소 DDL, 기존 데이터 영향, 백업·복구 절차를 준비합니다. 모든 과거 패치를 일괄 실행하거나 `db push`를 운영에 실행하지 않습니다.
4. 격리 PostgreSQL에서 적용 전후 검사와 VC/PE 인증 흐름을 검증합니다. 운영 적용은 별도 승인된 작업입니다.

CI의 격리 DB에 대한 검사와 운영 DB 검사는 구분합니다. CI가 통과해도 운영 DB가 준비됐다는 증거는 아닙니다.

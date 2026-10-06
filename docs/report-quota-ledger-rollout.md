# 보고서 사용량 원장 적용 준비

작성일: 2026-10-05. 로컬 코드·schema·추가 SQL에 대한 검토와 합성 검증 문서다. 운영 DB 조회·migration·backfill·배포·트래픽 차단·계정 삭제를 실행하지 않았다. 결제·AI 호출이나 유료 활성화와도 별개다.

## 1. 목적과 집계 정책

기존 보고서 한도는 현재 남아 있는 보고서 수를 세므로 보고서/딜을 삭제하면 사용량도 줄어든다. 신규 원장은 **생성이 허용되어 보고서가 생성된 횟수**를 남겨 새 보고서의 삭제로 한도를 회복하는 문제를 막는다. AI 결과 성공 횟수나 토큰 비용 원장이 아니다. 허용된 새 보고서가 나중에 생성 실패·삭제되더라도 그 admission은 월 사용량에 남는다. 기존 보고서의 재개·섹션 재생성은 새 admission을 만들지 않는다.

현재 집계식은 다음과 같다.

```text
보고서 사용량 = 이번 KST 월의 사용자 소유 ReportQuotaAdmission 수
             + 같은 월의 원장 연결이 없는 legacy 보고서 수
```

- 원장 `userId`는 **딜 소유자**다. 팀원이 대신 생성해도 팀원의 개인 사용량으로 옮기지 않는다. 원장 생성 시 소유자가 저장되므로 이후 보고서가 없어져도 그 기록의 소유자를 유지한다.
- `quotaAdmission`이 연결된 보고서는 legacy 수에서 제외한다. 같은 보고서를 양쪽에서 중복 집계하지 않는다.
- 보고서 집계 범위는 KST 월 시작 포함, 다음 월 시작 제외다. route는 사용자·딜 잠금 이후 한 번 잡은 admission 시각을 quota 조회·report.createdAt·원장.createdAt에 같이 사용한다.
- 양식(template)은 기존 사용자별 KST 월 시작 이후 현재 양식 수 집계를 유지한다. 양식 삭제 보존 정책까지 바뀌었다고 주장하지 않는다.
- 새 테이블 미적용·client 불일치·DB 오류는 legacy-only 집계나 0건으로 fallback하지 않는다. 신규 생성이 거부되어야 하며 원장/보고서 쓰기와 AI 시작이 진행되지 않아야 한다.

근거: `src/lib/quotas.ts:29`의 월 범위, `:53`의 원장 수·`:57`의 연결 없는 legacy 조건·`:63`의 기존 양식 집계. `src/app/api/deals/[id]/reports/route.ts:142`부터 사용자→딜 잠금 및 같은 transaction의 보고서·원장 생성이다.

## 2. 모델·삭제·보관 선택

`prisma/schema.prisma:1473`의 `ReportQuotaAdmission`:

| 필드/제약 | 목적 |
| --- | --- |
| id | 원장 행의 고유 ID |
| userId, User FK, ON DELETE CASCADE | 생성 허용 당시 비용 소유자. 계정 실제 삭제 시 비금융 사용량 기록 삭제 |
| reportId nullable UNIQUE, Report FK, ON DELETE SET NULL | 보고서/딜 삭제 후 원장 유지. 존재하는 보고서에는 하나의 admission만 연결 |
| admissionRef UNIQUE | 원래 보고서 ID를 별도로 유지해 reportId가 null이 되어도 admission 중복 방지 |
| createdAt | 허용 당시의 월 사용량 귀속 시각 |
| (userId, createdAt) index | 사용자별 월 범위 조회 |

**선택한 정책:** 보고서/딜 삭제는 새 admission을 삭제하지 않는다. 사용자 계정이 실제로 삭제되면 이 비금융 한도 기록은 Cascade로 제거된다. 원장에 본문·문서 내용·이름·이메일·결제키는 저장하지 않는다. userId/admissionRef도 연결 가능한 내부 식별자이므로 공개 응답·일반 로그·공유 메모리에 기록하지 않는다.

계정 삭제 지원이나 전체 개인정보 삭제 정책이 이번 변경으로 구현된 것은 아니다. 기존 billing 원장의 User FK `Restrict`, 팀 소유자 제약 및 그 밖의 계정 삭제 조건은 별도다. 사용량 Cascade만으로 결제 기록을 삭제하거나 계정 삭제가 성공한다고 가정하지 않는다. 계정 삭제 후 새 계정 가입에 의한 한도 회피는 이 모델이 해결하는 범위가 아니다.

## 3. 변경 파일과 로컬 확인

- schema: `prisma/schema.prisma`
- 추가 SQL 준비 파일: `prisma/patches/2026-10-05-add-report-quota-admissions.sql`
- 집계: `src/lib/quotas.ts`
- 동일 transaction admission 쓰기: `src/app/api/deals/[id]/reports/route.ts`
- 오프라인 회귀: `tools/test-report-quota-ledger.ts`

추가 SQL은 새 테이블·FK/unique/index만 준비하며 기존 사용량을 초기화하거나 데이터를 이전하지 않는다. `IF NOT EXISTS`는 이미 존재하는 잘못된 테이블 정의를 자동 교정하지 않으므로 이름 존재 여부만으로 schema 준비 완료를 판단하지 않는다.

오프라인 테스트는 실제 quota 모듈을 VM에서 실행하고 synthetic count 포트만 주입한다. 원장 소유자와 팀 요청자를 구분하며, 삭제되어 reportId가 null인 admission 보존, 원장 연결 보고서 중복 제외, 월 시작/끝과 윤년 KST 경계, Free 한도 도달, 기존 양식 동작, 새 테이블/대리 객체 누락의 거부를 확인한다. 실제 FK의 SetNull/Cascade, 실제 동시 생성 transaction, 운영 데이터는 이 mock 검증만으로 확인할 수 없으므로 별도 합성 PostgreSQL 검증 결과와 구분한다.

## 4. 전환월 legacy 한계

**자동 backfill은 없다.** 기존 보고서는 원장 없이 legacy fallback으로 센다. 이미 삭제된 보고서의 사용량·허용 시각·당시 소유자를 이 테이블만으로 복구할 수 없다. 현재 남은 보고서 수를 이미 삭제된 사용량까지 포함하는 증거로 취급하지 않는다.

전환 후에도 **현재 월의 연결 없는 legacy 보고서가 삭제되면 fallback 사용량이 줄어든다.** 신규 admission 보존과 전환월 전체 보호는 다르다. 이 구현을 완전한 전환월 보호로 안내하지 않는다.

운영 적용 전에 다음 선택을 문서로 승인한다.

1. 해당 전환월의 legacy 감소 한계를 받아들이고 다음 월부터 신규 admission 보존이 적용되도록 안내한다.
2. 다음 KST 월 경계에 생성 writer를 일시 중지해 전환한다. 해당 월 경계 이후 새 생성은 모두 원장을 쓰도록 준비하되 전환 전에 실행 중인 이전 writer가 늦게 생성하는 사례도 차단한다.
3. 남아 있는 기존 보고서에 한해 증거 기반 backfill을 별도 검토한다. 소유자·생성 시각·중복·월 귀속을 확인하고 승인된 운영 작업으로 수행한다. 이미 삭제된 이력은 신뢰할 수 있는 독립 증거가 없으면 추정 복원하지 않는다.

어느 선택도 이번 문서 작성으로 실행·승인된 것이 아니다. 전환월 보호를 위해 별도 삭제 제한을 도입하려면 사용자의 삭제 흐름과 동시 요청까지 따로 설계·검증해야 한다. 이번 코드에는 그 제한이 없다.

## 5. 운영 적용 순서와 혼합 writer 차단

아래는 준비 계획이며 운영 명령이 아니다.

1. 운영 담당자가 대상 DB·승인 schema·migration 이력·client 버전을 확인하고 백업/복원·잠금 시간·구성 차이를 검토한다. 실제 URL·키·사용자 정보는 문서에 기록하지 않는다.
2. 새 보고서 생성을 일시 중지하고 이전 앱 인스턴스·예약 작업·관리 스크립트의 **새 보고서 생성 writer**를 모두 정지·drain한다. 기존 read 흐름과 생성 작업 재개는 별도 판단하되 새 admission 없이 report를 생성하는 실행은 남기지 않는다.
3. 승인된 additive schema를 적용하고 실제 FK 삭제 규칙·두 unique 제약·소유자/시각 index를 확인한다. 데이터 backfill은 이 단계에 자동 포함하지 않는다.
4. 최신 generated client와 quota-aware 앱을 함께 준비한다. 소유자 잠금→한도 확인→report+admission 생성이 동일 transaction인 것을 확인한다. table 미적용 오류가 500으로 거부되고 provider 시작이 0인지 합성 환경에서 검증한다.
5. 모든 writer가 새 계약을 사용하는지 확인한 뒤 생성 admission을 다시 허용한다. 같은 사용자의 다른 딜 동시 요청도 한도를 넘지 않아야 한다. 부분 성공이 남으면 활성화하지 않는다.
6. 범위가 제한된 집계로 admission/report 연결·중복·월 귀속·null reportId 보존·한도 거부를 관찰한다. 운영 조회 자체도 별도 승인해야 한다.

**혼합 writer 기간은 허용하지 않는다.** 이전 앱은 새 원장을 쓰지 않으며 삭제 후 사용량 보존도 알지 못한다. 동일 DB에서 이전/새 앱의 생성 writer가 겹치면 한도를 정확히 보호한다고 주장할 수 없다. schema를 먼저 추가했다는 사실만으로 이 창을 닫을 수 없다.

## 6. 검증·중단·rollback 조건

필수 합성 검증:

- Free 한도 직전 같은 소유자의 서로 다른 딜 동시 생성: 허용 횟수 이하 성공, report와 admission 함께 생성.
- 팀 요청자와 딜 소유자가 다른 경우: 딜 소유자 원장에만 귀속.
- 보고서 삭제와 딜 Cascade 삭제: 신규 admission 수 유지, reportId만 null, admissionRef 유지.
- 같은 report/admissionRef의 중복 삽입: unique 거부 및 transaction rollback.
- 원장 생성 실패: report·상태 정리 쓰기 모두 rollback, AI 시작 없음.
- KST 월 경계 직전/정확 경계/다음 월 경계: 같은 admission 시각과 배타적 월 끝으로 집계.
- missing table/client·DB 오류: 정상 0건이나 legacy-only fallback 없이 거부.
- 사용자 실제 삭제: 이 비금융 기록의 Cascade와 기존 billing Restrict를 각각 확인.
- 전환월 legacy 삭제: 줄어드는 fallback을 한계로 재현하고 승인한 전환 정책과 일치하는지 확인.

중복 행·원장 없는 신규 report·초과 허용·FK/시각 불일치가 있으면 신규 생성 writer를 중지하고 원장을 보존한다. 조사 때문에 기록을 삭제하거나 같은 보고서를 다시 생성해 count를 맞추지 않는다.

rollback은 생성 중지와 기록 보존을 우선한다. ledger-aware 호환 앱으로 되돌리거나 별도 호환 fix를 준비한다. 원장을 모르는 이전 앱을 되돌리고 새 생성을 즉시 허용하면 삭제 회피 문제가 다시 열린다. additive 테이블 제거, 사용량 초기화, 추정 backfill은 자동 rollback 절차가 아니다.

## 7. 현재 확인과 미확인

`tools/test-report-quota-ledger.ts` 오프라인 합성 회귀 PASS. 이 문서의 작성자는 소스·schema를 수정하지 않았고 운영 DB·AI·결제를 호출하지 않았다. 실제 PostgreSQL FK/동시성·빌드·HTTP 고객 흐름의 검증은 해당 담당자의 별도 결과로 기록해야 한다. 운영 schema 적용, 전환월 정책 선택, writer drain, 백업 복원, 계정 삭제 종합 정책은 미확인이다.

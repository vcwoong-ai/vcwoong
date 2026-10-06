# 팀 관리 및 유료 구독 구현 준비 계획

작성일: 2026-10-05. 이 문서는 정적 조사와 후속 구현 계획이다. 현재 기능이 완성되었다는 보고가 아니다. 이번 작업에서 소스·schema·의존성·환경 설정을 변경하거나 테스트·운영 DB·결제·AI를 호출하지 않았다. 환경파일 및 실제 키는 읽지 않았다.

## 1. 확인한 팀 권한 모델

- `prisma/schema.prisma:66` 신규 사용자의 기본 역할은 ANALYST다. `:93` Team에는 id/name/createdAt/updatedAt와 관계만 있으며 소유자/생성자 필드가 없다.
- `src/app/api/team/route.ts:70-78` 생성 트랜잭션은 팀을 만든 후 사용자의 teamId만 바꾼다. 팀 밖에서 실행한 기존 소속 확인(`:59-65`)만으로는 동시 생성 요청을 직렬화하지 못한다.
- `src/app/api/team/members/route.ts:31` 초대·제거는 ADMIN/PARTNER, `src/app/api/team/members/role/route.ts:26` 역할 변경은 ADMIN만 허용한다. 신규 ANALYST 생성자는 자신의 팀을 관리할 수 없다.
- `src/lib/platform-admin.ts:4-10`, `src/app/admin/usage-cost/page.tsx:34` 플랫폼 운영자 권한은 별도 이메일 허용 목록이다. 현재 검색 범위에서 PARTNER/ADMIN의 고객 팀 역할이 이 플랫폼 게이트를 통과시키는 코드는 확인하지 않았다.
- `src/lib/team-access.ts:20-42,112-118` PARTNER는 현재 소속 팀 공유 리소스 편집 및 관리 권한을 준다. 이 역할은 User의 전역 필드이므로 팀에서 나간 뒤에도 남는다.
- `src/app/api/team/members/route.ts:40-61` 기존 가입자를 이메일로 찾은 뒤 동의 없이 teamId를 즉시 변경한다. 원래 role은 그대로 승계한다. 초대받는 사용자의 이메일 검증 상태도 확인하지 않는다.
- `src/components/settings/team-settings.tsx:230-231` UI 관리 버튼은 role만으로 계산한다. 서버 정책 변경과 함께 수정해야 한다.

### PARTNER로 바꾸는 단기안 평가

ANALYST 생성자를 PARTNER로 바꾸면 초대·이름 변경은 가능해지고 플랫폼 운영자가 되지는 않는다. 하지만 역할 변경은 여전히 불가능하고 기존 역할이 훼손되며 다른 팀 가입 때 권한이 승계된다. 원래 역할 복원에 필요한 기록도 없다. 따라서 전체 해결책으로 권장하지 않는다. ADMIN 자동 부여도 채택하지 않는다.

### 권장 최소 모델: 명시적 팀 소유자

**schema 변경이 필요한 이유:** 현재 관계에는 생성자라는 사실이 저장되지 않아 User.role을 유지하면서 생성자에게만 관리 권한을 줄 근거가 없다. 첫 가입자/가장 오래된 회원을 소유자로 추정하지 않는다.

1. Team에 nullable `ownerUserId`와 명명된 User 관계를 추가한다. 소유자 삭제는 SetNull 등 명시적 정책으로 처리한다. User에는 역관계를 추가한다. 팀 소유자가 여러 팀을 소유할 수 있는지 정책을 정하기 전 unique를 임의로 붙이지 않는다.
2. 팀 생성 트랜잭션에서 ownerUserId를 현재 사용자로 저장한다. User.role은 그대로 둔다. `updateMany({where:{id,teamId:null},data:{teamId:newTeamId}})` 결과 1건을 확인하고 실패하면 트랜잭션을 롤백하여 고아 팀을 남기지 않는다.
3. DB에서 읽은 현재 팀의 ownerUserId와 userId가 같은지 확인하는 `isTeamOwner`를 TeamContext에 추가한다. 관리 정책은 owner 또는 기존 ADMIN/PARTNER, 역할 변경은 owner 또는 기존 ADMIN으로 정한다. 소유자 권한을 임의의 다른 팀 요청에 재사용하지 않는다.
4. 소유자의 팀 공유 편집이 필요하다면 Context의 **팀 범위 유효 역할**만 PARTNER로 계산한다. persisted User.role 및 JWT 역할은 변경하지 않는다. 이 결정은 `team-access.ts`의 VC/PE 호출자와 UI까지 확인한다. 팀 역할 표시와 계정 기본 역할 표시를 구분한다.
5. 소유자는 이전/후임 지정 없이 탈퇴·제거할 수 없게 한다. 이전 API는 현재 소유자, 현재 팀 회원인 후임, 동일 트랜잭션의 조건부 업데이트를 요구한다. 마지막 관리자 정책도 별도로 정의한다.
6. 기존 팀 ownerUserId는 null로 두고 기존 역할 정책을 유지한다. 소유자가 없는 관리자 없는 팀은 별도 복구 목록으로 다룬다. 생성자를 증명할 기록이 없는 상태에서 자동 권한 부여/backfill을 하지 않는다.

위 모델은 creator deadlock의 최소 해결이다. 초대 동의·역할 승계 문제는 별도 출시 준비 조건이며 자동으로 해결되지 않는다.

### 초대 및 역할 승계 후속

- 권장: TeamInvitation에 teamId, 초대한 사용자, 대상 userId, 만료시각, 상태, 지정 팀 역할을 저장한다. 기존 로그인 사용자는 자신의 초대를 조회/수락/거절한다. 이메일 링크가 필요하면 토큰 해시만 저장한다.
- 수락 시 사용자 본인·대상 팀·초대 상태/기간·현재 teamId:null을 트랜잭션 조건으로 확인한다. 동시 수락/다른 팀 초대 경쟁에서 하나만 성공해야 한다. 초대 생성만으로 접근 권한은 생기지 않는다.
- 다른 팀의 ADMIN/PARTNER를 자동 승계하지 않으려면 TeamMembership에 `(teamId,userId)` unique, 팀 역할, 원래 계정 역할과 분리된 관계를 두는 확장안이 적합하다. 단일팀 제한을 유지한다면 userId unique도 검토한다. 기존 User.role을 파괴하면서 복원 정보를 추측하는 안은 피한다.
- 이를 후순위로 미룰 경우 팀 초대를 출시 가능하다고 표시하지 않는다. 사용자 동의, 역할 부여, 관리자 없는 팀 처리 정책부터 결정한다.

### 팀 작업 소유 파일과 검증 계획

| 작업 | 예상 파일 | 미래 검증 |
|---|---|---|
| 소유자 모델/경쟁 방지 | prisma/schema.prisma, 새 로컬 migration, src/app/api/team/route.ts | 깨끗한 격리 PostgreSQL에서 동시 생성 하나 성공·고아 팀 0·role 불변 |
| DB 기반 소유자 권한 | src/lib/team-access.ts, src/app/api/team/members/route.ts, src/app/api/team/members/role/route.ts | ANALYST owner 관리 허용·일반 ANALYST 거부·다른 팀 owner 거부·플랫폼 비용 화면 거부 |
| 팀 UI | src/components/settings/team-settings.tsx, 팀 GET 응답 | owner 버튼 노출·계정 role 보존·서버 거부 처리 |
| 동의와 팀 역할 분리 | 새 초대 API/모델, 팀 API 및 VC/PE 권한 호출자 | 만료/거절/중복/동시 수락·이전 관리자 가입 권한·탈퇴·소유권 이전 |

팀 개발 담당이 위 소스 묶음을 소유하고 검증 담당이 새 격리 테스트를 소유한다. 현재 auth/forgot-password, report export/UI 작업과 겹치지 않는다. 신규 의존성은 필요하지 않을 것으로 예상하나 실제 구현에서 재평가한다.

## 2. 결제의 확인된 미완성 범위

- `src/app/api/payments/success/route.ts:72-97`: 빌링키 발급 → timestamp 주문번호 → 외부 청구 → 결제 row 생성 → 구독 ACTIVE 변경을 별개로 처리한다. 네트워크/DB 실패에 대비한 영속 결제시도 및 조정 상태가 없다. provider가 같은 authKey를 재사용하도록 허용한다고 단정하지 않는다.
- `src/lib/subscription.ts:57-78`, `prisma/schema.prisma:68-70`: 플랜/status/billingKey만 저장한다. billing cycle, period, next charge, 만료일이 없다. src 검색에서 재청구 스케줄러를 확인하지 않았다.
- `prisma/schema.prisma:328-340`: paymentKey는 nullable 비고유 index다. orderId, 멱등키, cycle, 조정/시도 상태가 없다.
- `src/app/api/payments/webhook/route.ts:61-78`: 취소 이벤트는 payment 기록 상태만 바꾸며 BILLING_DELETED는 즉시 무료로 전환한다. 환불액별 이용권 정책 및 현재 이용기간 연결은 확인하지 못했다.
- `src/app/api/payments/cancel/route.ts:21`은 로컬 상태를 즉시 무료로 바꾼다. provider 빌링키 폐기/환불·기간말 해지 구현과 같은 뜻으로 안내하지 않는다.
- 실제 상점 계약, 실결제 키, 테스트 키, 웹훅 전달 방식, 과거 청구 내역은 미확인이다.

## 3. 제안하는 결제 구현 단계

### B0. 정책과 연결 준비

개인별/팀별 과금 단위, 월·연 가격과 세금, KST 청구 기준/월말·윤년 처리, 플랜 변경의 즉시청구/차액, 기간말 해지/환불, 실패시 유예·횟수·알림, 체험과 mock의 이용권을 먼저 정한다. 실결제 준비 gate는 client와 server 모두 적용하며 테스트/운영 자격증명 쌍을 섞지 않는다. 아직 결정되지 않은 정책을 자동과금 로직으로 추측하지 않는다.

### B1. 로컬 schema 설계

아래는 구현 예정 필드이며 현재 존재하지 않는다.

- Subscription: userId(unique, 현 개인과금 유지시), plan, cycle, status, currentPeriodStart/End, nextChargeAt, cancelAtPeriodEnd, version, providerCustomerRef 및 제한된 서버 전용 결제수단 참조. ACTIVE 사용권을 기간과 상태로 판정한다.
- BillingAttempt: subscriptionId, operation, periodStart/End, plan/cycle/amount/currency 스냅샷, orderId(unique), idempotencyKey(unique), 상태(PREPARED/PROCESSING/UNKNOWN/SUCCEEDED/FAILED), 재시도/조정 시각, leaseUntil/workerToken. 같은 구독·operation·period에 unique 제약을 두어 한 회차 중복 청구를 막는다.
- SubscriptionPayment: billingAttemptId(unique), provider paymentKey nullable unique, orderId, 실제 amount/currency/status, confirmedAt/refundedAmount 등. 기존 중복 paymentKey는 사전검토 없이 unique migration하지 않는다.
- BillingEvent: provider event 고유 식별자(지원 여부 확인), 최소 payload의 hash/처리상태/참조. event id가 없다면 dedupe 정책을 설계한다. authKey·billingKey·원본 카드정보·전체 webhook본문을 로그/공유메모리에 남기지 않는다.
- pending checkout은 로그인 userId와 plan/cycle/금액을 서버에서 고정하고 callback에 opaque intent 참조를 사용한다. 요청 query의 플랜으로 결제 조건을 새로 결정하지 않는다. 빌링키 저장은 접근권한/보관정책 및 암호화 키 운영을 검토한다.

### B2. 멱등 처리와 결과 조정

1. SDK 결제창을 열기 전 서버가 결제시도를 저장한다. 콜백은 해당 사용자·intent·미만료 상태를 검증한다. intent 생성 요청 자체의 중복 방지도 포함한다.
2. DB 트랜잭션 안에서 시도를 조건부 claim하고 저장된 주문번호/멱등키/가격을 사용한다. 외부 API를 장시간 DB 트랜잭션 안에서 호출하지 않는다.
3. 청구 결과를 확인한 뒤 결제 row와 기간/사용권 갱신을 한 DB 트랜잭션으로 저장한다. 중복 콜백은 기존 상태를 반환한다.
4. timeout은 FAILED가 아니라 UNKNOWN으로 보존한다. 조정 worker는 저장된 orderId/paymentKey로 provider 조회하고 사용자/금액/통화/주문 관계를 대조한다. 결과를 모르는 동안 새 키로 재청구하지 않는다.
5. 재시작/다중인스턴스는 lease와 worker token 및 version 조건으로 보호한다. provider 멱등키 유효기간이 지나면 자동 재청구를 멈추고 수동 조사 큐로 보낸다. 외부 시스템과 DB를 한 번에 원자적으로 처리할 수 있다고 주장하지 않는다.
6. 월·연 스케줄러는 만기 회차를 unique attempt로 생성하고 한정된 batch를 처리한다. secret 검증, 비밀값 없는 상태/지연 알림, 실패 유예·해지 정책을 포함한다.
7. 웹훅 인증 방식은 실제 상점에서 지원하는 공식 전달 방식과 맞춘다. 기존 커스텀 시크릿 헤더가 provider에서 자동 전달되는지 미확인이다. 결제 조회에 실패한 이벤트를 성공처리로 소실하지 말고 조정 대상에 남긴다. 재전송/역순/부분환불도 idempotent 처리한다.

### B3. 예상 파일과 미래 검증

결제 담당: `src/app/api/payments/**`, `src/lib/payments/toss.ts`, `src/lib/subscription.ts`, `src/components/settings/subscription-plans.tsx`, 새 checkout/renewal/reconcile 모듈/API. DB 담당: `prisma/schema.prisma`, 로컬 migration, schema readiness 관련 문서. 검증 담당: provider fetch mock/고정 clock/격리 PostgreSQL 통합 테스트. 필요성이 확인되지 않은 신규 queue 서비스/의존성을 먼저 추가하지 않는다.

필수 사례: 중복·동시 callback, 청구 후 DB실패, timeout→성공/실패 조회, 프로세스 재시작, 취소와 갱신 경쟁, 월말/윤년/연간기간, 무료한도·유료만료, 웹훅 중복/역순/인증실패/부분환불, credentials 미설정 및 테스트·운영 모드 혼합. 실제 provider sandbox 검증은 별도 승인된 테스트 계정으로 수행하며 이번 문서 작업에서는 실행하지 않았다.

## 4. migration 및 운영 활성화 준비조건

1. additive nullable 필드/새 테이블로 로컬 migration 작성 후 깨끗한 격리 PostgreSQL에만 적용·검증한다. production에 migrate dev/db push를 실행하지 않는다. SQLite 개발 schema를 유지한다면 parity 여부를 명시적으로 결정한다.
2. 현재 migration history·생성 client·운영 schema 차이를 확인한다. 기존 사용자/팀/결제의 생성자·주기·기간은 현재 필드로 복원할 수 없으므로 추정 backfill하지 않는다. 운영 inventory와 원장 대조는 별도 승인 후 최소정보로 수행한다.
3. 기존 결제와 중복 paymentKey, FK/unique 제약 충돌, 테이블 크기와 lock 시간을 운영 담당이 확인한다. backup/restore 리허설 및 checksum/행수 점검 계획을 준비한다.
4. 확장 schema → 호환 앱 배포 → 승인된 backfill/검증 → 새 기능 활성화 순서를 따른다. 이전 앱이 nullable 필드를 허용하는지 검토한다. rollback은 기능 gate를 끄고 기록을 보존하는 방식이며 청구 row 삭제나 같은 회차 재청구를 하지 않는다.
5. 실제 계약/키주입/웹훅 등록/배포/migration/backfill/실결제·환불/자동갱신 활성화는 운영 변경이다. 이 문서의 작성은 그 작업을 수행한 것이 아니다. 별도 구체적 승인과 담당자 확인 후 진행한다.

## 5. 공식 문서 확인 (2026-10-05)

### 비밀번호 변경 후 세션 폐기 구현 (2026-10-05)

`src/lib/auth-session-version.ts`와 `src/lib/auth.ts`는 인증한 비밀번호 해시의 SHA256 fingerprint를 서버 전용 JWT 필드에 저장하고 세션 조회마다 DB의 현재 값과 비교한다. 원래 비밀번호·해시·fingerprint는 public Session에 포함하지 않는다. 계정 삭제/해시 제거/변경/DB조회 실패/기존 버전 없는 token은 고정 문구 오류로 거부한다. schema 추가는 없다. authorize와 JWT 발급 사이에 비밀번호가 바뀌는 경쟁도 거부한다.

**배포 영향:** 새 fingerprint가 없는 기존 JWT는 재로그인이 필요하다. 배포 전에 이를 사용자 안내 및 운영 계획에 반영한다. 이번 작업에서는 운영 배포를 하지 않았다. DB 장애시 로그인 세션 조회가 거부되므로 인증 가용성에 영향을 준다.

설치된 NextAuth 4의 session runtime은 callback throw를 잡아 빈 응답과 cookie 정리를 만든다. getServerSession은 빈 응답을 null로 반환한다. RSC getServerSession은 cookie 쓰기가 no-op이므로 서버 접근은 거부해도 브라우저의 물리 cookie 삭제는 `/api/auth/session` 등 cookie를 쓸 수 있는 응답에서 이루어진다. 실행 중 이미 인증을 마친 요청의 중단은 보장하지 않는다. `getToken` 직접 decode나 middleware만 사용하는 접근은 이 callback 검증을 통과하지 않으므로 보호된 서버 경로의 `getServerSession` 검증을 대체하지 않는다. 현재 추가 기능은 credentials 로그인 대상이며 향후 OAuth 추가시 그 계정의 폐기 정책을 별도로 설계한다.

모의 사용자 reader와 설치된 NextAuth session handler에 대한 `tools/test-auth-session-version.ts`를 실행하여 정상 세션, 변경/삭제/누락/DB오류 거부, 초기 발급 경쟁, role refresh, cookie 정리, client marker 비노출을 확인했다. 실제 DB·운영 cookie·네트워크는 사용하지 않았다.

- Toss는 자동결제 시점을 서비스에서 직접 스케줄링하도록 설명한다. [자동결제 결제창 연동](https://docs.tosspayments.com/guides/v2/billing/integration)
- `Idempotency-Key`를 제공하며 현재 문서의 보존기간은 15일이다. 오류 후 새 키로 동일 요청을 다시 보내는 동작은 피하도록 안내한다. [인증 및 멱등키](https://docs.tosspayments.com/reference/using-api/authorization)
- 테스트 연동과 자동결제 계약된 상점의 실서비스 키는 별도 단계다. [자동결제 API 연동](https://docs.tosspayments.com/guides/v2/billing/integration-api)
- 트랜잭션/고유 제약/조건부 업데이트를 이용한 경쟁 제어는 기존 Prisma 6 계열에서 검토한다. [Prisma 6 트랜잭션](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)

위 공식 문서는 설계 참고이며 해당 상점에서 연동·계약·API 지원이 실제 검증되었다는 의미가 아니다.

## 2026-10-05 로컬 결제 핵심 구현 상태

`billing-period.ts`, `billing-lifecycle.ts`, `toss-billing-provider.ts`와 모의 회귀를 추가했다. 기간은 원래 UTC anchor로 계산하고, 청구 결과가 불명확하면 UNKNOWN으로 남겨 동일 주문 조회로만 조정한다. 동시/오래된 작업과 취소 경쟁은 version/lease 계약으로 차단한다. 가격은 기존 플랜 정의를 재사용한다.

이 단계에는 실제 Prisma 저장소·intent 고유 제약·billing key 발급/보관·checkout callback·갱신/조정 작업·webhook·앱 권한 반영이 없다. checkout 차단은 유지한다. 월말/윤년의 UTC 정책은 구현·모의 검증했지만 한국 상점의 실제 기준일 정책을 확인한 것은 아니다. 공급자 어댑터의 65초 제한을 사용할 때에는 미래 연결 route 실행 시간을 그보다 길게 잡아야 한다. 실계약·키·실결제는 사용하지 않았다.

## 2026-10-05 영속 저장 및 암호화 구현 상태

새 BillingPaymentMethod/Subscription/Intent/Payment 모델과 `prisma-billing-repository.ts`, `billing-key-vault.ts`, `payment-method-resolver.ts`, `billing-client.ts`를 구현했다. 실제 격리 PostgreSQL에서 중복·재시작·롤백·취소 경합과 암호화 저장 왕복이 통과했다. 현 앱 checkout API·유료 권한·갱신 scheduler·webhook에는 아직 연결하지 않았다. 서버 생성 checkout anchor/가격/의도 재사용과 authKey 발급 중단 복구를 먼저 구현해야 한다. legacy 키/권한은 자동 이전하지 않는다.

patch는 운영에 적용하지 않았다. 원장은 Restrict 관계로 보존되므로 실제 계정/개인정보 삭제 정책과 필요한 보존 정책을 확인해야 한다. 키는 명시 주입이며 실제 환경 변수 이름/secret manager/회전 절차는 앱 연결 단계에서 정한다. 예시를 실제 자격증명으로 오해하지 않는다. 이번 검증은 합성 공급자이며 실제 Toss 상점/청구/환불/웹훅 계약과 한국 기준일 정책은 미확인이다.

## 2026-10-05 체크아웃 및 기간 권한 연결 상태

CheckoutSession 모델/service·인증된 checkout API·callback·SDK 입력·기간 기반 앱 권한·기간말 취소를 연결했다. `billing-runtime.ts`와 새 issuer가 기존 vault/repository/core/provider를 조합한다. 신규 세션은 server 가격/anchor와 무작위 customerKey에 묶이며 authKey 원문은 저장하지 않는다. 발급 불확실은 자동 재발급 없이 보류하고, READY 청구 불확실은 같은 order 조회만 수행한다. 만료된 미발급 예약은 기록을 보존해 다시 준비할 수 있다.

실제 격리 PostgreSQL/합성 runtime, actual subscription getter의 SQL·route 모의·빌드/타입·기존 실제 Next 브라우저 회귀가 통과했다. 실제 Toss 카드 창/발급/청구·운영 콜백은 미확인이다. 자동 갱신·UNKNOWN 조정 scheduler·새 provider 이벤트 처리는 다음 단계다. Checkout readiness는 false이며 운영 schema/계약/키 공급·회전·복구/기존 고객 이전·정책 확인 전 유료 활성화하지 않는다.

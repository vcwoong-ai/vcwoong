# 로그인 이메일 보강 — 로컬 검토

2026-10-01. 브랜치 `codex/login-email-resolution`, 시작 HEAD `bb315ea` (#122 위).
Claude #121 head `dbe553b`/OPEN을 GitHub에서 재확인했으며 해당 브랜치는 수정하지 않았다.
이 변경이 통합되면 #121의 두 파일 수정과 중복되므로 둘을 독립적으로 병합하지 않는다.

## 변경과 보호 경계

- 로그인과 가입은 `lib/login-email.ts`의 같은 매개변수화된 조회를 사용한다.
  입력 공백을 제거하고 소문자 비교로 기존 혼합 대소문자 이메일을 찾는다.
- 후보가 하나인 경우 기존 ID로 비밀번호를 검증한다. 기존 email/ID/passwordHash/role/team/plan을 변경하지 않는다.
- 후보가 여러 개이면 원래 표기·소문자 행을 우선 선택하지 않고 모두 같은 일반 로그인 오류로 거부한다.
  이는 기존 충돌 계정의 권한 혼선을 방지하는 동작이다. 충돌 계정은 별도 검토가 필요하며 자동 병합·삭제하지 않는다.
- 신규 가입은 소문자로 저장하고 legacy 이메일과 대소문자만 다른 가입도 409로 막는다.
  동시 신규 가입의 unique constraint 오류도 409로 처리한다. 기존 DB unique key를 사용하며 schema 변경 없음.
- bcrypt, 로그인/가입 rate limit, JWT/권한, 청구·결제·VC/PE 엔진은 그대로다.
- SQL은 Prisma tagged `$queryRaw`의 바인딩을 사용한다. 값 연결이나 unsafe SQL 없음.
  SQL LOWER 조회는 SQLite에서 실행 검증했다. PostgreSQL 실 DB 실행·큰 계정 수의 조회 성능·국제화 이메일은 NOT VERIFIED.
  운영 데이터/env/DB/schema/결제에 접근·변경하지 않았다.

## 실제 검증

`DATABASE_URL=file:./dev.db`, localhost:3000, Edge. 합성 사용자만 만들고 자동 테스트 후 삭제했다.
테스트 IP는 예약된 문서용 IPv6 주소를 로컬 요청에 지정해 기존 사용자의 rate limit 기록을 지우지 않는다.
테스트 종료 시 그 테스트의 rate limit 기록만 제거한다. 브라우저 외부 요청은 차단한다.

- `npm run test:login-email-e2e`: PASS.
  - 기존 mixed-case 이메일의 원래/소문자/대문자/공백 입력 로그인 → 동일 ID·ANALYST 권한.
  - 잘못된 비밀번호/없는 이메일/두 case-colliding 계정은 session 미발급, 동일 일반 오류.
  - legacy 소문자·대문자 중복 가입 409, 신규 공백·대소문자 입력은 소문자 저장/Free/billingKey null.
  - 동시 가입은 201 한 개, 409 한 개. 계정 데이터 불변.
  - 1440/390 실제 브라우저 로그인(각 실행 전 cookie 초기화), PE 가입 후 자동 로그인·빈 안내, overflow/pageerror 없음.
- `npm run test:all`: PASS, exit 0. 전용 로그인 테스트와 별도로 실제 실행했다.
- `npx tsc --noEmit`, `npm run lint`: PASS.
- `git diff --check`: PASS.
- 초기 `npm run build`: FAIL — 샌드박스 네트워크가 기존 Google Fonts 요청을 EACCES로 차단.
  네트워크 접근이 허용된 실행에서 같은 로컬 DB/env로 재실행해 PASS(exit 0).
  최종 빌드를 `npm run start`로 localhost:3000에서 열었다. 운영 배포가 아니다.

## 직접 열어볼 로컬 화면

`http://localhost:3000/login`

`DATABASE_URL=file:./dev.db npx tsx tools/seed-login-review-local.ts`로 합성 테스트 계정 하나를 유지한다.
이 도구는 다른 이름의 기존 계정을 덮어쓰지 않는다. 운영/원격 DB에서는 즉시 중단한다.
계정은 `Login.Review.20261001@Example.com`, 역할 ANALYST, Free이며 관리자나 운영 계정이 아니다.
테스트 비밀번호는 로컬 fixture 도구에만 정의한다. 이 합성 계정은 사용자 화면 검토 후에도 로컬 DB에 남겨둔다.

수정은 아직 운영 서비스에 적용되지 않았다. Draft 리뷰/통합/운영 검증은 별도 단계다.

최종 production build의 로컬 `npm run start`에서도 Codex 브라우저로 소문자 이메일 로그인 →
"로그인 테스트 전용 (합성 계정)" 대시보드 표시를 확인했다. 테스트 탭을 사용자 검토용으로 열어 두었다.

# Phase 2: 데이터베이스 + 인증

> **2026-09 갱신**: 이 문서는 원래 Supabase(자체 Auth + RLS + Storage
> 버킷)로 기획됐던 초기 계획이다. 실제 구현은 **Prisma + NextAuth +
> PostgreSQL(Neon 권장)** 조합으로 바뀌었고, 지금 코드베이스엔 Supabase
> 관련 패키지·코드가 전혀 없다. 아래는 원래 계획이 아니라 **실제로
> 구현된 구조**를 기록한 것이다 — 새 세션에 붙여넣는 "지시문" 용도가
> 아니라 참고용 문서로 취급할 것.

## 실제 구성

1. **인증**: NextAuth.js (`src/lib/auth.ts`)
   - `CredentialsProvider` — 이메일/비밀번호, bcrypt로 해시 비교
   - `PrismaAdapter(prisma)`로 세션·계정을 DB에 저장(자체 Session/Account
     테이블, Supabase Auth의 `auth.users` 같은 별도 시스템 없음)
   - 로그인 시도는 IP 기준 레이트리밋(`checkRateLimit`)으로 무차별 대입
     방어
2. **DB**: PostgreSQL 아무 호스팅이나 가능(현재 Neon 권장) + Prisma ORM
   - 연결 문자열은 `.env.local`의 `DATABASE_URL`(pooled) /
     `DIRECT_URL`(마이그레이션용, non-pooled)
   - 스키마는 SQL 마이그레이션 파일이 아니라 `prisma/schema.prisma`
     하나로 관리 (`npx prisma migrate dev`)
3. **접근 제어**: RLS(DB 레벨 정책) 대신 애플리케이션 레벨에서 처리
   — `src/lib/team-access.ts`의 `dealReadWhere`/`reportWriteWhere` 등이
   매 쿼리의 `where` 절에 "본인 소유 or 같은 팀" 조건을 넣는 방식
4. **파일 저장소**: Supabase Storage 버킷 대신 `STORAGE_MODE` 환경변수로
   전환 — 로컬 개발은 `local`(`/public/uploads`), 프로덕션은 Vercel Blob
   (`BLOB_READ_WRITE_TOKEN`이 있으면 자동 사용)

## 실제 Prisma 모델 (요약)

`prisma/schema.prisma` 기준 — 원래 계획의 `profiles`/`vc_companies`/
`startups` 같은 이름은 안 쓰고, 실제로는 이렇게 구성돼 있다:

- **Auth**: `User`, `Account`, `Session`, `VerificationToken` (NextAuth
  표준 스키마)
- **팀/조직**: `Team` (여러 사용자가 딜·보고서를 공유)
- **딜 파이프라인**: `Deal`, `Document`, `DealScore`, `InboundDeal`(딜소싱
  인박스)
- **양식/보고서**: `Template`, `Report`, `ReportSection`,
  `ReportDeepDive`
- **포트폴리오/LP**: `Fund`, `PortfolioCompany`, `CompanyKPI`,
  `Milestone`, `PortfolioUpdate`, `LpReport`
- **과금/사용량**: `SubscriptionPayment`, `UsageLog`, `RateLimit`

섹터·상태값 등은 전부 Prisma `enum`으로 관리(`DealSector`, `AgentType`,
`SectionKey`, `ReportStatus` 등) — 원래 계획의 `TEXT` + 문자열 리터럴
대신 타입 안전한 enum을 쓴다.

## 로컬 개발

- **로컬 SQLite**: `npm run db:setup:local` → `npm run dev:local` (Neon
  계정 없이도 개발 가능, `.gitignore`의 `/prisma/dev.db`)
- **Neon 연결 시**: `.env.local.example`의 `DATABASE_URL`/`DIRECT_URL`
  형식 참고 (Neon Dashboard → Connect → Pooled/Direct)

## 완료 체크리스트 (실제 기준)

- [x] NextAuth 설정 (Credentials + PrismaAdapter)
- [x] Prisma 스키마 (Auth + 딜/보고서/포트폴리오/LP 전체)
- [x] 애플리케이션 레벨 접근 제어 (`team-access.ts`)
- [x] 로그인/회원가입 페이지
- [x] 미들웨어 인증 보호
- [x] 파일 저장소 추상화 (local / S3 / Vercel Blob)
- [x] 로그인 레이트리밋

---

원래 계획했던 Supabase 버전 원문(참고용, 실제로 구현되지 않음)은
git 이력에 남아있다.

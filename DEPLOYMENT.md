# Axiom 배포 가이드

## 1. GitHub + Vercel

1. [vercel.com](https://vercel.com) → 프로젝트 **dealsync-jade** (GitHub `vcwoong-ai/vcwoong`)
2. Build Command: `npm run vercel-build`

## 2. Neon PostgreSQL (DB — 권장)

Vercel의 **Neon 통합(Storage → Neon)**을 쓰면 프로젝트 생성과 동시에
`DATABASE_URL`/`DIRECT_URL`이 Vercel 환경변수로 자동 주입됩니다.
직접 만들 경우 [neon.tech](https://neon.tech) → 프로젝트 생성 후 아래 절차를 따르세요.

### A. 테이블 생성 (1회)

Neon Console → **SQL Editor** → `prisma/db-init.sql` 전체 실행

### B. Connection string

**Neon Dashboard → Connect** 에서 두 종류를 확인:

| Neon 연결 | Vercel 변수 |
|-----------|-------------|
| **Pooled connection** (`-pooler` 포함 호스트) | `DATABASE_URL` |
| **Direct connection** (`-pooler` 없는 호스트) | `DIRECT_URL` |

Pooled URI 예시:
```
postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require
```

Direct URI 예시:
```
postgresql://<user>:<password>@<project>.<region>.aws.neon.tech/<db>?sslmode=require
```

### C. 로컬 (선택)

```bash
cp .env.local.example .env.local
npx prisma db push
npx prisma db seed   # demo@axiom.kr / Demo1234!
```

## 3. Vercel 환경 변수 (필수)

| 변수 | 값 |
|------|-----|
| `DATABASE_URL` | Neon pooled connection |
| `DIRECT_URL` | Neon direct connection |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://dealsync-jade.vercel.app` |

### 선택

| 변수 | 용도 |
|------|------|
| `OPENROUTER_API_KEY` / `GEMINI_API_KEY` | AI 보고서 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 구독 결제 |

→ **Redeploy**

## 3-1. 파일 업로드 (Vercel Blob — 필수)

Vercel 서버리스 함수는 요청 본문이 **4.5MB를 넘으면 플랫폼 단에서 차단**하고,
배포 파일시스템은 읽기 전용이라 `STORAGE_MODE` 미설정(로컬 저장) 상태로는
프로덕션에서 파일 업로드가 동작하지 않습니다. IR 덱처럼 큰 파일은 브라우저에서
Vercel Blob으로 직접 업로드하도록 되어 있으므로, Blob 스토어 연결이 필요합니다.

1. Vercel 프로젝트 → **Storage → Connect Store → Blob** → 생성
2. 연결하면 `BLOB_READ_WRITE_TOKEN`이 자동으로 환경변수에 주입됩니다(별도 설정 불필요)
3. `storage.ts`가 이 토큰이 있으면 자동으로 Vercel Blob을 사용합니다
   (AWS S3를 쓰고 싶다면 `STORAGE_MODE=s3` + `AWS_*`로 명시적으로 오버라이드 가능)

→ **Redeploy**

## 4. Toss 웹훅

```
https://dealsync-jade.vercel.app/api/payments/webhook
```

## 5. 확인

- [ ] 사이트 500 없음
- [ ] 회원가입/로그인
- [ ] Neon Table Editor → `User` 테이블

📱 모바일 가이드: [`docs/MOBILE-SETUP.md`](docs/MOBILE-SETUP.md)

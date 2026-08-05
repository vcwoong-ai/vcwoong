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
| `STORAGE_MODE=s3` + AWS_* | Vercel 파일 업로드 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 구독 결제 |

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

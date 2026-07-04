# Vcwoong 배포 가이드

## 1. GitHub + Vercel

1. [vercel.com](https://vercel.com) → 프로젝트 **dealsync-jade** (GitHub `vcwoong-ai/vcwoong`)
2. Build Command: `npm run vercel-build`

## 2. Supabase PostgreSQL (DB — 권장)

### 기존 프로젝트 사용 가능

- Project ID: `jgmvqtmohoxcriobjjfk`
- Region: Tokyo (`ap-northeast-1`)

### A. 테이블 생성 (1회)

Supabase Dashboard → **SQL Editor** → `prisma/db-init.sql` 전체 실행

### B. Connection string

**Project Settings → Database → Connection string → URI**

| Supabase Mode | Vercel 변수 | 포트 |
|---------------|-------------|------|
| **Transaction** (pooler) | `DATABASE_URL` | 6543 |
| **Session** (direct) | `DIRECT_URL` | 5432 |

Transaction URI 예시:
```
postgresql://postgres.jgmvqtmohoxcriobjjfk:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Session URI 예시:
```
postgresql://postgres.jgmvqtmohoxcriobjjfk:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

### C. 로컬 (선택)

```bash
cp .env.local.example .env.local
npx prisma db push
npx prisma db seed   # demo@vcwoong.kr / Demo1234!
```

## 3. Vercel 환경 변수 (필수)

| 변수 | 값 |
|------|-----|
| `DATABASE_URL` | Supabase Transaction pooler |
| `DIRECT_URL` | Supabase Session/direct |
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
- [ ] Supabase Table Editor → `User` 테이블

## Neon 대신 Supabase?

Neon(`neon-red-mountain`)은 Claude 쪽일 수 있음 → **Vcwoong은 Supabase `jgmvqtmohoxcriobjjfk` 사용**

📱 모바일 가이드: [`docs/MOBILE-SETUP.md`](docs/MOBILE-SETUP.md)

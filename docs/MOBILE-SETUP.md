# 📱 모바일 5분 셋업 (Axiom + Supabase)

## Vercel / Supabase가 뭐야?

| 서비스 | 한 줄 | 비유 |
|--------|------|------|
| **Vercel** | 웹사이트를 인터넷에 올림 | **가게** |
| **Supabase** | 회원·딜·보고서 저장 (PostgreSQL) | **창고** |

배포 URL: https://dealsync-jade.vercel.app

> **기존 Supabase 프로젝트** `jgmvqtmohoxcriobjjfk` (Tokyo) **그대로 쓰면 됩니다.**  
> Claude DealSync와는 별개입니다 (axiom@gmail.com 계정).

---

## 순서 (폰만)

### ① Supabase — 테이블 만들기 (2분)

1. [supabase.com/dashboard](https://supabase.com/dashboard) → 프로젝트 선택  
   (Project ID: `jgmvqtmohoxcriobjjfk`)
2. 왼쪽 **SQL Editor** → **New query**
3. GitHub 파일 **전체 복사** → 붙여넣기 → **Run**  
   https://github.com/vcwoong-ai/vcwoong/blob/main/prisma/db-init.sql

### ② Supabase — 연결 문자열 (1분)

**Project Settings → Database → Connection string**

| Supabase 탭 | Vercel 변수 |
|-------------|-------------|
| **URI** + Mode **Transaction** (포트 6543) | `DATABASE_URL` |
| **URI** + Mode **Session** (포트 5432) | `DIRECT_URL` |

- `[YOUR-PASSWORD]` → Database password (모르면 **Reset database password**)
- Transaction URI 끝에 `?pgbouncer=true` 있는지 확인

### ③ Vercel — env 4개 (2분)

**dealsync-jade** → Settings → Environment Variables

| Name | Value |
|------|-------|
| `DATABASE_URL` | Supabase Transaction (6543) |
| `DIRECT_URL` | Supabase Session (5432) |
| `NEXTAUTH_SECRET` | 긴 랜덤 문자열 (32자+) |
| `NEXTAUTH_URL` | `https://dealsync-jade.vercel.app` |

→ **Deployments → Redeploy**

### ④ 확인

1. https://dealsync-jade.vercel.app (500 없어야 함)
2. `/register` 회원가입 → 로그인

---

## 나중에 (지금 X)

- AI: OpenRouter / Gemini 키
- 파일: AWS S3
- 결제: Toss

---

## 막히면

| 증상 | 해결 |
|------|------|
| 500 | Vercel env 4개 + Redeploy |
| DB 에러 | SQL Editor에서 `db-init.sql` 다시 Run |
| 로그인 안 됨 | `NEXTAUTH_URL` 주소 정확히 일치 |

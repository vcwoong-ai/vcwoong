# 📱 모바일 5분 셋업 (Axiom + Neon)

## Vercel / Neon이 뭐야?

| 서비스 | 한 줄 | 비유 |
|--------|------|------|
| **Vercel** | 웹사이트를 인터넷에 올림 | **가게** |
| **Neon** | 회원·딜·보고서 저장 (PostgreSQL) | **창고** |

배포 URL: https://dealsync-jade.vercel.app

> Vercel의 **Storage → Neon 통합**으로 만들면 `DATABASE_URL`/`DIRECT_URL`이
> 자동으로 Vercel 환경변수에 들어갑니다. 직접 만들었다면 아래 순서대로.

---

## 순서 (폰만)

### ① Neon — 테이블 만들기 (2분)

1. [neon.tech](https://neon.tech) → 프로젝트 선택
2. 왼쪽 **SQL Editor** → **New query**
3. GitHub 파일 **전체 복사** → 붙여넣기 → **Run**
   https://github.com/vcwoong-ai/vcwoong/blob/main/prisma/db-init.sql

### ② Neon — 연결 문자열 (1분)

**Neon Dashboard → Connect**

| Neon 연결 | Vercel 변수 |
|-----------|-------------|
| **Pooled connection** (`-pooler` 포함 호스트) | `DATABASE_URL` |
| **Direct connection** (`-pooler` 없는 호스트) | `DIRECT_URL` |

- 비밀번호를 잊었으면 **Reset password**
- URI 끝에 `?sslmode=require`가 있는지 확인

### ③ Vercel — env 4개 (2분)

**dealsync-jade** → Settings → Environment Variables

| Name | Value |
|------|-------|
| `DATABASE_URL` | Neon Pooled connection |
| `DIRECT_URL` | Neon Direct connection |
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

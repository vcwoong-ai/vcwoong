# Vcwoong 배포 가이드

## 1. GitHub 레포 연결

1. [vercel.com](https://vercel.com) → New Project → GitHub 레포 `vcwoong-ai/vcwoong` 선택
2. Framework: Next.js (자동 감지)
3. Build Command: `npm run vercel-build` (`vercel.json`에 설정됨)

## 2. Neon PostgreSQL (DB — Supabase 대신 권장)

1. [neon.tech](https://neon.tech) → Sign up (GitHub 로그인 가능)
2. **New Project** → 이름: `vcwoong` → Region: **AWS ap-northeast-1 (Tokyo)** (Vercel icn1과 가까움)
3. Dashboard → **Connect** 버튼 클릭
4. 두 개의 connection string 복사:

| Neon에서 | Vercel 변수 | 용도 |
|----------|-------------|------|
| **Pooled connection** | `DATABASE_URL` | 앱 런타임 (Vercel) |
| **Direct connection** | `DIRECT_URL` | `prisma db push` |

> Connection string 끝에 `?sslmode=require` 가 없으면 붙여 주세요.

5. 로컬에서 스키마 반영 (1회):

```bash
cp .env.local.example .env.local
# DATABASE_URL, DIRECT_URL 붙여넣기

npx prisma db push
npx prisma db seed   # demo@vcwoong.kr / Demo1234!
```

## 3. Vercel 환경 변수

Vercel → **dealsync-jade** → Settings → Environment Variables

### 필수 (없으면 500)

| 변수 | 값 |
|------|-----|
| `DATABASE_URL` | Neon **Pooled** connection string |
| `DIRECT_URL` | Neon **Direct** connection string |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://dealsync-jade.vercel.app` |

### AI (최소 1개 — 없으면 데모 모드)

| 변수 | 어디서 |
|------|--------|
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) |

### 파일 업로드 (Vercel 프로덕션 — 나중에)

| 변수 | 값 |
|------|-----|
| `STORAGE_MODE` | `s3` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM |
| `AWS_REGION` | `ap-northeast-2` |
| `AWS_S3_BUCKET` | `vcwoong-uploads` |

### 결제 (나중에)

| 변수 | 값 |
|------|-----|
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | `test_ck_...` |
| `TOSS_SECRET_KEY` | `test_sk_...` |

→ 저장 후 **Deployments → Redeploy**

## 4. Toss 웹훅 (결제 사용 시)

```
https://dealsync-jade.vercel.app/api/payments/webhook
```

## 5. 배포 후 확인

- [ ] https://dealsync-jade.vercel.app 랜딩 페이지 (500 없음)
- [ ] `/login` → `demo@vcwoong.kr` / `Demo1234!`
- [ ] Neon Console → Tables → `User` 테이블 존재
- [ ] 보고서 생성 end-to-end

## Supabase → Neon 전환 시

- Vercel에서 기존 Supabase `DATABASE_URL` **삭제 또는 교체**
- Neon `DATABASE_URL` + `DIRECT_URL` 추가
- `npx prisma db push` 재실행 (데이터는 새 DB에 seed 필요)

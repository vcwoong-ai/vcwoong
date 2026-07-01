# DealSync 배포 가이드

## 1. GitHub 레포 연결

1. [vercel.com](https://vercel.com) → New Project → GitHub 레포 선택
2. Framework: Next.js (자동 감지)
3. Root Directory: `/` (기본값)

## 2. 환경 변수 설정 (Vercel Dashboard → Settings → Environment Variables)

| 변수 | 설명 | 예시 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 키 | `sk-ant-...` |
| `DATABASE_URL` | PostgreSQL 연결 URL | `postgresql://...` |
| `NEXTAUTH_SECRET` | NextAuth 시크릿 (랜덤 32자) | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 배포 URL | `https://dealsync.vercel.app` |
| `AWS_ACCESS_KEY_ID` | S3 접근 키 | |
| `AWS_SECRET_ACCESS_KEY` | S3 시크릿 키 | |
| `AWS_REGION` | S3 리전 | `ap-northeast-2` |
| `AWS_S3_BUCKET` | S3 버킷명 | `dealsync-uploads` |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss 클라이언트 키 | `test_ck_...` |
| `TOSS_SECRET_KEY` | Toss 시크릿 키 | `test_sk_...` |

## 3. Supabase / PostgreSQL 설정

```bash
# 로컬에서 마이그레이션 실행
npx prisma migrate deploy
npx prisma generate
```

## 4. 첫 배포

```bash
git push origin main
# Vercel이 자동으로 빌드 + 배포
```

## 5. 도메인 설정

Vercel Dashboard → Domains → 커스텀 도메인 추가

## 6. Toss Payments 운영 설정

1. [developers.tosspayments.com](https://developers.tosspayments.com) → 운영 키 발급
2. 웹훅 URL 등록: `https://your-domain.com/api/payments/webhook`
3. 환경 변수를 테스트 키 → 운영 키로 교체

## 7. 배포 후 확인

- [ ] 회원가입 → 로그인 정상 동작
- [ ] 보고서 생성 end-to-end 테스트
- [ ] ANTHROPIC_API_KEY 정상 연결 (isAIConfigured() 반환 true)
- [ ] 결제 테스트 (Toss 테스트 카드로)

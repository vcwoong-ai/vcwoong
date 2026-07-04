# 📱 모바일 5분 셋업 (Vcwoong)

## Vercel / Neon이 뭐야?

| 서비스 | 한 줄 | 비유 |
|--------|------|------|
| **Vercel** | 웹사이트를 인터넷에 올려줌 | **가게 건물** (손님이 들어오는 곳) |
| **Neon** | 회원·딜·보고서 데이터 저장 | **창고** (기록 보관) |

GitHub = 설계도 · Vercel = 건물 · Neon = 창고

배포 URL: https://dealsync-jade.vercel.app

---

## 순서 (폰 브라우저만)

### ① Neon (창고 만들기) — 2분

1. [neon.tech](https://neon.tech) 가입
2. **New Project** → 이름 `vcwoong` → Region **Tokyo**
3. **Connect** → 문자열 **2개** 복사
   - **Pooled** → 나중에 Vercel `DATABASE_URL`
   - **Direct** → 나중에 Vercel `DIRECT_URL`
4. 왼쪽 **SQL Editor** → `prisma/neon-init.sql` 내용 전체 붙여넣기 → **Run**
   - (GitHub에서 파일 열어 복사: `prisma/neon-init.sql`)

### ② Vercel (건물에 창고 연결) — 2분

1. [vercel.com](https://vercel.com) → 프로젝트 **dealsync-jade**
2. **Settings → Environment Variables** → Add:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Neon **Pooled** |
| `DIRECT_URL` | Neon **Direct** |
| `NEXTAUTH_SECRET` | 아무 긴 문자열 32자+ (랜덤) |
| `NEXTAUTH_URL` | `https://dealsync-jade.vercel.app` |

3. **Deployments → ⋯ → Redeploy**

### ③ 확인 — 1분

1. https://dealsync-jade.vercel.app 열기 (500 없어야 함)
2. **회원가입** 또는 `/register` 에서 새 계정 만들기
   - (데모 계정은 seed 없으면 없음 — 회원가입이 더 쉬움)

---

## 나중에 (지금 안 해도 됨)

| 기능 | 서비스 |
|------|--------|
| AI 보고서 | OpenRouter 또는 Gemini API 키 |
| 파일 업로드 | AWS S3 |
| 결제 | Toss Payments |

---

## 막히면

- **500 에러** → Vercel env 4개 + Redeploy 확인
- **로그인 안 됨** → `NEXTAUTH_URL` 정확히 `https://dealsync-jade.vercel.app`
- **DB 에러** → Neon SQL Editor에서 `neon-init.sql` 다시 Run

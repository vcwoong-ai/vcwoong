# DealMind 배포 가이드

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
npx prisma db seed   # demo@dealmind.kr / Demo1234!
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
| `OPENROUTER_API_KEY` | AI 보고서 (없으면 데모 모드) |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 구독 결제 |
| `TOSS_WEBHOOK_SECRET` | 결제 웹훅 검증 (**결제를 쓴다면 필수** — 미설정 시 웹훅이 무시되어 구독 해지가 반영되지 않음) |

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

### 업타임 모니터링과 DB 진단

- 주기적인 웹 서버 생존 확인은 `GET /api/health/live`를 사용합니다.
  DB·AI 모듈을 로드하거나 쿼리하지 않으며, 캐시되지 않는
  `{ "status": "ok", "check": "liveness" }` 응답을 반환합니다.
- 기존 `GET /api/health`는 DB 연결 진단용으로 유지합니다. 요청마다
  `SELECT 1`을 실행하므로 짧은 주기로 호출하면 Neon 자동 절전을 방해할 수 있습니다.
  `X-Health-Secret`은 상세 정보 공개만 제어하며 DB 조회 자체를 막지는 않습니다.
- 기존 모니터가 있다면 대상이 생존 확인인지 DB 연결 확인인지 확인한 뒤,
  생존 확인 용도의 URL만 `/api/health/live`로 변경합니다. 이 경로의 성공은
  DB·인증·AI 기능 정상 작동을 보장하지 않으므로 별도 기능 점검은 유지합니다.
- 보고서 자동 재개 cron은 기능상 안전망입니다. 실제 실행 기록과 DB 사용량을
  대조하기 전에는 중지하거나 주기를 늘리지 않습니다.

### Neon 무료 한도 점검

Neon 프로젝트의 endpoint 호스트와 **실제 운영 배포**의 `DATABASE_URL` 호스트를
비교합니다(`-pooler` 차이는 동일 endpoint로 간주). 프로젝트 이름이나
같은 계정에 속한다는 사실만으로 운영 DB라고 단정하지 않습니다.
전체 연결 문자열이나 비밀번호를 로그·문서에 남기지 않습니다.

무료 컴퓨트는 쿼리 횟수가 아니라 CU × 실행시간으로 차감됩니다.
DB를 조회하지 않는 생존 확인 경로를 추가하는 것만으로 절감되지는 않으며,
실제로 해당 DB를 깨우던 모니터를 전환하고 다른 트래픽이 없는 구간에
절전이 발생해야 절감됩니다. 변경 전후 같은 시간대의 CU-hour 증가량과
active/idle 상태를 비교해 검증합니다.

참고: [Neon 요금 및 한도](https://neon.com/docs/introduction/plans),
[자동 절전](https://neon.com/docs/introduction/scale-to-zero).

- [ ] 사이트 500 없음
- [ ] 회원가입/로그인
- [ ] Neon Table Editor → `User` 테이블

📱 모바일 가이드: [`docs/MOBILE-SETUP.md`](docs/MOBILE-SETUP.md)

# DealMind (딜마인드) — AI 투자심의 자동화 플랫폼

한국 벤처캐피탈을 위한 AI 기반 투자심의보고서(IC Report) 자동화 SaaS

> **브랜드:** DealMind (딜마인드) · GitHub `vcwoong-ai/vcwoong`  
> **참고:** Claude Code의 별도 프로젝트 "DealSync"와 무관합니다.

## 링크

| 항목 | 주소 |
|------|------|
| GitHub | https://github.com/vcwoong-ai/vcwoong |
| Vercel (배포) | https://dealsync-jade.vercel.app |
| 현재 브랜치 | `main` |
| 에이전트 가이드 | [`docs/phases/`](docs/phases/) |
| 브랜치·PR 통합 현황 | [`docs/PROJECT.md`](docs/PROJECT.md) |

## 주요 기능

- **AI 보고서 생성**: Claude Sonnet 4.6을 활용한 10개 섹션 자동 작성
- **섹터 전문 에이전트**:
  - **General Agent**: 범용 투자 분석
  - **Dr. Cell (Bio Agent)**: 바이오/헬스케어 특화 — rNPV 모델링, 임상 분석
  - **IT Agent**: IT/SaaS 특화 — SaaS 지표, 플랫폼 경제 분석
- **문서 파싱**: PDF, DOCX, XLSX, PPTX 자동 텍스트 추출
- **DOCX 내보내기**: 투자심의보고서 DOCX 형식 다운로드
- **인라인 편집**: AI 생성 섹션 직접 수정 및 승인

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL + Prisma ORM v6 |
| Auth | NextAuth.js (Credentials) |
| AI | Anthropic Claude Sonnet 4.6 |
| File | mammoth (DOCX), pdf-parse (PDF), xlsx |
| Storage | AWS S3 / 로컬 파일시스템 |

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.local.example .env.local
# .env.local 파일 편집
```

필수 환경 변수:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dealmind"
NEXTAUTH_SECRET="your-secret-here"
ANTHROPIC_API_KEY="sk-ant-..."
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 데이터베이스 설정

```bash
# Prisma 마이그레이션 실행
npx prisma migrate dev --name init

# 샘플 데이터 시딩 (선택)
npx tsx prisma/seed.ts
```

### 4. 개발 서버 시작

```bash
npm run dev
```

http://localhost:3000 에서 확인하세요.

### 운영자 페이지와 데모

운영자 홈은 `/admin`, 기존 샘플 자료는 `/admin/demo`, AI 비용은 `/admin/usage-cost`에서 확인한다.
기존 데모는 운영자 페이지 안에서 읽기 전용으로 조회하며 공개 데모 로그인은 운영에서 차단한다.
샘플 시드는 개발·격리 검증 환경에서만 사용한다.

운영자가 소유를 확인한 일반 DealMind 계정의 이메일과 DB `User.id`를 각각
`PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_USER_IDS`에 등록한다. 두 목록 모두 일치해야 한다.
고객사 팀 ADMIN이나 데모 계정을 플랫폼 운영자로 승격하지 않는다. 기존 비용 페이지도 같은 조건을 적용한다.
환경변수만 지정한다고 계정이 생성되지는 않는다. 기존 운영 DB에서 seed/db push를 실행하지 않는다.

문의 주소는 `dealmindspace@gmail.com`이다. 이 주소를 Resend의 `EMAIL_FROM`으로 사용하지 않는다.
자동 발송의 발신 주소는 Resend 인증 도메인 주소이고 답장 주소는 위 Gmail이다.

### 이 컴퓨터의 DART·KIPRIS 연결

`W:/Dealmind/primary`의 `.env.services.local`에 `DART_API_KEY`와 `KIPRIS_API_KEY`를
각각 입력한다. 이 파일은 Git에서 제외되며 키를 소스나 `NEXT_PUBLIC_*`에 넣지 않는다.
KIPRIS는 **특허·실용 공개·등록공보의 REST API** 이용 승인이 필요하다.

```powershell
npm run services:check              # 키 존재만 확인, API 호출 없음
npm run services:check -- --dart     # 공개 기업 예제 1회 조회
npm run services:check -- --kipris   # 공개 출원인 예제 1회 조회
npm run dev:services -- --hostname 127.0.0.1 -p 3001
```

마지막 명령은 키를 읽어 합성 SQLite 환경의 개발 서버를 시작한다. 현재 실행 중인 서버와
포트를 구분하고, 일반 `dev:local`은 이 별도 파일을 자동으로 읽지 않는다.
배포 환경에는 서버 환경변수를 별도로 연결해야 한다. 자세한 확인 상태는
[서비스 연결 기록](docs/release-connections-2026-10-06.md)을 따른다.

### 미팅 기록 첫 구현

VC·PE 딜에 녹음 파일을 연결하고 전사, 회의록 초안 수정·확정, 원본 구간 재생과
확정본 Markdown 내보내기를 제공하는 첫 버전을 구현했다. 딜 쓰기 권한과 유효한
유료 구독, 명시적 월·파일 시간 한도를 검사한다. 기능은 기본 꺼짐이며 기존 DB에
새 모델을 자동 적용하지 않는다. 직접 녹음과 기존 IR 대조·보고서 반영은 후속 범위다.

[미팅 기록 개발 현황](docs/meeting-intelligence-plan-2026-10-06.md)에 격리 DB patch,
비공개 저장소, FFprobe와 별도 작업 실행기의 조건 및 실제 검증 범위를 기록했다.
`npm run meetings:worker`는 설정 존재만 확인하며 유료 API를 호출하지 않는다.

## 투자심의보고서 구조

| # | 섹션 | 설명 |
|---|------|------|
| 1 | 투자개요 | 핵심 조건, 투자 포인트 요약 |
| 2 | 회사개요 | 설립 배경, 경영진, 연혁 |
| 3 | 제품/기술 | 핵심 기술, IP, 로드맵 |
| 4 | 시장분석 | TAM/SAM/SOM, 경쟁 분석 |
| 5 | 재무현황 | 손익, 현금흐름, 재무비율 |
| 6 | 밸류에이션 | DCF, Comps, rNPV (바이오) |
| 7 | 리스크 | 리스크 매트릭스, 완화 방안 |
| 8 | 투자조건 | 투자 구조, 우선주 조건 |
| 9 | 의견종합 | 투자 의견, 핵심 포인트 |
| 10 | 별첨 | 보조 자료 및 참고 데이터 |

## 한글 자수 계산 규칙

```
한글 1자 = 1.0 (시각적 너비)
영문/숫자 = 0.5
```

`getKoreanVisualWidth()` 함수로 정확한 시각적 너비를 계산합니다.

## 프로젝트 구조

```
src/
├── app/                 # Next.js App Router 페이지 & API
│   ├── api/            # REST API 엔드포인트
│   ├── dashboard/      # 대시보드
│   ├── deals/          # 딜 관리
│   ├── reports/        # 보고서 뷰어
│   └── upload/         # 파일 업로드
├── agents/             # AI 에이전트 (General, Bio, IT)
├── components/         # React 컴포넌트
│   ├── deals/          # 딜 관련 컴포넌트
│   ├── layout/         # 레이아웃 (사이드바, 헤더)
│   ├── reports/        # 보고서 에디터
│   ├── ui/             # shadcn/ui 기본 컴포넌트
│   └── upload/         # 파일 업로더
├── lib/                # 유틸리티 & API 클라이언트
│   ├── auth.ts         # NextAuth 설정
│   ├── claude.ts       # Anthropic API 클라이언트
│   ├── docx-export.ts  # DOCX 생성
│   ├── document-parser.ts # 문서 파싱
│   ├── prisma.ts       # Prisma 클라이언트
│   └── storage.ts      # S3/로컬 스토리지
├── prompts/            # AI 프롬프트 템플릿
└── types/              # TypeScript 타입 정의
prisma/
├── schema.prisma       # 데이터베이스 스키마
└── seed.ts             # 샘플 데이터
```

## AWS S3 설정 (프로덕션)

```env
STORAGE_MODE="s3"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="ap-northeast-2"
AWS_S3_BUCKET="dealmind-documents"
```

## 라이선스

Private — 대외비

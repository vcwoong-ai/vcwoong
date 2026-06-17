# DealSync — AI 투자심의 자동화 플랫폼

한국 벤처캐피탈을 위한 AI 기반 투자심의보고서(IC Report) 자동화 SaaS

## 링크

| 항목 | 주소 |
|------|------|
| GitHub | https://github.com/vcwoong-ai/vcwoong |
| Vercel (배포) | https://dealsync-vcwoong.vercel.app |
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
DATABASE_URL="postgresql://user:password@localhost:5432/dealsync"
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

### 데모 계정

```
이메일: demo@dealsync.kr
비밀번호: Demo1234!
```

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
AWS_S3_BUCKET="dealsync-documents"
```

## 라이선스

Private — 대외비

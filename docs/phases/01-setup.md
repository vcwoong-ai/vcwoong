# Phase 1: 프로젝트 초기 설정

다음 내용을 Claude Code에 그대로 붙여넣으세요.

---

DealSync라는 SaaS 프로젝트를 시작합니다. 차근차근 진행해주세요.

## 프로젝트 개요

**제품명:** DealSync
**한 줄 소개:** 섹터별 전문 AI 심사역 6명을 고용하는 VC용 투자심사보고서 자동화 SaaS

## 경쟁사 분석 (반드시 숙지)

1. **VCNote (vcnote.com)** - 한국과학기술지주 심사역이 만든 직접 경쟁자
   - 강점: 멀티에이전트, 6영역 점수, 한국 데이터 연동
   - 약점: 표준 1페이지 양식, 섹터 차별화 없음, 단발성 심사

2. **메리/비키/KV파트너스** - VC사들의 자체 인하우스 AI
   - MYSC, 더벤처스, 카카오벤처스가 자체 개발해서 사내 사용
   - 외부 판매 안 함 → 600개 VC 시장 비어있음

3. **Skywork** - 글로벌 범용 문서 AI
   - 한국 VC 도메인 없음, 양식 재현 없음

## DealSync의 4축 차별화

1. **섹터별 전문 AI 에이전트 6명** - BIO/IT/AI/제조/콘텐츠/핀테크 각각 전문 분석
2. **회사별 보고서 양식 1:1 픽셀 재현** - 고객이 쓰던 양식 그대로
3. **풀사이클** - 딜소싱 → 심사 → 사후관리 → LP 리포팅
4. **셀프서브 가격 공개** - VCNote는 가격 비공개, 우리는 공개

## 기술 스택

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API Routes
- **DB:** Supabase (PostgreSQL + Storage + Auth)
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **결제:** Toss Payments (한국)
- **배포:** Vercel
- **문서 파싱:** pdf-parse, mammoth, xlsx, pptx-parser
- **문서 생성:** pptxgenjs, docx

## 6개 섹터 AI 에이전트

| 에이전트 | 섹터 | 색상 | 아이콘 |
|---|---|---|---|
| Dr. Cell | BIO/헬스케어 | #0EA5E9 | 🧬 |
| Code | IT/SaaS | #6366F1 | ⚡ |
| Neuron | AI/딥테크 | #8B5CF6 | 🧠 |
| Maker | 제조/하드웨어 | #F59E0B | 🔧 |
| Story | 콘텐츠/엔터 | #EC4899 | 🎬 |
| Vault | 핀테크/금융 | #10B981 | 💰 |

## Phase 1 작업 지시

다음을 **순서대로** 수행하세요:

### 1. Next.js 프로젝트 생성
```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

### 2. 필수 패키지 설치
```bash
npm install @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr
npm install pdf-parse mammoth xlsx pptxgenjs docx
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install zod react-hook-form @hookform/resolvers
npm install date-fns
```

### 3. shadcn/ui 초기화
```bash
npx shadcn@latest init -d
```
그 다음 다음 컴포넌트들을 설치:
```bash
npx shadcn@latest add button card input textarea select dialog tabs badge progress skeleton table form label
```

### 4. 폴더 구조 생성
```
/app
  /(auth)
    /login
    /signup
  /(dashboard)
    /dashboard          - 메인 대시보드
    /reports            - 보고서 목록/상세
    /templates          - 양식 관리
    /portfolio          - 사후관리 (v1.5)
    /settings           - 설정/구독
  /api
    /parse              - 문서 파싱
    /generate           - 보고서 생성
    /templates          - 양식 분석
/agents
  /core                 - 공통 분석 로직
  /sectors
    /bio                - Dr. Cell
    /it-saas            - Code
    /ai-deeptech        - Neuron
    /manufacturing      - Maker
    /content            - Story
    /fintech            - Vault
  /orchestrator         - 섹터 선택, 통합
/lib
  /supabase             - DB 클라이언트
  /anthropic            - Claude API 래퍼
  /pptx                 - PPTX 생성
  /docx                 - Word 생성
  /utils                - 공통 유틸
/components
  /ui                   - shadcn 컴포넌트
  /shared               - 공통 컴포넌트
/types
```

### 5. CLAUDE.md 작성

프로젝트 루트에 `CLAUDE.md` 파일을 만들고 다음 내용 포함:
- 프로젝트 개요와 비전
- 경쟁사 분석 요약
- 4축 차별화 전략
- 기술 스택과 아키텍처 결정 사유
- 폴더 구조 설명
- 6개 섹터 에이전트 매트릭스
- Phase별 개발 로드맵 (1~10 Phase 요약)
- 코딩 컨벤션 (TypeScript strict, 함수형, async/await)

### 6. 기본 타입 정의

`/types/index.ts`에 핵심 타입 정의:
- `Sector` (6개 enum)
- `Agent` 인터페이스
- `ReportSection` 인터페이스
- `Template` 인터페이스
- `Startup` 인터페이스
- `Report` 인터페이스
- `ParsedDocument` 인터페이스

### 7. 환경 변수 템플릿

`.env.local.example` 파일 생성:
```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Phase 4 이후 추가
PUBMED_API_KEY=
GITHUB_TOKEN=
KIPRIS_API_KEY=
```

### 8. README.md 초안
- 프로젝트 소개
- 로컬 실행 방법
- 환경 변수 설명

## 완료 체크리스트

- [ ] Next.js 14 + TypeScript + Tailwind 셋업
- [ ] shadcn/ui 설치 완료
- [ ] 폴더 구조 생성 완료
- [ ] CLAUDE.md 작성 완료
- [ ] 기본 타입 정의 완료
- [ ] 빈 페이지들에 placeholder 추가 (`/dashboard`, `/reports/new` 등)
- [ ] `npm run dev`로 실행 확인

모든 작업 완료 후 git init하고 첫 커밋 만들어주세요.
완료되면 "Phase 1 완료. 다음으로 Phase 2 (Database)를 진행하세요"라고 출력하세요.

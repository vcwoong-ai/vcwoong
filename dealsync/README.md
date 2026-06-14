# DealSync — AI 기반 투자심의보고서 자동화 플랫폼

한국 벤처캐피탈 심사역을 위한 AI-powered IC 보고서 자동 생성 SaaS

## 주요 기능

- **딜 관리**: 투자 검토 딜을 파이프라인 단계별로 관리 (검토중 → 심층심사 → 투심 → 투자완료)
- **문서 업로드**: PDF, DOCX, XLSX, PPTX 파일 업로드 및 텍스트 자동 추출
- **AI 보고서 생성**: Claude AI를 활용한 10개 섹션 투자심의보고서 자동 작성
- **섹터 감지**: 바이오/헬스케어 딜 자동 감지 및 특화 프롬프트 적용
- **보고서 편집**: 각 섹션 인라인 편집, 한글 자수 카운팅
- **DOCX 내보내기**: 표준 한국 VC 보고서 템플릿 형식으로 내보내기
- **대시보드**: 파이프라인 현황, 최근 보고서, 통계

## 환경 설정

```bash
cp .env.example .env
# .env 파일에서 환경 변수 설정
```

### 필수 환경 변수

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dealsync"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."
```

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 데이터베이스 마이그레이션
npx prisma migrate dev

# 개발 서버 실행
npm run dev
```

## 기술 스택

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS v4, shadcn/ui (base-ui)
- **Backend**: Next.js API Routes, NextAuth.js
- **Database**: PostgreSQL + Prisma v7
- **AI**: Anthropic Claude (claude-sonnet-4-5)
- **문서 파싱**: mammoth (DOCX), pdf-parse (PDF)
- **DOCX 생성**: docx npm 패키지

## 보고서 섹션 (10개)

1. 회사 개요
2. 비즈니스 모델
3. 시장 분석
4. 경쟁 환경
5. 기술 및 제품
6. 경영진 및 팀
7. 재무 현황
8. 투자 조건
9. 리스크 요인
10. 투자 의견

## 한글 자수 계산 규칙

- 한글(가-힣): 1.0자
- 영문/숫자: 0.5자
- 공백: 미계산

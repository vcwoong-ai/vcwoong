# DealSync 개발 로드맵

에이전트(Claude Code / Cursor Agent)로 단계별 실행하는 통합 로드맵입니다.

## 실행 원칙

1. **작업 디렉터리:** `W:\OneDrive - SGC\dealsync` (프로젝트 루트)
2. **Phase마다 새 세션** — 컨텍스트 초기화 후 다음 파일 붙여넣기
3. **순서 준수** — 이전 Phase 산출물이 다음 Phase의 전제

## Phase 상세

### Phase 0 — 빠른 시작
- **파일:** [phases/00-quickstart.md](phases/00-quickstart.md)
- **목표:** 계정·환경 변수·실행 흐름 이해
- **시간:** 5분

### Phase 1 — 프로젝트 초기 설정
- **파일:** [phases/01-setup.md](phases/01-setup.md)
- **산출물:** Next.js 14, shadcn/ui, 폴더 구조, 타입 정의, `.env.local.example`
- **시간:** ~30분

### Phase 2 — 데이터베이스 + 인증
- **파일:** [phases/02-database.md](phases/02-database.md)
- **산출물:** Supabase 클라이언트, 마이그레이션 SQL, RLS, 로그인/회원가입
- **시간:** ~1시간

### Phase 3 — 문서 파싱 + 공통 분석 코어
- **파일:** [phases/03-core-engine.md](phases/03-core-engine.md)
- **산출물:** PDF/PPTX/Excel 파서, Claude API 래퍼, 섹터 자동 감지
- **시간:** ~2시간

### Phase 4 — BIO 섹터 (Dr. Cell)
- **파일:** [phases/04-bio-agent.md](phases/04-bio-agent.md)
- **산출물:** 파이프라인 NPV, 임상 성공률, PubMed/KIPRIS 연동
- **시간:** ~2시간

### Phase 5 — 양식 1:1 재현 엔진
- **파일:** [phases/05-template-engine.md](phases/05-template-engine.md)
- **산출물:** PPTX/Word 양식 분석, AI 매핑, 재구성 엔진
- **시간:** ~2시간

### Phase 6 — UI 완성 + 배포
- **파일:** [phases/06-ui-deployment.md](phases/06-ui-deployment.md)
- **산출물:** 3단계 마법사, 대시보드, 랜딩, Toss 결제, Vercel 배포
- **시간:** ~1시간

### Phase 7 — 보너스: 정부지원 사업계획서
- **파일:** [phases/07-bonus-government-grant.md](phases/07-bonus-government-grant.md)
- **산출물:** TIPS/KOITA 등 사업계획서 초안
- **시간:** MVP 이후

## 마일스톤

| 일정 | 완료 기준 |
|------|-----------|
| Day 1-2 | Phase 1+2 — 로그인 가능한 빈 대시보드 |
| Day 3-4 | Phase 3 — 자료 업로드·파싱 동작 |
| Day 5-6 | Phase 4+5 — BIO 보고서 + 양식 재현 |
| Day 7 | Phase 6 — MVP 배포 |

## 에이전트 세션 기록

Claude Code에서 "Deal sync progress" 제목으로 다음 경로에서 실행됨:

- 이전: `W:\OneDrive - SGC\claude`
- **현재 통합:** `W:\OneDrive - SGC\dealsync`

## 다음 단계

아직 생성된 앱 코드(`package.json`, `app/` 등)는 없습니다.  
**Phase 1** (`docs/phases/01-setup.md`)부터 에이전트에 붙여넣어 실제 코드 생성을 시작하세요.

# DealSync — Agent Context

## 제품 개요

- **이름:** DealSync (딜싱크)
- **한 줄:** 섹터별 전문 AI 심사역 6명을 고용하는 VC용 투자심사보고서 자동화 SaaS

## 4축 차별화

1. 섹터별 전문 AI 에이전트 6명 (BIO/IT/AI/제조/콘텐츠/핀테크)
2. 회사별 보고서 양식 1:1 픽셀 재현
3. 풀사이클 (딜소싱 → 심사 → 사후관리 → LP 리포팅)
4. 셀프서브 가격 공개

## 경쟁사

- **VCNote** — 직접 경쟁, 멀티에이전트·6영역 점수, 한국 데이터 연동
- **메리/비키/KV파트너스** — VC 인하우스 AI, 외부 미판매
- **Skywork** — 글로벌 범용, 한국 VC 도메인·양식 재현 없음

## 기술 스택

Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Supabase, Anthropic Claude API, Vercel, Toss Payments

## 개발 로드맵

Phase별 상세 지시는 `docs/phases/` 참고:

| Phase | 파일 | 핵심 |
|-------|------|------|
| 1 | `01-setup.md` | 프로젝트 초기화 |
| 2 | `02-database.md` | Supabase + 인증 |
| 3 | `03-core-engine.md` | 파싱 + 공통 코어 |
| 4 | `04-bio-agent.md` | Dr. Cell (BIO) |
| 5 | `05-template-engine.md` | 양식 재현 |
| 6 | `06-ui-deployment.md` | UI + 배포 |

## 코딩 컨벤션

- TypeScript strict mode
- 함수형 컴포넌트, async/await
- `@/` import alias
- shadcn/ui 컴포넌트 우선 사용
- API Route는 Zod로 입력 검증

## 섹터 에이전트

| ID | 이름 | 섹터 |
|----|------|------|
| bio | Dr. Cell | BIO/헬스케어 |
| it-saas | Code | IT/SaaS |
| ai-deeptech | Neuron | AI/딥테크 |
| manufacturing | Maker | 제조/하드웨어 |
| content | Story | 콘텐츠/엔터 |
| fintech | Vault | 핀테크/금융 |

## 작업 시 주의

- Phase 순서 준수 (이전 Phase 산출물 기반)
- 민감 정보는 `.env.local`에만 저장
- 각 Phase 완료 후 git commit

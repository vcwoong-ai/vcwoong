# DealMind — Agent Context

## 제품 개요

- **이름:** DealMind (딜마인드)
- **한 줄:** 섹터별 전문 AI 심사역 6명을 고용하는 VC용 투자심사보고서 자동화 SaaS
- **이름 유래:** Deal + Mind — 딜을 요약하는 게 아니라 판단하는 AI
- **브랜드 단일 소스:** `src/lib/brand.ts` (UI·메타데이터는 반드시 `BRAND` 참조)

### 사용 금지 이름

과거 명칭이거나 다른 프로젝트/경쟁사의 것이므로 새 코드에 쓰지 말 것.

| 금지 | 이유 |
|------|------|
| Axiom / 액시엄 | 이전 제품명 (2026-08 폐기) |
| Vcwoong / VC우ng | 이전 제품명 (2026-07 폐기) |
| DealSync / 딜싱크 | Claude Code의 별개 프로젝트 |
| VCNote / 심사노트 | 직접 경쟁사 |
| 비키 / 메리 / ZUZU | 경쟁사 |

> 예외: `src/lib/brand.ts`의 `LEGACY_CUSTOMER_KEY_PREFIXES`는 Toss에 이미
> 등록된 `axiom-<userId>` 형태 빌링키를 계속 인식하기 위한 것이라 남겨둔다.

> Vercel 슬러그(`dealsync-jade`)와 GitHub 저장소명(`vcwoong-ai/vcwoong`)은
> 인프라 식별자라 그대로 두지만, 제품 문구에는 노출하지 않는다.

## 4축 차별화

1. 섹터별 전문 AI 에이전트 6명 (BIO/IT/AI/제조/콘텐츠/핀테크)
2. 회사별 보고서 양식 1:1 픽셀 재현
3. 풀사이클 (딜소싱 → 심사 → 사후관리 → LP 리포팅)
4. 셀프서브 가격 공개

## 경쟁사

- **VCNote(심사노트)** — 직접 경쟁. 6개 전문 에이전트, 소싱→펀드 운용 풀사이클, LP 분기리포트까지 제공
- **ZUZU** — 딜소싱·포트폴리오 관리, IR AI 요약 (소싱 무료)
- **비키(더벤처스)/메리(MYSC)** — VC 인하우스 AI, 외부 미판매
- **Skywork** — 글로벌 범용, 한국 VC 도메인·양식 재현 없음

> 기능 목록만으로는 VCNote와 겹친다. 방어 가능한 차별점은
> **회사별 양식 1:1 재현**과 **섹터 분석 깊이(rNPV·PubMed 등)** 두 가지다.

## 기술 스택

Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Neon (PostgreSQL), OpenRouter, Vercel, Toss Payments

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

## 현재 구현 상태

`docs/PRODUCT-STATUS.md` 참고 — 4축 기준으로 구현/미구현과 다음 우선순위를 정리해 둠.

## 작업 시 주의

- 민감 정보는 `.env.local`에만 저장
- 브랜드 문자열 하드코딩 금지 — `BRAND`에서 가져올 것
- 오프라인 테스트: `npm run test:all` (API 키 불필요)
- 로컬 DB: `npm run db:setup:local` → `npm run dev:local`

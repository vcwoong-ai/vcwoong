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

## 5축 차별화

1. **수치 근거 추적** — 보고서의 모든 숫자를 업로드 자료와 대조해 원문 발췌까지 제시 (`src/lib/evidence.ts`)
2. 섹터별 전문 AI 에이전트 6명 (BIO/IT/AI/제조/콘텐츠/핀테크)
3. 회사별 보고서 양식 1:1 픽셀 재현
4. 풀사이클 (딜소싱 → 심사 → 사후관리 → LP 리포팅)
5. 셀프서브 가격 공개

## 경쟁사

- **VCNote(심사노트)** — 직접 경쟁, 가장 강력한 경쟁자. 한국과학기술지주(KST)
  현직 심사역이 만듦 (도메인 신뢰도 높음). `vcnote.com` 상세 분석은 아래 참고
- **ZUZU** — 딜소싱·포트폴리오 관리, IR AI 요약 (소싱 무료)
- **비키(더벤처스)/메리(MYSC)** — VC 인하우스 AI, 외부 미판매
- **Skywork** — 글로벌 범용, 한국 VC 도메인·양식 재현 없음

### VCNote 상세 분석 (2026-08-11, 실제 사이트 확인)

**"6개 에이전트"는 숫자만 같고 구조가 다르다** — 착각하기 쉬운 지점이라 명시:

| | DealMind | VCNote |
|---|---|---|
| 6개 에이전트 기준 | **섹터**별 (BIO/IT/AI/제조/콘텐츠/핀테크) | **기능**별 (시장/경쟁/팀/제품/사업/재무) |
| 의미 | 딜마다 섹터에 맞는 다른 프레임워크 적용 | 모든 딜에 동일한 6개 기능 관점 병렬 적용 |

**DealMind가 실제로 앞서는 것 (확인됨):**
- **셀프서브 가격 공개** — VCNote는 개인(무료) 외 팀/엔터프라이즈가 전부
  "도입 문의"이고 가격이 아예 비공개. DealMind의 6개 플랜 공개가 진짜
  차별점.
- **회사별 양식 1:1 재현** — VCNote는 자체 포맷으로 새 Word 문서를 생성.
  업로드한 회사 고유 양식을 그대로 재현하는 기능은 확인 안 됨.
- **섹터 딥다이브** — VCNote의 재무 시나리오는 기본/낙관/보수 범용 모델.
  BIO 임상단계별 rNPV처럼 섹터 특화 계산은 없음.

**수치 근거 추적(evidence.ts)과 VCNote "딥다이브 검증"은 메커니즘이 다름,
과장 주의:**
- VCNote: 웹·뉴스·논문에서 **추가 자료를 끌어와** 가설을 검증 (외부 확장)
- DealMind: 보고서에 **이미 쓰인 숫자**가 업로드 문서 원문에 있는지 대조
  (내부 검증)
- 방향이 반대라 직접 중복은 아니지만, "근거를 명시한다"는 컨셉 자체는
  VCNote도 마케팅 중이므로 "아무도 안 한다"는 과장이었음 — 정정.

**DealMind가 뒤처진 것 (신규 발견, 우선순위 검토 필요):**
- 딜 스코어링 + 레이더 비교 (투자 매력도 점수 — 우리 "품질 점수"는 보고서
  작성 품질이지 투자 판단 점수가 아님, 성격이 다름)
- 펀드 워터폴·XIRR·회수 시뮬레이션·민감도/자본잠식률 (우리 LP 리포팅보다
  펀드운용 툴 깊이가 앞섬)
- DART(공시) 연동 (우리는 KIPRIS 특허만, 재무공시 데이터 없음)
- SOC2·ISO27001·특허 암호화 등 보안 인증 마케팅 (우리는 랜딩에 보안
  메시지 자체가 없음)
- 무료 IRR 계산기 (리드젠 도구)
- 관리등급 맵 (포트폴리오 시각화 — 우리는 수치만 있고 이런 시각화 없음)

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

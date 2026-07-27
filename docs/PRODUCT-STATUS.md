# Axiom 제품 현황 (배포 제외)

4축 차별화 기준으로 현재 무엇이 동작하고 무엇이 남았는지 정리한 문서입니다.
다른 환경(예: Claude)에서 작업한 내용과 병합할 때 기준점으로 사용하세요.

## 1. 섹터별 전문 AI 에이전트

| 항목 | 상태 |
|------|------|
| BIO / IT / Neuron / Maker / Story / Vault | 제품·시장·재무·밸류·리스크 5섹션 특화 |
| Climate / Consumer | 5섹션 특화 + 투자개요 |
| 전 에이전트 투자개요·회사개요 | 섹터별 특화 (`src/agents/overview-helpers.ts`) |
| 투자조건·의견종합 | 한국 VC 텀시트/권고 라벨 프롬프트 |
| 라우팅 | 저장된 `agentType`이 섹터와 어긋나면 섹터 전문가 우선 |
| 외부 데이터 | PubMed / ClinicalTrials / OpenFDA (BIO) |
| 미구현 | KIPRIS 특허 연동 |

## 2. 회사별 보고서 양식 재현

| 항목 | 상태 |
|------|------|
| DOCX·PPTX 양식 업로드·파싱 | 동작 |
| 섹션 구조 → SectionKey 매핑 | 동작 (키워드 + AI) |
| 양식 순서 반영 DOCX 생성 | 동작 |
| **원본 파일의 폰트·색상·레이아웃 재현** | **미구현** — 현재는 일반 DOCX 생성 |
| PPTX 출력 | 미구현 (항상 DOCX) |
| 원본 대비 시각 비교 UI | 미구현 |

> 이 축이 4개 중 약속과 구현 간극이 가장 큽니다.
> 다음 작업: `template-reconstructor.ts` — 업로드된 원본을 열어 플레이스홀더만 치환.

## 3. 풀사이클

| 단계 | 상태 |
|------|------|
| 딜소싱 | `/sourcing` 인박스, 키워드 섹터 추정, AI 5축 스크리닝, 딜 전환 |
| 심사 | 딜 칸반, 문서 업로드·파싱, 10섹션 IC 보고서, 품질 점수, 섹션 재생성 |
| 사후관리 | `/portfolio` MOIC·DPI·TVPI, 분기 KPI 시계열, 마일스톤, AI 분기 노트, 알림 |
| LP 리포팅 | `/lp-report` 펀드 지표·섹터 배분 실계산, 분기 리포트 생성·저장, DOCX 내보내기 |

데이터 모델: `Fund` → `PortfolioCompany` → `CompanyKPI` / `Milestone` / `PortfolioUpdate`, `LpReport`, `InboundDeal`

## 4. 셀프서브 가격

| 항목 | 상태 |
|------|------|
| `/pricing` 공개 가격 페이지 | 6개 플랜 + FAQ |
| 단일 정의 소스 | `src/lib/plans.ts` (랜딩·가격페이지 공용) |
| 월 한도 (보고서·양식) | `src/lib/quotas.ts` 에서 강제 |
| 기능 게이트 | `requireFeature()` — LP 리포팅·포트폴리오 402 응답 |
| 구독 해지 | `POST /api/payments/cancel` + 설정 화면 버튼 |
| 미구현 | 팀 협업(Team 모델 미사용), 연간 결제 |

## 내보내기

| 형식 | IC 보고서 | LP 리포트 |
|------|-----------|-----------|
| DOCX | O | O |
| PDF | O (브라우저 인쇄 뷰 `/reports/[id]/print`) | 인쇄 뷰 미구현 |
| PPTX | X | X |

> 한글 PDF는 폰트 임베딩(15MB+)이 필요해 브라우저 "PDF로 저장"을 사용합니다.

## 로컬 실행

```bash
npm run db:setup:local     # SQLite + 시드 (펀드·포트폴리오·인바운드 포함)
npm run dev:local
npm run test:all           # quality + fixtures + routing (API 키 불필요)
```

데모: `demo@axiom.kr` / `Demo1234!` (FULL 플랜)

## 남은 우선순위

1. 양식 1:1 재현 엔진 (`template-reconstructor.ts`, PPTX 출력, 비교 UI)
2. 팀 협업 — `Team` 모델 활성화, 딜·양식 공유
3. KIPRIS 특허 연동 (BIO 에이전트)
4. 딜소싱 자동 수집 (메일 인입 파싱)
5. LP 리포트 인쇄/PDF 뷰

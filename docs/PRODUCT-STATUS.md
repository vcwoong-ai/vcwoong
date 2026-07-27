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
| 외부 데이터 | PubMed / ClinicalTrials / OpenFDA / KIPRIS 특허 (BIO) |

## 2. 회사별 보고서 양식 재현

| 항목 | 상태 |
|------|------|
| DOCX·PPTX 양식 업로드·파싱 | 동작 |
| 섹션 구조 → SectionKey 매핑 | 동작 (키워드 + AI) |
| **원본 파일의 폰트·색상·레이아웃 재현** | 동작 — `template-reconstructor.ts` |
| PPTX 출력 | 동작 — `pptx-reconstructor.ts` |
| 원본 대비 시각 비교 UI | 동작 — `/templates/[id]/compare` |
| 양식 순서 반영 재생성 (폴백) | 동작 — 원본을 못 읽을 때 |

> 재현 방식: 새 파일을 만들지 않고 **업로드된 원본 zip을 열어
> `word/document.xml`(또는 슬라이드 XML)의 본문 단락만 교체**한다.
> `styles.xml`·테마·numbering·머리글을 건드리지 않으므로 서식이 그대로 남고,
> 새 본문은 해당 섹션 원본 단락의 `pPr`/`rPr`을 복제해 폰트·색상을 물려받는다.
> 검증: `npm run test:template`

## 3. 풀사이클

| 단계 | 상태 |
|------|------|
| 딜소싱 | `/sourcing` 인박스, IR 메일 붙여넣기 자동 파싱, 키워드 섹터 추정, AI 5축 스크리닝, 딜 전환 |
| 심사 | 딜 칸반, 문서 업로드·파싱, 10섹션 IC 보고서, 품질 점수, 섹션 재생성 |
| 사후관리 | `/portfolio` MOIC·DPI·TVPI, 분기 KPI 시계열, 마일스톤, AI 분기 노트, 알림 |
| LP 리포팅 | `/lp-report` 펀드 지표·섹터 배분 실계산, 분기 리포트 생성·저장, DOCX 내보내기 |

데이터 모델: `Fund` → `PortfolioCompany` → `CompanyKPI` / `Milestone` / `PortfolioUpdate`, `LpReport`, `InboundDeal`, `Team` / `TeamInvite`

## 4. 셀프서브 가격

| 항목 | 상태 |
|------|------|
| `/pricing` 공개 가격 페이지 | 6개 플랜 + FAQ |
| 단일 정의 소스 | `src/lib/plans.ts` (랜딩·가격페이지 공용) |
| 월 한도 (보고서·양식) | `src/lib/quotas.ts` 에서 강제 |
| 기능 게이트 | `requireFeature()` — LP 리포팅·포트폴리오 402 응답 |
| 구독 해지 | `POST /api/payments/cancel` + 설정 화면 버튼 |
| 팀 협업 | `/team` — 팀 생성·초대코드·멤버 관리, 딜/양식 공유 (Sector Pro+) |
| 미구현 | 연간 결제 |

### 팀 협업 접근 규칙

`src/lib/team.ts`의 `ownedOrShared()` / `dealScope()`를 모든 조회 경로에 적용한다.

| 동작 | 소유자 | 팀원 |
|------|--------|------|
| 공유된 딜·양식 조회 | O | O |
| 딜 내용 편집 | O | O |
| 공유 설정 변경 | O | X (403) |
| 삭제 | O | X |
| 초대·멤버 제외 | 팀 소유자만 | X (403) |

팀원 제외·탈퇴·해산 시 해당 사용자가 공유한 딜·양식은 자동으로 공유 해제된다.

## 내보내기

| 형식 | IC 보고서 | LP 리포트 |
|------|-----------|-----------|
| DOCX | O (양식 연결 시 원본 1:1 재현) | O |
| PDF | O (브라우저 인쇄 뷰 `/reports/[id]/print`) | O (`/lp-report/[id]/print`) |
| PPTX | O (PPTX 양식 연결 시) | X |

> 한글 PDF는 폰트 임베딩(15MB+)이 필요해 브라우저 "PDF로 저장"을 사용합니다.

## 로컬 실행

```bash
npm run db:setup:local     # SQLite + 시드 (펀드·포트폴리오·인바운드 포함)
npm run dev:local
npm run test:all           # quality + fixtures + routing + email + template (API 키 불필요)
```

데모: `demo@axiom.kr` / `Demo1234!` (FULL 플랜)

## 남은 우선순위

1. 연간 결제 플랜
2. 딜소싱 메일함 자동 연동 (현재는 붙여넣기 방식)
3. LP 리포트 양식 재현 (현재 IC 보고서만 지원)

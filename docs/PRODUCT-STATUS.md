# DealMind 제품 현황 (배포 제외)

5축 차별화 기준으로 현재 무엇이 동작하고 무엇이 남았는지 정리한 문서입니다.
다른 환경(예: Claude)에서 작업한 내용과 병합할 때 기준점으로 사용하세요.

## -1. VCNote 갭 해소 (2026-08-11 추가)

VCNote 실제 사이트 확인 후 "뒤처진 것"으로 기록했던 항목들을 처리했다.

| 항목 | 상태 | 비고 |
|------|------|------|
| 딜 스코어링 + 레이더 비교 | **동작** — `src/lib/deal-scoring.ts` | 투자 매력도 점수(시장성·팀·제품·사업모델·재무·경쟁우위 6차원), AI 호출. `/deals/[id]` 투자매력도 탭, `/deals/compare`에서 여러 딜 오버레이 비교 |
| 펀드 워터폴·XIRR·회수시뮬레이션·민감도/자본잠식 | **동작** — `src/lib/fund-analytics.ts` | Newton-Raphson XIRR, 유럽식 4단계 워터폴 시뮬레이터, 배수×시점 민감도 그리드, 자본잠식(투자원금 대비 손상) 지표. `/lp-report/[id]/analytics`. AI 호출 없는 순수 계산 |
| DART(공시) 연동 | **동작(API 키 필요)** — `src/lib/dart.ts` | KIPRIS와 같은 패턴: 키 없으면 조용히 빈 결과. `/deals/[id]` 전자공시 탭 |
| 보안 인증 마케팅 | **의도적으로 안 함** | SOC2·ISO27001 등 실제로 받지 않은 인증은 배지로 걸지 않음(허위광고 소지) — 대신 랜딩에 실제 적용된 것만(TLS, 저장 암호화, bcrypt, 팀 권한 분리, 웹훅 서명·레이트리밋) 정직하게 안내 |
| 무료 IRR 계산기 | **동작** — `/irr-calculator` | 로그인 불필요 공개 리드젠 도구. VCNote 자체 예시(10억→50억,5년=38.0%,5.0x)와 동일 결과로 검증 |
| 포트폴리오 관리등급 맵 | **동작** — `/portfolio` 관리등급 맵 뷰 | A~F 등급, 상태 태그(WATCH/RISK)가 MOIC 숫자보다 우선 |
| 딥다이브 검증(보조 리서치) | **동작(API 키 필요)** — `src/lib/deep-dive.ts` | evidence.ts와 반대 방향 — 보고서 핵심 주장(시장 규모·성장률·시장 지위)을 Naver 뉴스·웹 검색으로 "밖에서" 교차 검증 후 AI가 지지/불일치/불명확 판정. `/reports/[id]` 딥다이브 패널. 키(NAVER_CLIENT_ID/SECRET) 없거나 검색 결과 0건이면 항상 "불명확"(데모 모드 시 "데모 모드" 안내) |

한계(정확도 과장 금지):
- 펀드 XIRR/워터폴은 `Fund.paidIn` 총액만 쓴다 — capital call 시점별 이력이 없어 납입 시점 정밀도는 낮다
- 미실현 포지션은 "오늘 시점에 현재가치로 청산했다"고 가정해 XIRR에 포함한다(VC/PE 업계 표준 관행, 실제 회수 아님)
- DART는 API 키가 있어야 실제로 조회되며, 비상장 스타트업 대부분은 애초에 DART에 없는 게 정상이다
- 딥다이브는 정규식으로 뽑은 문장만 검증 대상이다(시장 규모/성장률/시장 지위 패턴에 안 걸리는 주장은 애초에 검증 후보에도 안 오름) — "검증 안 됨"이 아니라 "검증 대상으로도 안 뽑힘"일 수 있음을 구분해야 함

검증: `npm run test:deal-scoring`, `test:fund-analytics`, `test:dart`, `test:irr-calculator`, `test:portfolio-grade`, `test:deep-dive` (전부 `test:all`에 포함, API 키 불필요)

## 0. 수치 근거 추적 (2026-08-11 추가)

| 항목 | 상태 |
|------|------|
| 보고서 수치 ↔ 업로드 자료 대조 | **동작** — `src/lib/evidence.ts` |
| 상태 구분 (문서 확인 / 딜 입력 / 근거 없음) | 동작 |
| 근거 문서명 + 원문 발췌 표시 | 동작 |
| 보고서 화면 패널 | 동작 — `report-evidence-panel.tsx` |
| API | `GET /api/reports/[id]/evidence` (AI 호출 없음, 문자열 대조라 무료) |
| 노이즈 제외 | 연도·항목번호·NCT 식별자·자동 품질 메모 |
| 오매칭 방지 | 숫자 토큰 단위 정확 비교 (45가 1450에 걸리지 않음) |
| 검증 | `npm run test:evidence` (8케이스) |

시드 보고서 실측: 수치 29개 중 문서 확인 18 / 딜 입력 2 / 근거 없음 9 (추적 69%).
근거 없음으로 잡힌 값은 "Phase II→III 전환 확률 40%", "항암제 시장 연 10% 성장"처럼
AI가 업계 통념에서 끌어온 수치들로, 실제로 심사역이 IC 전에 확인해야 하는 것들이다.

> **한계(과장 금지)**: '문서 확인'은 같은 값이 자료에 있다는 뜻이지 해석이 맞다는
> 보증이 아니다. 반대 방향(자료의 팩트가 보고서에 쓰였는지)은
> `report-quality.ts`의 `checkFactConsistency`가 따로 본다.

## 1. 섹터별 전문 AI 에이전트

| 항목 | 상태 |
|------|------|
| BIO / IT / Neuron / Maker / Story / Vault | 제품·시장·재무·밸류·리스크 5섹션 특화 |
| Climate / Consumer | 5섹션 특화 + 투자개요 |
| 전 에이전트 투자개요·회사개요 | 섹터별 특화 (`src/agents/overview-helpers.ts`) |
| 투자조건·의견종합 | 한국 VC 텀시트/권고 라벨 프롬프트 |
| 라우팅 | 저장된 `agentType`이 섹터와 어긋나면 섹터 전문가 우선 |
| 외부 데이터 | PubMed / ClinicalTrials / OpenFDA (BIO) |
| KIPRIS 특허 | **동작** — API 키 시 실시간 검색, 없으면 IR 문서에서 추출 |

## 2. 회사별 보고서 양식 재현

| 항목 | 상태 |
|------|------|
| DOCX·PPTX 양식 업로드·파싱 | 동작 |
| 섹션 구조 → SectionKey 매핑 | 동작 (키워드 + AI) |
| **원본 DOCX 서식 1:1 재현** | **동작** — 원본 파일에 본문 단락만 치환 |
| 폰트·색상·헤더/푸터·표지·styles.xml 보존 | 동작 (`test:template`으로 검증) |
| 마크다운 → 단락·불릿·표 변환 | 동작 |
| 플레이스홀더 치환 (`{{기업명}}`, `[기업명]`) | 동작 |
| 재현 미리보기 (교체 구간 표시) | 동작 |
| PPTX 출력 | **동작** — 섹션별 슬라이드 생성 또는 **원본 PPTX 1:1 재현** |
| PPTX 양식 1:1 재현 | **동작** — 원본 슬라이드 본문 placeholder만 치환 |
| 원본 대비 렌더 이미지 비교 | **구조 QA로 대체** — `POST /api/templates/[id]/qa` (styles/헤더/슬라이드 보존 점수) |

### 재현 동작 방식

새 문서를 만들지 않고 **업로드된 원본 DOCX를 열어 본문만 갈아끼운다.**
`styles.xml`·theme·헤더/푸터·이미지·번호매기기를 건드리지 않으므로
회사 양식의 폰트·색상·여백이 원본과 동일하게 유지된다.

내보내기는 3단 폴백으로 동작한다 (응답의 `X-Export-Mode` 헤더로 확인 가능).

| 순위 | 모드 | 조건 |
|------|------|------|
| 1 | `reconstructed:N/M` | DOCX 원본을 읽고 섹션 제목 매칭 성공 |
| 2 | `template-ordered` | 매칭 실패 — 섹션 순서만 반영한 신규 DOCX |
| 3 | `default` | 양식 없음 또는 플랜 미해당 |

관련 파일: `src/lib/template/docx-xml.ts`, `template-reconstructor.ts`

> **2026-09-01 추가— 표준 10섹션 밖 슬라이드/헤딩 보조 추출**: "인력 구성",
> "주주 구성", "사업 계획"처럼 표준 10개 섹션(`SectionKey`)에 대응하지
> 않는 슬라이드·헤딩은 AI 생성 섹션으로는 못 채웠다(원본 예시 회사 내용이
> 그대로 남음). `src/lib/template/slide-extraction.ts`가 이런 자리를
> 업로드된 IR 자료 원문에서 관련 내용을 찾아 채운다 — 새로 판단·서술하지
> 않고 "찾아서 정리"만 하며, 자료에 없으면 null을 반환해 원본을 그대로
> 둔다(지어내지 않음). API 키 없는 데모 모드에서는 목 응답이 실제 추출
> 결과가 아니므로 항상 건너뛴다(`usedModel === "demo-mock"` 가드).
> 한 번의 내보내기에서 최대 6개 슬라이드까지 시도(`MAX_EXTRACTION_ATTEMPTS`).
> `X-Export-Mode`에 `+extracted:N`으로 몇 개가 이 경로로 채워졌는지 표시.
> 검증: `npm run test:template`(데모 모드에서 추측성 내용을 주입하지
> 않는지 확인). 실제 사용자가 제공한 16슬라이드 PPTX 기준 — 표준 섹션
> 매핑으로 9/16, 이 보조 추출까지 더하면(실 API 키 환경에서) 최대
> 14/16까지 채울 수 있는 구조(자료에 실제 내용이 있는 경우에 한함).

## 3. 풀사이클

| 단계 | 상태 |
|------|------|
| 딜소싱 | `/sourcing` 인박스, 메일 붙여넣기, Webhook, **폴링 UI** (`/api/sourcing/poll`), **팀 공유** |
| 심사 | 딜 칸반, 문서 업로드·파싱, 10섹션 IC 보고서, 품질 점수, 섹션 재생성 |
| 사후관리 | `/portfolio` MOIC·DPI·TVPI, 분기 KPI 시계열, 마일스톤, AI 분기 노트, 알림 · **팀 공유** |
| LP 리포팅 | `/lp-report` 펀드 지표·섹터 배분 실계산, 분기 리포트 생성·저장, DOCX 내보내기 · **팀 공유** |

데이터 모델: `Fund` → `PortfolioCompany` → `CompanyKPI` / `Milestone` / `PortfolioUpdate`, `LpReport`, `InboundDeal`

## 4. 셀프서브 가격

| 항목 | 상태 |
|------|------|
| `/pricing` 공개 가격 페이지 | 6개 플랜 + FAQ |
| 단일 정의 소스 | `src/lib/plans.ts` (랜딩·가격페이지 공용) |
| 월 한도 (보고서·양식) | `src/lib/quotas.ts` 에서 강제 |
| 기능 게이트 | `requireFeature()` — LP 리포팅·포트폴리오 402 응답 |
| 구독 해지 | `POST /api/payments/cancel` + 설정 화면 버튼 |
| **팀 협업** | **동작** — 딜·양식·펀드·포트폴리오·인바운드 (심사역=조회, 파트너=편집) |
| **연간 결제** | **동작** — 월간/연간 토글, 연간 시 2개월 무료 (월×10) |
| 미구현 | — |

## 내보내기

| 형식 | IC 보고서 | LP 리포트 |
|------|-----------|-----------|
| DOCX | O | O |
| PDF | O (브라우저 인쇄 뷰 `/reports/[id]/print`) | O (`/lp-report/[id]/print`) |
| PPTX | O (`?format=pptx`) | O (`?format=pptx`) |

> 한글 PDF는 폰트 임베딩(15MB+)이 필요해 브라우저 "PDF로 저장"을 사용합니다.

> **2026-08-10 실사용 버그 수정**: 문서 업로드(PDF)와 PPTX 신규 생성이
> 프로덕션에서 실제로는 동작하지 않았던 게 발견돼 수정됨 — 로컬
> 검증(python-pptx 등 느슨한 파서, `next build`)에서는 안 드러나고
> 실사용자가 직접 열어봐야만 재현되는 종류의 버그였음. **이 표의 "O"는
> 코드 존재 여부일 뿐 실사용자 테스트로 확인된 게 아닐 수 있다는 뜻으로
> 읽을 것.** (`pdf-parse` v1→v2 API 불일치, `@napi-rs/canvas` 네이티브
> 바이너리 배포 누락, PPTX 필수 파트(테마) 누락 — 상세는 PR #34~#37)
> PPTX 신규 생성은 이번에 pptxgenjs로 교체하면서 표 자동 변환 + 브랜드
> 테마 + 핵심 지표 막대차트도 추가됨.
>
> **2026-08-13 추가**: 업로드한 DOCX·PPTX(IR 자료)에서 내장 이미지를
> 추출해 PPTX 내보내기 끝에 "첨부 이미지" 슬라이드로 자동 삽입한다
> (`src/lib/document-images.ts`, `src/lib/pptx-export.ts`). 8KB 미만
> 이미지(로고·아이콘 추정)는 제외, 문서당 최대 6개·보고서 전체 최대
> 8개로 상한. PDF는 지원 안 함(텍스트 레이어만 뽑는 pdf-parse로는
> 이미지를 못 꺼냄 — pdfjs-dist 같은 무거운 의존성 추가가 필요해 범위
> 밖으로 뺌). 양식 재현(reconstructed) 경로는 원본 PPTX 구조를 그대로
> 쓰므로 이미지 첨부 대상이 아니고, 신규 생성(`pptx-generated`) 경로만
> 해당. 검증: `npm run test:document-images`. 실제 이미지 담긴 DOCX
> 업로드 → PPTX 내보내기 → 결과물을 JSZip으로 열어 `ppt/media/`에
> 이미지가, 마지막 슬라이드에 참조(`r:embed`)가 들어있는 것까지
> end-to-end로 확인함.

## 로컬 실행

```bash
npm run db:setup:local     # SQLite + 시드 (펀드·포트폴리오·인바운드 포함)
npm run dev:local
npm run test:all           # quality + fixtures + routing + template + 근거추적 (API 키 불필요)
npm run test:template      # 양식 1:1 재현 서식 보존 검증
```

데모 계정 (시드 후, FULL 플랜 · 동일 팀):

| 계정 | 비밀번호 | 역할 |
|------|----------|------|
| `demo@dealmind.kr` | `Demo1234!` | ADMIN (소유·공유 관리) |
| `partner@dealmind.kr` | `Partner1234!` | PARTNER (공유 딜 편집) |
| `analyst@dealmind.kr` | `Analyst1234!` | ANALYST (공유 딜 조회 전용) |

샘플 딜·펀드·포트폴리오·인바운드는 팀에 공유되어 역할별 권한을 바로 확인할 수 있습니다.

## 남은 우선순위 (2026-08-13 갱신)

완료된 것 (이전 목록에서 이동):

- ~~딥다이브 검증 프로덕션 반영~~ — SQL 패치·Naver 키 등록·재배포 전부
  완료, 프로덕션에서 실제 뉴스·웹 검색 → AI 판정("지지" + 출처 링크)까지
  end-to-end 확인함. 다만 검색 API 인증 방식이 두 번 헤맨 지점이었다 —
  developers.naver.com(구, `X-Naver-Client-Id`)과 NAVER API HUB/NCP
  (`X-NCP-APIGW-API-KEY-ID`)가 호스트·헤더 모두 다르고, 호스트 이름도
  한 글자 오타(`naveropenapi` vs 실제 `naverapihub`)로 계속 401/404가
  났었음. 지금은 공식 문서로 확정된 `naverapihub.apigw.ntruss.com`
  으로 고정.
- ~~PPTX/보고서에 실제 이미지·차트 삽입~~ — 업로드 DOCX·PPTX에서 내장
  이미지를 추출해 PPTX 내보내기 끝에 첨부 슬라이드로 삽입 (아래 "내보내기"
  섹션 참고). PDF는 범위 밖.
- 딜 파이프라인 단계명 정리 — 스크리닝→검토, 딥다이브→IR 예정,
  IC 준비→투자심의위원회, IC 심의→IR 심의로 변경. 라벨이
  `deal-card.tsx`/`deal-kanban.tsx`/`edit-deal-dialog.tsx`/
  `dashboard/page.tsx`/`portfolio-page-client.tsx`/`reports/new/page.tsx`
  여섯 곳에 따로 복사돼 있어서 상세 페이지 헤더 하나를 빠뜨려 "IC_PREP"
  같은 enum 원본값이 그대로 노출된 적이 있었다 — `src/lib/deal-labels.ts`
  하나로 통합해 같은 종류 버그가 구조적으로 재발 못 하게 함
- `/deals` 일괄 삭제 UI
- 양식 업로드 후 분석이 `ANALYZING`에 영원히 멈추는 실사용 버그 수정 —
  Vercel 서버리스는 응답을 보낸 직후 함수를 얼릴 수 있는데, 분석을
  `waitUntil()` 없이 fire-and-forget으로 돌리고 있었음(보고서 생성
  쪽은 이미 `waitUntil` 적용돼 있었으나 양식 분석만 빠져 있었음)
- 양식 재현 시 같은 표준 섹션에 매핑된 슬라이드/헤딩이 여러 개면 첫
  번째만 채우고 나머지는 원본 예시 회사 데이터가 그대로 남던 버그 수정
  (실사용자 리포트로 발견). 표준 10개 섹션에 아예 대응하지 않는
  슬라이드("인력 구성" 등)는 업로드 자료에서 관련 내용을 찾아 대신
  채우는 보조 추출도 추가 — 위 "2. 회사별 보고서 양식 재현" 섹션 참고

남은 것:

1. **실사용자 테스트**: 딜 스코어링·펀드 심화 분석은 아직 실제
   OpenRouter 키로 AI 응답 품질을 안 봤다. 이 프로젝트는 코드만 보고
   "동작"이라 적었다가 프로덕션에서 몇 주간 조용히 깨져 있던 전적이
   두 번 있다(PDF 파싱, PPTX 내보내기) — 같은 실수 반복 안 하려면 필수
2. DART_API_KEY / KIPRIS_API_KEY / IMAP(Gmail 앱 비밀번호) — 사용자가
   Vercel에 등록 완료라고 확인함. 이 세션(에이전트)은 샌드박스 네트워크
   제약으로 실제 외부 API 호출을 검증할 수 없으니, 배포 후 딜 상세의
   전자공시 탭·특허 검색·딜소싱 인박스가 실제로 데이터를 가져오는지
   직접 확인 필요
3. Toss Payments 라이브 키 전환 — 통신판매업 등록 필요, 진행 상황 확인 필요
4. 픽셀 렌더 이미지 비교 (현재는 OOXML 구조 QA)
5. **코드상 "동작"으로 표시된 기능도 실사용자 테스트 없이는 신뢰하기
   어렵다는 게 이번에 확인됨** — 문서 파싱·PPTX 내보내기 둘 다 몇 주간
   조용히 깨져 있었음. 우선순위가 높은 기능부터 실제 파일로 한 번씩
   직접 테스트해볼 가치가 있음

## 2026-09-01 — Vercel Hobby(무료) 플랜 대비

상용화를 잠시 보류하기로 하고 Pro 구독을 이번 달까지만 쓰기로 함
(트래픽이 적어 Hobby 무료 한도로 충분, 매달 고정비 부담을 없애는 목적).

- `vercel.json`의 `maxDuration`을 800초 → 60초로 전부 낮춤. Hobby는
  함수 실행시간이 60초로 강제 상한돼서, 800초로 둬도 어차피 무시되고
  강제 종료된다 — 미리 낮춰서 배포 실패나 예상치 못한 동작을 방지.
- `report-generation.ts`의 `GENERATION_BUDGET_MS`(자체 중단 시간)도
  660초 → 40초로 낮춤. 이제 보고서 생성이 섹션 몇 개 만들면 스스로
  멈추고 저장한 뒤 "다시 시도"로 이어서 만드는 방식이 훨씬 자주
  발생함 — 느려지지만 깨지진 않음. `REPORT_GENERATION_BUDGET_MS`
  환경변수로 오버라이드 가능하니, 나중에 Pro로 복귀하면 이 값만
  올리면 됨(코드 변경 불필요).
- 점검 중 `src/app/api/agents/*/analyze/route.ts`(7개)와
  `src/app/api/lp-report/generate/route.ts`가 어디서도 호출되지 않는
  죽은 코드로 확인됨 — 예전 아키텍처의 흔적으로 보임. 지금은 손대지
  않았지만 정리 대상 후보.
- Hobby 플랜은 약관상 비상업 프로젝트 전용이라, 상용화를 다시
  검토할 때는 Pro 재구독이 필요함.

# AI 품질 업그레이드 가이드 (배포 제외)

Supabase/Vercel과 무관하게 **로컬에서 보고서 품질을 올리는** 작업 가이드입니다.

## 이번 업그레이드 요약

| 항목 | 내용 |
|------|------|
| Gemini-first | `GEMINI_API_KEY` 있으면 기본 `gemini-2.5-flash` |
| temperature | 생성 호출에 실제 전달 (JSON 0.3, 섹션 0.35) |
| 문서 컨텍스트 | 3,000 → **8,000자**/문서 |
| 공유 팩트 | ARR/임상단계 등 섹션 간 일관성 |
| 이전 섹션 요약 | 연속 생성 시 컨텍스트 전달 |
| 품질 점수 | 길이·인용·환각 신호 자동 채점 |
| BIO PoS | 시스템 프롬프트 ↔ rNPV 테이블 일치 |
| IT Agent | 제품/시장/재무/밸류/리스크 5섹션 특화 |
| Vault / Neuron / Maker / Story | 동일 5섹션 특화 |
| Climate / Consumer | 5섹션 특화 + 섹터 우선 라우팅 |
| 공유 팩트 확장 | GMV/AOV/ROAS/감축량/EBITDA 등 |
| 섹터 감지 | CONSUMER·CLIMATE 키워드 분리 (콘텐츠와 구분) |
| General Agent | 전용 시스템 프롬프트 |
| 섹션 재생성 | 보고서 편집기에서 섹션별 AI 재생성 → 품질 점수 자동 새로고침 |
| 골든 IR 1클릭 | 딜 상세 → 문서 탭 → 「골든 IR 로드」 |
| 골든 비교 | `npm run test:golden` (Gemini) |

## 로컬 실행

```bash
# .env.local
GEMINI_API_KEY=AIza...
AI_MODEL=gemini-2.5-flash

npm run db:setup:local
npm run test:quality    # API 키 불필요
npm run test:fixtures   # 골든 IR 추출 검증
npm run test:golden     # Gemini로 1섹션 생성+품질 점수
npm run test:ai         # Gemini 스모크
npm run dev:local
```

데모 로그인: `demo@vcwoong.kr` / `Demo1234!`

## 품질 연습 루프 (추천)

1. 딜 생성(섹터 선택) → 문서 탭 **골든 IR 로드**
2. AI 보고서 생성
3. 보고서 상세 → **자동 품질 점수** 확인
4. 약한 섹션만 **재생성** → 품질 점수 자동 갱신
5. `/api/reports/{id}/quality` JSON으로 섹션별 이슈 확인
6. 프롬프트 수정 (`src/prompts/`, `src/agents/*-agent.ts`) → 재비교

### 채점 기준 (자동)

- 본문 길이 (너무 짧으면 감점)
- 소제목·표 유무
- 출처/인용 (IR, PubMed, NCT…)
- "확인 필요" 과다
- 과도한 확신 표현 (환각 위험)

## 손대면 효과 큰 파일

- `src/prompts/system-prompts.ts`
- `src/prompts/section-prompts.ts`
- `src/agents/bio-agent.ts` / `it-agent.ts` / `fintech-agent.ts` / `deeptech-agent.ts`
- `src/agents/manufacturing-agent.ts` / `content-agent.ts`
- `src/agents/climate-agent.ts` / `consumer-agent.ts`
- `src/lib/shared-facts.ts`
- `src/lib/report-quality.ts`
- `src/lib/fixtures.ts` · `docs/fixtures/*`

## API

- `GET /api/reports/[id]/quality` — 로그인 필요, 품질 요약 JSON
- `POST /api/reports/[id]/sections/regenerate` — `{ sectionKey }` 단일 섹션 재생성
- `POST /api/deals/[id]/load-fixture` — 골든 IR 문서로 적재 (`fixtureId` 선택)
- `GET /api/deals/[id]/load-fixture` — 사용 가능 픽스처 목록

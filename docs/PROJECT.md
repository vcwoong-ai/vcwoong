# Vcwoong 프로젝트 통합 현황

## 브랜드

| 항목 | 값 |
|------|-----|
| **제품명** | Vcwoong (VC우ng) |
| **코드 상수** | `src/lib/brand.ts` |
| **데모 계정** | `demo@vcwoong.kr` / `Demo1234!` |

> Claude Code의 **DealSync**는 별개 프로젝트입니다. 이 레포·배포와 혼동하지 마세요.

## 주소

- **GitHub:** https://github.com/vcwoong-ai/vcwoong
- **Vercel:** https://dealsync-jade.vercel.app
- **에이전트 가이드:** `docs/phases/`

## 현재 작업 브랜치 (2026-07-01 기준)

| PR | 브랜치 | 상태 | 비고 |
|----|--------|------|------|
| **[#8](https://github.com/vcwoong-ai/vcwoong/pull/8)** | `cursor/feature-improvements-6974` | **메인 (통합 PR)** | Cursor Agent 작업 기준 |
| [#10](https://github.com/vcwoong-ai/vcwoong/pull/10) | `claude/merged-main` | 중복 | Claude Code 병합 시도 — #8에 흡수 |
| [#9](https://github.com/vcwoong-ai/vcwoong/pull/9) | `claude/api-integration-options-6hrwyn` | 중복 | 닫기 권장 |
| [#7](https://github.com/vcwoong-ai/vcwoong/pull/7) | `claude/bold-ramanujan-08y3ri` | 중복 | 닫기 권장 |

**통합 기준:** PR #8 (`cursor/feature-improvements-6974`)

## 병렬 작업 시 충돌 방지

Claude Code(로컬)와 Cursor Agent(클라우드)를 **동시에 GitHub에서 작업해도 파일이 서로 "튕기지" 않습니다.** 각 환경은 독립된 작업 공간이고, GitHub가 유일한 공유 지점입니다.

### 안전한 방법

```
Claude Code  →  claude/내-작업-브랜치  →  PR 생성
Cursor Agent →  cursor/내-작업-브랜치  →  PR 생성
                              ↓
                         main에 머지
```

### 주의

- **동시에 같은 파일을 수정하면** PR 머지 시 충돌 발생 (정상적인 Git 동작)
- **브랜치를 분리하면** 충돌 없이 병렬 작업 가능
- Cursor Agent는 `cursor/*` 브랜치만 사용

## MVP 기능 (main 기준)

- 6개 섹터 AI 에이전트 + General Agent
- Dr. Cell: PubMed, ClinicalTrials, FDA, rNPV 부록
- 양식 재현, Kanban, 보고서 마법사
- LP 리포팅, 사용량 쿼터, Toss 구독 연동
- Vercel 배포 설정 (`vercel-build`)

## 데모 계정

- Email: `demo@vcwoong.kr`
- Password: `Demo1234!`

# DealSync 프로젝트 통합 현황

## 주소

- **GitHub:** https://github.com/vcwoong-ai/vcwoong
- **Vercel:** https://dealsync-vcwoong.vercel.app
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

- **다른 브랜치**에서 작업하면 동시에 진행해도 괜찮습니다.
- 머지할 때만 충돌이 생길 수 있으며, 그때 해결하면 됩니다.

### 주의할 점

| 상황 | 위험도 | 설명 |
|------|--------|------|
| 같은 브랜치에 동시 push | ⚠️ 높음 | 나중에 push하는 쪽이 거부되거나 덮어씀 |
| `main`에 직접 push | ⚠️ 높음 | PR 없이 머지하면 추적 어려움 |
| OneDrive 동기화 폴더에서 로컬 편집 | ⚠️ 중간 | 클라우드 VM과는 무관하지만, 로컬에서 OneDrive가 파일을 동기화하며 충돌 가능 |
| 서로 다른 브랜치 + PR | ✅ 안전 | 권장 방식 |

### 권장 워크플로

1. **Cursor Agent 작업** → 이 창에서만 요청 (브랜치: `cursor/*`)
2. **Claude Code 작업** → 별도 브랜치 (`claude/*`)에서 진행
3. 완료되면 PR로 머지 — **#8이 메인 통합 PR**
4. `main`에 머지하기 전에 `git pull origin main`으로 최신 상태 유지

## 기술 스택

Next.js 14, Prisma, SQLite(로컬) / PostgreSQL(프로덕션), NextAuth, OpenRouter + Gemini, shadcn/ui

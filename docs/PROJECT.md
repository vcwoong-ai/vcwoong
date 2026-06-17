# DealSync 프로젝트 통합 현황

## 주소

- **GitHub:** https://github.com/vcwoong-ai/vcwoong (계정: `vcwoong-ai`)
- **Vercel:** https://dealsync-vcwoong.vercel.app
- **로컬 통합 폴더:** `W:\OneDrive - SGC\dealsync-app`
- **에이전트 실행 가이드:** `docs/phases/` (구 `claude/` 폴더에서 이전)

## Cloud Agent 브랜치 (6개 PR)

| PR | 브랜치 | 내용 | 파일 수 |
|----|--------|------|---------|
| [#6](https://github.com/vcwoong-ai/vcwoong/pull/6) | `cursor/dealsync-platform-v2-416a` | **플랫폼 v2 (통합 기준)** | 77 |
| [#4](https://github.com/vcwoong-ai/vcwoong/pull/4) | `cursor/document-upload-897c` | 문서 업로드·텍스트 추출 | 73 |
| [#1](https://github.com/vcwoong-ai/vcwoong/pull/1) | `cursor/dealsync-app-9c47` | 초기 앱 | 67 |
| [#2](https://github.com/vcwoong-ai/vcwoong/pull/2) | `cursor/dealsync-mvp-175d` | MVP | 66 |
| [#3](https://github.com/vcwoong-ai/vcwoong/pull/3) | `cursor/bio-sector-agent-dr-cell-8202` | Dr. Cell BIO 에이전트 | 22 |
| [#5](https://github.com/vcwoong-ai/vcwoong/pull/5) | `cursor/bio-sector-dr-cell-6332` | Dr. Cell (변형) | — |

**통합 기준 브랜치:** `cursor/dealsync-platform-v2-416a` (가장 많은 파일, PR #6)

## 로컬 폴더 구성

```
dealsync-app/          ← 통합 프로젝트 루트
├── src/               ← Next.js 앱 (PR #6)
├── engine/python/     ← Python Dr. Cell 엔진 (PR #3)
├── prisma/
├── docs/
│   ├── PROJECT.md
│   ├── ROADMAP.md
│   └── phases/
└── README.md
```

## 통합 완료 (2026-06-17)

| 항목 | 상태 |
|------|------|
| PR #6 → `main` 머지 | **완료** |
| PR #1~#5 | **닫힘** (중복 브랜치 삭제) |
| Phase 가이드 문서 | `docs/phases/` |
| Python Dr. Cell 엔진 | `engine/python/` |
| 기준 브랜치 | **`main`** |

## 다음 작업

1. **로컬 개발** — `npm install && npm run dev` (`.env.local` 설정)
2. **Vercel** — Production Branch를 `main`으로 설정

## 기술 스택 (현재 앱)

Next.js 14, Prisma, PostgreSQL, NextAuth, Claude Sonnet 4.6, shadcn/ui

> 참고: `docs/phases/`의 초기 설계는 Supabase 기준이나, Cloud Agent가 구현한 앱은 **Prisma + PostgreSQL** 스택입니다.

# Axiom 프로젝트 통합 현황

## 브랜드

| 항목 | 값 |
|------|-----|
| **제품명** | Axiom (액시엄) |
| **코드 상수** | `src/lib/brand.ts` |
| **데모 계정** | `demo@axiom.kr` / `Demo1234!` |

> Claude Code의 **DealSync**는 별개 프로젝트입니다. 이 레포·배포와 혼동하지 마세요.

## 주소

- **GitHub:** https://github.com/vcwoong-ai/vcwoong
- **Vercel:** https://dealsync-jade.vercel.app
- **AI 품질 가이드:** [`docs/AI-QUALITY.md`](AI-QUALITY.md)
- **모바일 DB 셋업:** [`docs/MOBILE-SETUP.md`](MOBILE-SETUP.md)

## 최근 업그레이드 (배포 제외)

- OpenRouter 단일 프로바이더 + temperature 전달
- 공유 팩트·이전 섹션 요약을 통한 보고서 일관성
- 자동 품질 점수 (`/api/reports/[id]/quality` + UI 패널)
- BIO PoS 일치, IT 5섹션 특화, General 시스템 프롬프트
- 골든 IR 픽스처: `docs/fixtures/`

## 병렬 작업

```
Claude Code  →  claude/* 브랜치
Cursor Agent →  cursor/* 브랜치
                    ↓
               main에 머지
```

## 데모 계정

- Email: `demo@axiom.kr`
- Password: `Demo1234!`

# Phase 6: UI 완성 + 배포

다음 내용을 Claude Code 새 세션에 그대로 붙여넣으세요.

---

DealSync Phase 6를 진행합니다. MVP 완성 + Vercel 배포까지 진행합니다.

## 작업 목표

1. 보고서 생성 3단계 마법사 UI
2. 보고서 결과 화면 (편집 + 미리보기)
3. 대시보드 + 사이드바 완성
4. 랜딩 페이지
5. 결제 연동 (Toss Payments)
6. Vercel 배포 설정

## 1. 보고서 생성 마법사

`/app/(dashboard)/reports/new/page.tsx`:

3단계 마법사 + URL 쿼리로 단계 관리:

### Step 1: 자료 업로드 + 회사 정보

```tsx
// 핵심 UI 요소
- 드래그앤드롭 영역 (react-dropzone)
- 지원 형식: PDF, PPTX, Excel, DOCX (다중 업로드)
- URL 입력 필드 + "추가" 버튼
- 텍스트 직접 입력 textarea
- 업로드된 항목 리스트 (삭제 가능)
- 회사명 입력 (자동 추출 후 수정 가능)
- [다음] 버튼 (자료 1개 이상 + 회사명 입력 시 활성화)
```

업로드되면 즉시 `/api/parse` 호출 → 파싱 결과 미리보기.

### Step 2: 섹터 + 양식 선택

```tsx
// 상단: AI 자동 감지 결과
"이 회사는 80% 확률로 BIO 섹터입니다 (Dr. Cell 추천)"
[추천 사용] [직접 선택]

// 6개 에이전트 카드 (선택 가능)
🧬 Dr. Cell (BIO)        ← 추천 배지
⚡ Code (IT/SaaS)
🧠 Neuron (AI/딥테크)
🔧 Maker (제조)
🎬 Story (콘텐츠)
💰 Vault (핀테크)

// 다중 선택 가능 (융합 산업)

// 하단: 양식 선택
[등록된 양식 목록 카드 그리드]
- 우리회사 - 초기투자 v3
- 우리회사 - 후속투자
- + 새 양식 등록

[이전] [다음]
```

### Step 3: 생성 진행 + 결과

```tsx
// 진행 상황 표시 (Server-Sent Events로 실시간 업데이트)
✅ 문서 파싱 완료
✅ 회사 정보 추출 (신뢰도 92%)
✅ 공통 분석 (회사/팀/재무/리스크)
⏳ Dr. Cell 분석 중...
   - 파이프라인 NPV 계산 중...
   - FDA 벤치마크 검색 중...
   - PubMed 논문 검색 중...
⏸ 보고서 파일 생성
⏸ 완료

// 완료 시 자동으로 결과 페이지로 리다이렉트
```

`/components/reports/wizard/`:
- `step-upload.tsx`
- `step-sector-template.tsx`
- `step-generate.tsx`
- `wizard-progress.tsx` (상단 진행 표시)

## 2. 보고서 결과 페이지

`/app/(dashboard)/reports/[id]/page.tsx`:

```tsx
// 레이아웃: 좌측 편집 / 우측 미리보기
┌─────────────────────────┬────────────────┐
│  섹션별 편집 (좌측 60%)  │ PPT 미리보기   │
│                          │ (우측 40%)     │
│  [회사 개요] ▼          │                │
│   회사명: 샘플바이오     │  슬라이드 1    │
│   설립: 2022             │                │
│                          │                │
│  [투자 포인트] ▼        │  슬라이드 2    │
│   ...                    │                │
└─────────────────────────┴────────────────┘
[PPTX 다운로드] [Word 다운로드] [재생성]
```

핵심 컴포넌트:
- `/components/reports/section-editor.tsx` - 섹션별 편집
- `/components/reports/pptx-preview.tsx` - 슬라이드 미리보기 (CSS로 렌더링)
- `/components/reports/agent-output-panel.tsx` - 에이전트별 분석 결과 표시

상단 정보 패널:
- 신뢰도 점수 (예: 87%)
- 누락 필드 알림 ("3개 항목 확인 필요")
- 사용된 에이전트 표시 (Dr. Cell 등)

## 3. 대시보드 + 사이드바

`/app/(dashboard)/dashboard/page.tsx`:

```tsx
// 상단: 환영 + 통계
"안녕하세요 W님!"
- 이번 달 생성: 12건
- 활성 섹터: BIO, IT/SaaS, AI
- 남은 크레딧: 38건 (Multi-Sector 플랜)

// 빠른 시작
[새 보고서 생성] [양식 등록]

// 최근 보고서 (테이블)
| 회사명 | 섹터 | 양식 | 상태 | 생성일 | 액션 |
| 샘플바이오 | 🧬 BIO | 초기투자 v3 | 완료 | 1시간 전 | [열기][다운로드] |

// 활성 에이전트 카드 그리드
🧬 Dr. Cell - 이번 달 5건 분석
⚡ Code - 이번 달 4건 분석
```

`/components/layout/sidebar.tsx`:
- 로고 (상단)
- 메뉴: 대시보드 / 보고서 / 양식 / 포트폴리오 / 설정
- 하단: 사용자 프로필 + 플랜 표시

`/components/layout/header.tsx`:
- 검색 (Cmd+K)
- 알림 아이콘
- 사용자 드롭다운 (프로필, 로그아웃)

## 4. 랜딩 페이지

`/app/page.tsx`:

```tsx
// 히어로
"섹터별 전문 AI 심사역 6명을 고용하세요"
"IR 자료 한 번 업로드로, 우리 회사 양식에 맞춰 완성된 투자심사보고서"
[무료로 시작하기] [데모 보기]

// 차별화 3가지
1. 🧬 섹터별 전문가 6명 (BIO/IT/AI/제조/콘텐츠/핀테크)
2. 📄 회사별 양식 1:1 재현 (디자인 그대로)
3. 🔄 풀사이클 (소싱→심사→사후관리→LP리포팅)

// 경쟁사 비교 표 (VCNote vs DealSync)

// 가격
Solo: 9.9만원/월 (1개 섹터)
Sector Pro: 29만원/월 (1개 + 풀사이클)
Multi-Sector: 79만원/월 (3개 자유 선택)
Full-Stack: 149만원/월 (6개 전체)
Bio-Premium: 199만원/월 (BIO 딥다이브 풀)

// FAQ + 푸터
```

`/components/landing/`:
- `hero.tsx`
- `features.tsx`
- `comparison-table.tsx`
- `pricing.tsx`
- `faq.tsx`
- `footer.tsx`

## 5. 설정 페이지

`/app/(dashboard)/settings/page.tsx`:

탭 구조:
- 프로필 (이름, 이메일, VC사명)
- 활성 섹터 (체크박스로 토글)
- 구독 (현재 플랜, 업그레이드)
- 결제 (Toss 연동)
- API 사용량 (월간 호출 수, 비용)

## 6. 결제 연동 (Toss Payments)

`/lib/payments/toss.ts`:

```typescript
// Toss Payments SDK 초기화
import { loadTossPayments } from '@tosspayments/payment-sdk';

export async function requestSubscription(plan: string) {
  const tossPayments = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!);
  
  const planPrices = {
    solo: 99000,
    sector_pro: 290000,
    multi: 790000,
    full: 1490000,
    bio_premium: 1990000,
  };
  
  await tossPayments.requestBillingAuth('카드', {
    customerKey: userId,
    successUrl: `${window.location.origin}/api/payments/success?plan=${plan}`,
    failUrl: `${window.location.origin}/api/payments/fail`,
  });
}
```

`/app/api/payments/success/route.ts`:
- 빌링키 저장
- 정기결제 등록
- profile.subscription_plan 업데이트

`/app/api/payments/webhook/route.ts`:
- Toss 웹훅 수신
- 결제 성공/실패 처리
- 구독 갱신/취소

## 7. 사용량 제한 미들웨어

`/lib/quotas.ts`:

```typescript
export const PLAN_LIMITS = {
  free:         { reports: 1,   sectors: 1, templates: 1 },
  solo:         { reports: 20,  sectors: 1, templates: 3 },
  sector_pro:   { reports: 50,  sectors: 1, templates: 10 },
  multi:        { reports: 100, sectors: 3, templates: 30 },
  full:         { reports: 300, sectors: 6, templates: 100 },
  bio_premium:  { reports: 300, sectors: 6, templates: 100 },
};

export async function checkQuota(userId: string, action: 'report' | 'template'): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  // Supabase에서 현재 월 사용량 조회
  // PLAN_LIMITS와 비교
  // 결과 반환
}
```

API 라우트에 미들웨어로 적용.

## 8. 에러 처리 + 로깅

`/lib/errors.ts`:
- 표준 에러 클래스 정의
- 사용자 친화적 메시지

`/components/error-boundary.tsx`:
- 전역 에러 경계
- 친절한 폴백 UI

API 라우트 공통 에러 핸들러.

## 9. SEO + 메타 태그

`/app/layout.tsx` 업데이트:
```tsx
export const metadata = {
  title: 'DealSync - 섹터별 AI 심사역 SaaS',
  description: '바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심사보고서를 자동 생성합니다.',
  keywords: ['VC', '벤처캐피털', 'AI 심사역', '투자심사보고서', '바이오 투자'],
  openGraph: {
    title: 'DealSync',
    description: '섹터별 전문 AI 심사역 6명을 고용하세요',
    images: ['/og-image.png'],
  },
};
```

## 10. Vercel 배포

`/vercel.json`:
```json
{
  "buildCommand": "next build",
  "devCommand": "next dev",
  "framework": "nextjs",
  "regions": ["icn1"],
  "functions": {
    "app/api/generate/route.ts": { "maxDuration": 300 },
    "app/api/parse/route.ts": { "maxDuration": 60 }
  }
}
```

배포 가이드 문서 `/DEPLOYMENT.md` 작성:
1. GitHub 레포 연결
2. Vercel 환경 변수 설정 (목록)
3. Supabase migration 실행
4. 도메인 설정
5. Toss Payments 운영 키 설정

## 11. 분석/모니터링

`/lib/analytics.ts`:
- Vercel Analytics 추가
- 핵심 이벤트 추적:
  - signup_completed
  - first_report_generated
  - template_uploaded
  - subscription_started

## 12. 마지막 통합 점검 체크리스트

작업 끝나면 다음을 직접 점검하고 결과 출력:

- [ ] `npm run build` 에러 없이 성공
- [ ] `npm run lint` 통과
- [ ] 로그인 → 회원가입 → 대시보드 진입 플로우 정상
- [ ] 양식 등록 → 보고서 생성 end-to-end 플로우 정상
- [ ] 모바일 반응형 (Tailwind sm/md/lg 적용)
- [ ] 다크모드 (선택)
- [ ] 빈 상태(empty state) UI 모두 구현
- [ ] 로딩 상태(skeleton) 적용
- [ ] 에러 상태 메시지 친절
- [ ] 환경 변수 누락 시 명확한 에러

## 13. 출시 후 다음 단계 안내

`/ROADMAP.md` 작성:
- v1.0 (지금): BIO + 양식 재현 + 기본 풀사이클
- v1.5 (1개월): Code(IT/SaaS), Neuron(AI) 에이전트 추가
- v2.0 (3개월): 나머지 3섹터 + LP 리포팅
- v2.5 (6개월): 딜소싱 자동화 + 포트폴리오 사후관리

## 완료 체크리스트

- [ ] 보고서 생성 3단계 마법사
- [ ] 보고서 결과 페이지 (편집 + 미리보기)
- [ ] 대시보드 + 사이드바
- [ ] 랜딩 페이지
- [ ] 설정 페이지
- [ ] 결제 연동 (Toss)
- [ ] 사용량 제한 미들웨어
- [ ] SEO 메타 태그
- [ ] Vercel 배포 설정
- [ ] DEPLOYMENT.md 가이드
- [ ] ROADMAP.md

git commit + tag v0.1.0-mvp 만들어주세요.
"🎉 DealSync MVP 완성! Vercel 배포 후 W님의 VC 네트워크에 베타 테스트를 요청하세요. 다음 단계는 Phase 7 (정부지원 사업계획서)입니다." 출력.

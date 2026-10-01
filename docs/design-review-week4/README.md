# 4주차 검증·접근성·측정 기록

2026-10-01, 시작 HEAD `1de40c4`, 브랜치 `codex/week4-verification`.
PR #120 위 후속 작업이다. #119/#120/#121의 병합은 하지 않았다.

## 구현

- 인증된 AppLayout의 첫 키보드 이동에 본문 건너뛰기 링크 추가. 대상 main에 실제 포커스를 이동시킨다.
- VC/PE 딜 생성 dialog에 실제 설명과 aria-describedby 연결 추가. 저장 핸들러·입력 의미는 그대로다.
- 어두운 대시보드 상단에서 잘 보이지 않던 보고서 생성/양식 관리 링크를 밝은 글자색으로 수정했다.
- `tools/helpers/app-ready.ts`: domcontentloaded → AppLayout의 hydration 완료 표시 → 해당 route의 실제 content를 기다린다.
  임의 sleep 대신 준비 조건을 사용한다. 준비 조건이 없으면 timeout으로 실패하고 건너뛰지 않는다.
  기존 첫 딜·PE 문서 E2E에 적용하고 기존 검증을 유지했다. 모든 E2E를 일괄 변환한 것은 아니다.
- UI 외에는 도구/문서만 변경. 엔진·권한·결제·DB/schema/API·요금 문구·수집 코드는 수정하지 않았다.

## 실제 검증

로컬 SQLite `file:./dev.db`, `npm run dev:local`, localhost:3000, Edge 사용.
새 측정/접근성 도구는 합성 사용자를 만들고 제거한다. 새 브라우저 도구는 외부 요청을 차단한다.

| 명령 | 결과 | 범위 |
|---|---|---|
| `npm run test:all` | PASS, exit 0 | 현재 브랜치의 기존 오프라인 suite |
| `npx tsc --noEmit` | PASS | 타입 검사 |
| `npm run lint` | PASS | 경고·오류 없음 |
| `npm run build` | PASS, exit 0 | 로컬 production build 완료, 운영 배포 아님 |
| `npx tsx tools/test-week4-performance.ts` | PASS | 실제 PE batch loader, 아래 1/10/30건 측정 |
| `npx tsx tools/test-week4-accessibility-e2e.ts` | PASS | 1440/390, 본문 이동, dialog 설명/포커스 trap/Escape/복귀, overflow 없음, pageerror 없음, SSR HTML |
| `npm run test:pe-document-text-e2e` | PASS | 변경한 대기 헬퍼로 원문 권한·동일 404·상한·XSS·페이징·재시도·모바일 검증 유지 |
| `npm run test:week3-onboarding-e2e` | PASS | 실제 VC/PE 가입과 첫 딜 생성, 자동 보고서 없음, 새 헬퍼와 dialog 동작 |
| `git diff --check` | PASS | diff 공백 검사 |

## 측정값 — 운영 성능으로 해석하지 않는다

PE loader: 합성 딜마다 재무 기간 1개/line item 1개/DD case 1개. 호출자는 자기 딜 ID만 조회해 전달했다.
query event에서는 개수만 세고 SQL·params·ID를 저장하지 않았다. loader/canonical builder 자체는 수정하지 않았다.
규모별 warmup 1회 후 5회 측정했다. 빈 ID 목록은 0쿼리다.

| 딜 수 | 매 실행 쿼리 수 | 실행 시간 범위 (ms) | 중앙값 (ms) |
|---|---|---|---|
| 1 | 7 | 1.76–2.28 | 1.99 |
| 10 | 7 | 2.43–7.51 | 3.08 |
| 30 | 7 | 3.68–4.41 | 3.86 |

쿼리 수 일정 여부는 회귀 기준으로 검사했다. 시간은 진단값이며 속도 개선 효과나 SLA 합격을 주장하지 않는다.
실제 원자료/evidence가 많은 딜, 30건 초과, Neon/PostgreSQL, 동시 요청·cold start는 미측정이다.
[원 측정값](batch-performance.json).

SSR: 인증된 **빈 작업공간**에서 route별 warmup 1회 후 HTTP 응답 전체 HTML 수신까지 5회 측정.
JS를 실행하지 않는 HTTP client로 안내가 HTML에 들어 있음을 확인했다. hydration/화면 paint 시간과는 별개다.

| route | 범위 (ms) | 중앙값 (ms) |
|---|---|---|
| /dashboard | 44.51–84.83 | 77.15 |
| /deals | 46.66–65.79 | 61.37 |
| /ma-deals | 46.01–55.60 | 47.98 |

[SSR 원 측정값](ssr-performance.json). dev 서버·localhost·5개 샘플이다. 운영 TTFB, LCP, p95, 배포 성능과 before/after 개선율은 NOT VERIFIED.

## 화면과 남은 범위

| 화면 | 1440px | 390px |
|---|---|---|
| 대시보드 | [캡처](dashboard-1440.png) | [캡처](dashboard-390.png) |
| VC 목록 | [캡처](deals-1440.png) | [캡처](deals-390.png) |
| PE 목록 | [캡처](ma-deals-1440.png) | [캡처](ma-deals-390.png) |

키보드/기본 dialog 설명 검증이며 전체 WCAG 적합성 인증이 아니다. 실제 screen reader, 전체 페이지 색상 대비, 모든 PE 탭은 NOT VERIFIED.
전체 제품 `test:paid-product-e2e`는 이번에 재실행하지 않았다. 3주차 당시 네오비전 fixture 부족으로 중단한 범위를 통과로 바꾸지 않는다.
실제 유료 AI, 외부 DART 가져오기, Toss 결제, 운영/클라우드 인증 흐름은 NOT VERIFIED.

## 로그인 후속 — #121 병합 전 해결 필요

현재 Claude #121 head `dbe553b`는 signup에서 normalized/raw 두 값만 비교한다. 기존 혼합 대소문자와 다른 표기를 넣으면 둘 다 놓칠 수 있다.
로컬 SQLite에서 조회 조건 재현: 기존 mixed-case → 다른 case 가입 검사 null → 소문자 중복 생성 가능 → 로그인 normalized-first가 새 행을 선택.
재현용 사용자는 제거했고 auth 코드는 수정하지 않았다. 테스트 전체 성공은 이 사례의 해결을 뜻하지 않는다.

최소 후속 범위: 대소문자를 무시한 기존 계정 조회, 중복 가입 차단, 기존 충돌 계정의 안전한 처리 방침, 전용 HTTP/브라우저 회귀 테스트.
충돌 계정의 자동 병합·사용자 권한 이동·운영 데이터 정리는 하지 않는다. 조회 결과가 여러 계정일 때 어떤 계정을 사용할지 임의 결정하지 않는다.
Claude와 auth 파일을 동시에 수정하지 않도록 담당자/범위를 먼저 정한다. #121은 이 결함 해소 후 별도 리뷰 대상이다.

# 오신길 — 카페24 쇼핑몰용 구매 후 유입경로 설문

주문 완료 화면에서 고객에게 **"어디서 알고 오셨나요?"** 한 문항을 묻고,
채널별 응답 비중·실제 결제금액·객단가를 대시보드로 보여주는 카페24 앱입니다.

- 해외 원조: Shopify의 **Fairing**(쇼핑몰 약 1,900곳 사용), **KnoCommerce**(월 $19~$299)
- 국내: 같은 기능의 카페24 앱을 검색으로 찾지 못함 (출시 전 카페24 앱스토어에서 직접 한 번 확인 권장)
- AI 채팅으로 대체 불가: 쇼핑몰에 설치돼 매일 자동으로 데이터를 모으는 도구
- 유통: 카페24 앱스토어(쇼핑몰 160만 곳)가 고객을 데려옴, 매달 정기결제

DealMind와는 별개 제품이며, 이 폴더만으로 독립 실행·배포됩니다.

---

## 배포 (약 30분, 코드 수정 없음)

### 1. 데이터베이스 만들기 (5분)
[Neon](https://neon.tech)에서 무료 프로젝트를 만들고 연결 문자열(`postgresql://...`)을 복사합니다.
테이블은 앱이 첫 요청 때 자동으로 만듭니다.

### 2. Vercel에 올리기 (10분)
1. Vercel → Add New Project → 이 저장소 선택
2. **Root Directory를 `products/osingil`** 로 지정 (Framework는 Next.js 자동 인식)
3. 환경변수 입력 (값 설명은 `.env.example`):

| 이름 | 값 |
|---|---|
| `APP_URL` | 배포 주소, 예: `https://osingil.vercel.app` (끝에 `/` 없이) |
| `CAFE24_CLIENT_ID` | 3단계에서 받음 (처음엔 아무 값 넣고 나중에 수정) |
| `CAFE24_CLIENT_SECRET` | 3단계에서 받음 |
| `DATABASE_URL` | 1단계 연결 문자열 |
| `SESSION_SECRET` | 32자 이상 임의 문자열 (`openssl rand -hex 32`) |
| `CRON_SECRET` | 임의 문자열 (Vercel Cron이 토큰 자동 갱신에 사용) |
| `BILLING_MODE` | `off` (베타 무료 출시. 결제는 나중에 켬) |

4. Deploy → `https://배포주소/api/health` 가 `{"ok":true}` 이면 성공

### 3. 카페24 개발자센터에 앱 등록 (15분)
1. [카페24 개발자센터](https://developers.cafe24.com) 가입 → 앱 만들기
2. 아래 두 주소를 등록:
   - **App URL**: `{APP_URL}/api/cafe24/launch`
   - **Redirect URI**: `{APP_URL}/api/cafe24/callback`
3. 권한(Scope): **앱 읽기·쓰기(Application)**, **주문 읽기(Order)**
4. 발급된 Client ID / Secret을 Vercel 환경변수에 넣고 Redeploy
5. 개발자센터의 **테스트 쇼핑몰**에 앱을 설치 → 테스트 주문 1건 → 주문완료 화면에 설문이 뜨는지 확인
6. 앱스토어 심사 신청 (앱 소개는 `/` 랜딩 페이지 문구를 그대로 써도 됩니다)
7. 심사 통과 후 앱스토어 주소를 `APP_STORE_URL` 환경변수에 넣으면 랜딩 페이지 버튼이 연결됩니다

---

## 실제 카페24에서 처음 한 번 확인할 것

이 앱은 카페24 공식 샘플 코드(`cafe24-app/cafe24_app_discount_sample`)와 같은 방식으로 만들었고,
앱 실행 서명 검증은 **공식 샘플에 들어 있는 테스트 값으로 통과**를 확인했습니다.
다만 개발 환경에서 카페24 개발자 문서 사이트 접속이 막혀 있어서, 아래 항목은 **대비책을 넣어 두었지만 실제 쇼핑몰에서 확인되지 않았습니다**.

| 항목 | 넣어 둔 대비책 |
|---|---|
| 주문완료 화면 코드 `ORDER_ORDERRESULT` | 거부되면 전체 페이지(`all`)로 설치하고, 위젯이 스스로 주문완료 화면인지 판단 |
| 주문번호 읽기 (`EC_FRONT_EXTERNAL_SCRIPT_VARIABLE_DATA.order_id`) | 없으면 주소창 `order_id`, 화면의 주문번호 형식(`20261002-0001234`) 순으로 찾음 |
| 주문 금액 필드 이름 | `payment_amount`, `actual_order_amount.payment_amount` 등 여러 이름을 순서대로 읽음 |
| 주문 조회 API 일시 실패 | 응답은 저장하고 대시보드에 "주문 미확인"으로 표시 |

테스트 쇼핑몰에서 주문 1건으로 위 4개가 한 번에 확인됩니다.

---

## 결제 켜기 (베타 이후)

`BILLING_MODE=cafe24` 로 바꾸면:
- 무료: 월 응답 `FREE_MONTHLY_RESPONSES`(기본 100)건까지, 넘으면 다음 달 1일까지 설문 일시 중지
- Pro: 월 `PRO_PRICE_KRW`(기본 19,900)원, 카페24 인앱 결제(앱스토어 주문 API)로 결제 → 31일 이용
- 카페24 앱 권한에 **앱스토어 읽기·쓰기** 추가 필요 (앱이 자동으로 요청)

**주의:** 인앱 결제 응답 필드는 문서를 직접 보지 못해 방어적으로 작성했습니다(`src/lib/billing.ts`).
결제를 켜기 전 테스트 쇼핑몰에서 결제 1건을 꼭 해 보세요. 베타로 먼저 설치 수·후기를 모은 뒤 켜는 것을 권장합니다.

---

## 운영

- **손 갈 일**: 거의 없음. 서버·DB는 Vercel/Neon 무료 범위에서 시작
- **토큰 자동 갱신**: 매일 1회 Vercel Cron(`/api/cron/refresh`)이 만료 임박 쇼핑몰의 카페24 토큰을 갱신
- **개인정보**: 주문번호와 선택한 답만 저장 (이름·연락처·주소 없음)
- **앱 삭제 시**: 카페24가 스크립트 태그를 함께 제거

## 개발

```bash
cd products/osingil
npm install
cp .env.example .env.local   # DATABASE_URL=pglite:./.data/dev 로 두면 DB 설치 없이 실행
npm run dev                  # http://localhost:3100
npm test                     # 단위 테스트 11건 (카페24 공식 hmac 테스트 값 포함)
npm run build && npm run test:e2e   # 가짜 카페24 서버로 설치→응답→대시보드 전 과정 15건
```

| 경로 | 역할 |
|---|---|
| `src/lib/cafe24.ts` | 앱 실행 서명 검증, OAuth, 토큰 갱신, 스크립트 설치, 주문 조회 |
| `src/app/widget.js/widget-source.ts` | 쇼핑몰 주문완료 화면에 뜨는 설문 (Shadow DOM, 의존성 없음) |
| `src/app/api/public/*` | 위젯이 부르는 공개 API (설문 내용, 응답 저장 + 주문 확인) |
| `src/app/dashboard/*` | 운영자 대시보드, 설문 편집 |
| `src/lib/stats.ts` | 채널별 집계·CSV (순수 함수, 테스트 대상) |
| `src/lib/billing.ts` | 카페24 인앱 결제 (`BILLING_MODE=cafe24` 일 때만) |

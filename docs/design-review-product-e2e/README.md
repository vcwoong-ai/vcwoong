# 전체 제품 E2E 검토 화면

2026-10-01, `codex/product-e2e-fixtures`, 기준 #123/`3ad2c3b`.
로컬 SQLite/localhost의 실제 앱 화면. 모든 회사/수치는 합성 테스트 자료다.
앱 디자인 변경 Before/After가 아니라 현재 VC/PE 표시와 테스트 근거를 남기는 기록이다.

| 화면 | 1440px | 390px |
|---|---|---|
| VC 결정/근거 | [desktop](vc-decision-1440.png) | [mobile](vc-decision-390.png) |
| PE 개요/차단 요인 | [desktop](pe-overview-1440.png) | [mobile](pe-overview-390.png) |

VC는 95억/110억 출처 상충과 미확인 근거를, PE는 1,200억/1,180억 상충 및
QoE/LBO 차단·미확인 자료를 표시한다. 자료 존재/검토를 투자 승인으로 표시하지 않는다.
이 스크린샷은 근거 원본 PDF 다운로드나 실제 DART 검증을 뜻하지 않는다.

`npm run test:paid-product-e2e`: exit 0, 134개 assertion PASS. 실제 가입·빈 상태·권한 404·근거 패널 포함.
390/430/768/1024/1440px × 11개 화면의 페이지 가로 넘침 확인. 전체 접근성 인증은 아니다.
[실행 요약](result.json), [fixture 범위·미검증 사항](../PRODUCT-E2E-FIXTURES.md).

실행이 끝나면 테스트 소유자와 VC/PE fixture는 제거한다. 현재 검토용 로그인 계정과 기존 demo 데이터는 유지한다.
운영 배포/실제 결제/유료 AI/외부 연동 검증은 포함하지 않는다.

# 3주차 첫 딜 안내 — 디자인 검토

같은 구성의 합성 빈 작업공간 fixture를 매 실행 생성해 1440px/390px에서 실제 로컬 브라우저로 열었다.
Before는 기준 `133a338`, After는 이 PR의 구현이다. 개인정보가 없는 합성 사용자다.

| 화면 | Desktop Before / After | Mobile Before / After |
|---|---|---|
| 대시보드 | [Before](before-dashboard-1440.png) / [After](after-dashboard-1440.png) | [Before](before-dashboard-390.png) / [After](after-dashboard-390.png) |
| VC 목록 | [Before](before-deals-1440.png) / [After](after-deals-1440.png) | [Before](before-deals-390.png) / [After](after-deals-390.png) |
| PE 목록 | [Before](before-ma-deals-1440.png) / [After](after-ma-deals-1440.png) | [Before](before-ma-deals-390.png) / [After](after-ma-deals-390.png) |

첫 안내를 0건 통계보다 앞에 배치했다. 자료 업로드만으로 투자 판단이 생긴다는 안내를 제거하고 보고서 생성·근거 검토 단계를 구분했다. PE는 실제 재무 · QoE 입력과 지원되는 DART 가져오기, IC 준비 상태 확인을 안내한다. 준비 상태를 투자 승인으로 표시하지 않는다.

요금/정책 문구 변경, 수집 코드, 인터뷰 실제 수행, 운영 검증은 포함하지 않는다.

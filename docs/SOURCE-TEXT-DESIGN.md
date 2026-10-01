# 원문 근거 조회 — 2026-10-01

## 범위와 현재 상태

첫 구현은 PE 데이터룸의 **파싱 텍스트 열람**이다. 원본 PDF/Excel 뷰어가 아니며, 표·페이지 배치를 보존하지 않는다.
기존 발췌·위치·신뢰도·DD finding·근거 요청은 그대로 표시한다. 문서 열람으로 VERIFIED, 검토 완료, 투자 승인으로 전환하지 않는다.
새 AI 호출, 외부 저장소 요청, DB/schema 변경은 없다.

## 확인한 연결

| 영역 | 현재 경로 | 열람 연결 상태 |
|---|---|---|
| VC | `/api/reports/[id]/decision` → `REPORT_FOR_DECISION_INCLUDE` → `computeReportDecision` → 기존 builder/gate | loader의 문서와 evidence에는 documentId가 있으나 driver/breaker/contradiction 표시 타입에는 전달되지 않는다. 파일명으로 재매칭하지 않는다. |
| VC 표시 | `decision-workspace` → `EvidencePanel` | 기존 발췌만 표시. 원문 연결은 아직 미구현. |
| PE 목록 | `/api/ma-deals/[id]/documents` → `buildPEDataRoomViewModel` → `MaDealDataRoom` | 목록의 select/응답에 parsedText를 추가하지 않는다. |
| PE 상세 | 문서 버튼 → `MaDealDocumentDetailDialog` → `DocumentSourceText` → 새 GET text | 명시적 클릭으로만 본문을 요청한다. 다른 문서로 이동/닫기 시 요청 취소·상태 제거. |

## PE 조회 계약 — 구현

`GET /api/ma-deals/[id]/documents/[documentId]/text?offset=0`

- NextAuth 세션, `getUserTeamContext`, 기존 `maDealReadWhere` 사용. ANALYST의 팀 공유 읽기를 유지한다.
- Prisma findFirst에서 documentId, maDealId, 딜 소유자/공유 범위를 **한 조건으로** 검증한다. 다른 딜의 문서 ID를 재사용해도 허용하지 않는다.
- 비로그인 401. 없는/인가되지 않은 리소스는 같은 404 JSON과 같은 Cache-Control. 리소스 권한 검사 후 offset 검증.
- offset은 0–500000의 정수 십진 표기. 한 응답 최대 3000 UTF-16 코드 단위. 클라이언트가 상한을 늘릴 수 없다.
- 응답은 `{ data: { available, text, start, end, hasMore } }`. URL, storage key, 문서 전체 parsedText 필드는 없다.
- `private, no-store`, force-dynamic. 서버는 인가된 문서 하나의 parsedText를 읽는다. DB 단계에서 부분 문자열만 조회하는 최적화를 추가한 것은 아니다.
- 본문은 React 문자열로 출력한다. HTML/Markdown/iframe 실행 없이 `<script>`도 텍스트로 보인다.
- 파싱 텍스트 없음·로딩·실패/재시도·다음/이전 부분을 구분한다. 닫기 후 문서 버튼으로 포커스를 돌려준다.
- 계산/판정 엔진과 review/fingerprint/audit는 호출하거나 변경하지 않는다. 조회 당시 텍스트이며, 결정 snapshot과의 원자적 일치는 새로 보장하지 않는다.

## 후속 구현 경계

VC는 canonical 입력의 안정적인 문서 ID를 표시 DTO에 보존하는 방안을 별도로 검증한다. 이름·숫자·발췌가 같다는 이유로 문서를 추정하지 않는다.
보고서 sectionKey는 업로드 PDF 페이지 번호가 아니다. 기존 sectionRefs로 상세 분석에 이동할 수 있지만 원본 페이지 링크를 지어내지 않는다.
PE의 DART/수기입력처럼 documentId가 없는 근거는 원문 버튼을 만들지 않고 기존 sourceLocation을 표시한다.

`storage.ts`는 Blob public 및 로컬 public/uploads 경로를 사용한다. 새 text API의 인가가 기존 원본 파일 접근까지 보호하는 것은 아니다.
운영 원본 공개 여부·민감 데이터 노출은 이번에 확인하지 않았다. 원본 뷰어를 연결하기 전 저장소 접근 정책을 확인해야 하며,
실제 노출 재현 시 해당 작업을 멈추고 영향/최소 수정안을 보고한다. 저장소 이동·운영 설정을 임의로 바꾸지 않는다.

## 검증 기준

격리 SQLite fixture에서 소유자/공유 ANALYST/외부인/비공개 딜/다른 딜 문서/없는 문서,
동일 404 body, 응답 상한, 잘못된 offset, 목록 본문 미포함, POST 미지원, 미파싱 자료를 확인한다.
1440/390px에서 실제 Dialog, 페이징, 문자열 XSS, Escape, 복귀 포커스, 가로 넘침과 페이지 오류를 확인한다.
canonical VC/PE 회귀와 최종 typecheck/lint/build 결과는 PRODUCT-STATUS에 별도로 기록한다.

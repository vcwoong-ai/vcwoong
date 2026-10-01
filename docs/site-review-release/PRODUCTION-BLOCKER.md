# 운영 인증 화면 차단 — 2026-10-02

## 배포 사실과 실제 재현

PR #126은 head `dd2924806c289e20b4eb39fb6bfa7a21a94135e7`의 CI 통과 후 squash 병합했다.
main/운영 SHA: `a5796bbff127e0398e042baff04aa3acb75d429c`.
Vercel `dpl_Gj7zY1Z88V1czynHdFkvxEA2tLmC`, production, READY, aliasAssigned true, aliasError null.
aliases: dealmind.space, www.dealmind.space, dealsync-jade.vercel.app,
dealsync-vcwoong.vercel.app, dealsync-git-main-vcwoong.vercel.app.
병합 후 main CI(run 36885715761) SUCCESS.

운영 공개 메인페이지가 새 디자인을 표시하고 VC/PE 미리보기 전환이 동작한다.
운영 로그인 페이지의 기존 공개 데모 로그인 버튼으로 인증 후:

| 실제 화면 | 결과 |
|---|---|
| /dashboard | FAIL: Server Components render 오류 |
| /ma-deals | FAIL: 같은 오류 |
| /deals | 목록 열림 (전체 VC 기능 검증을 뜻하지 않음) |
| 기존 seed VC 보고서 | 본문 열림 (생성/재검증/승인/내보내기 실행 안 함) |

새 운영 배포의 최근 20분, error 필터/limit 100에서 오류 4건을 확인했다.
모두 Prisma P2021: `The table public.MADeal does not exist in the current database.`
dashboard 3건, ma-deals 1건. HTTP 200 로그가 있어도 RSC 업무 화면 실패가 없다는 뜻은 아니다.
추가 일반 로그 100건에 error가 없던 샘플은 전체 오류 0건의 증거로 사용하지 않는다.

이전 운영 `b919e5d`의 deployment `dpl_BEWsmYYbp6Jgzt2Nzrdb1WHjganX` 최근 2시간
error 로그에서도 같은 MADeal 테이블 누락 3건(/dashboard)을 확인했다.
이전 dashboard 소스에도 같은 mADeal.count/findMany가 있다. 이번 디자인 변경으로 생긴 DB 결함은 아니다.
이전 코드로 롤백하면 이 테이블 누락이 해결된다고 주장하지 않는다.

## 영향과 중단 경계

운영 PE 목록과 PE 데이터를 함께 읽는 dashboard가 차단된다. 데모 로그인 성공,
Vercel READY, 로컬 SQLite E2E 통과를 운영 VC/PE 전체 PASS로 부르지 않는다.
운영 DB/env/schema/결제 설정 변경은 사용자 승인 범위 밖이므로 실행하지 않았다.
DB 초기화/seed/db push/migration/운영 계정 수정/추가 AI 호출/유료 외부 요청 없음.
데이터 누락을 0건으로 바꾸거나 readiness/검토/투자 승인 의미를 바꾸는 폴백도 넣지 않았다.

## 최소 수정안 (미실행, 실제 적용 전 별도 승인)

1. 현재 운영 대상의 DB/branch/schema가 의도한 대상인지 확인하고, 카탈로그만 읽어
   `prisma/schema.prisma`의 PE 테이블/enum/컬럼/인덱스/FK와 대조한다.
   현재 실제 SQL 카탈로그 전체 대조는 NOT VERIFIED; MADeal 누락은 운영 로그로 확인했다.
2. 기존 백업/복구 지점을 확인한다. 새 DB/앱/Vercel 프로젝트를 만들지 않는다.
3. MADeal 정의의 기존 출처는 `prisma/patches/2026-09-22-add-pe-domain-foundation.sql`이다.
   이 파일은 MADeal/MADocument/MAReport/MAReportSection 및 관련 enum/FK를 정의한다.
   재무/QoE/LBO/DD/evidence/IC 관련 후속 PE 모델도 실제 누락 여부를 대조해야 한다.
   첫 파일만 적용하고 전체 PE가 복구됐다고 가정하거나 모든 패치를 무조건 실행하지 않는다.
4. 확인된 차이만 담은 DDL·영향·복구안을 검토한 뒤 운영 schema 변경 승인을 받는다.
   새 데이터 계산/판정/권한/청구 엔진을 변경하지 않는다. 기존 VC 데이터나 schema를 초기화하지 않는다.
5. 적용 후 인증 dashboard/PE 목록 및 기존 canonical 입력·스냅샷·근거·리뷰 흐름을 다시 검증한다.

현재 상태: 배포 완료, 운영 인증 dashboard/PE 검증 BLOCKED.

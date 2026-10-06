# 2026-10-04 디자인 운영 배포

사용자의 운영 배포 요청으로 투자 검토 데스크 디자인을 배포했다.

## 결과

- 운영 URL: https://www.dealmind.space/ma-deals
- 프로젝트: `vcwoong/dealsync`
- 배포: `dpl_4hyTcapJt6GSFgzw1EF8jgU2KEaj`
- 배포 URL: https://dealsync-8dpmfucb6-vcwoong.vercel.app
- 상태: production / READY. `vercel inspect www.dealmind.space`로 새 배포 연결 확인.
- Vercel 원격 build: 1분 8초. 컴파일·린트·타입 검사 통과.
- 이전 운영 배포(복구 기준): `dpl_HVFduBQSrephgMUyTKtcT3CoZ4tp`, https://dealsync-bdfj65uyw-vcwoong.vercel.app

## 배포 방식과 범위

이전 운영 소스 사본과 현재 파일의 해시를 비교했다. 기존 파일 차이는 PE 목록과 대기열, 공통 셸의 TSX 5개였고 신규 CSS module 2개를 추가했다. 기존 배포의 스토리지·업로드 보호 코드를 유지했다. 분리된 소스 사본에서 `vercel.cmd deploy --prod --skip-domain --yes --scope vcwoong`을 실행하고 정상 응답을 확인한 뒤 `vercel.cmd promote`로 운영 도메인을 전환했다.

로컬 환경 파일, 업로드, DB 파일, Ruflo 메모리, 합성 디자인 미리보기 경로는 배포 소스에 포함하지 않았다. 새 의존성 추가, 키·환경 설정 변경, 운영 DB 변경, 데이터 삭제, 결제, AI 생성, 커밋·푸시는 하지 않았다. 원격 빌드가 기존 lockfile의 의존성을 설치했다.

## 실제 확인

| 확인 | 결과 |
| --- | --- |
| 전환 전 새 배포 `/login`, `/api/health` | HTTP 200 |
| 전환 전 보호된 문서 다운로드, 비로그인 | HTTP 401 |
| 전환 후 운영 `/`, `/login` | HTTP 200 |
| 전환 후 운영 `/api/health` | HTTP 200, status=ok |
| 전환 후 보호된 문서 다운로드와 복구 cron, 비로그인 | HTTP 401 |
| 기존 브라우저 로그인 세션으로 운영 PE 목록 열기 | 새 masthead·요약·대기열·공통 셸 렌더 확인 |
| 확인한 운영 PE 탭 브라우저 콘솔 오류 | 0건(최대 30건 조회 범위) |

계정·회사·딜 정보를 제외한 상단 디자인 영역만 결과 이미지로 저장했다. 기존 사용자 설정 탭은 입력 손실을 피하기 위해 새로고침하지 않았다.

## 검증 한계

이번 배포에서 자동 회귀 테스트와 업로드 재검사는 실행하지 않았다. 운영 화면 관찰과 공개 상태 확인은 모든 API·모바일·스크린리더·전체 사용자 흐름 검증을 뜻하지 않는다. 이전 스토리지 작업에서 남긴 기존 공개 원본의 이전 문제 등은 이번 디자인 배포로 해결된 것으로 간주하지 않는다.

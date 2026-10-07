# 문서 파서 자원 한도 조사와 최소 보완 계획

2026-10-06 SGC-PC의 `W:/Dealmind/primary` 소스와 설치된 JSZip 구현을 읽은 정적 조사다. 이번 담당 작업은 이 문서만 작성하며 파서 소스, 의존성, schema, 환경 파일, DB, 저장 원본을 변경하지 않았다. 자원 한도를 구현하거나 부하 시험에 통과한 기록이 아니다.

`AGENTS.md`, `.agents/skills/swarm-orchestration/SKILL.md`, `docs/local-development-2026-10-06.md`, `cloud-handoff.md`, `pe-document-upload.md`, `autonomous-progress.md`, `external-service-connections.md`의 관련 내용과 Git 상태를 확인했다. native agent의 개발 조사 담당으로 위임받았으며 현재 세션에서 Ruflo MCP를 사용하지 않았다. 기존 컴퓨터의 Ruflo 상태나 과거 검증을 이 컴퓨터의 실행 결과로 간주하지 않는다.

## 현재 보호하는 경계

| 위치 | 확인된 제한 | 남아 있는 경계 |
| --- | --- | --- |
| `src/lib/pe/pe-document-upload.ts:6`, `readPEUploadForm` | 파일 4MiB, multipart 4MiB+64KiB; 선언 크기와 실제 요청 스트림 모두 검사 | 압축 확장량, 파서 CPU, 파서 작업 메모리와 무관 |
| 같은 파일 `PEParseRecoveryService.retry` | 비공개 원본 경로/속성/바이트 해시 확인, 저장소 읽기 4MiB, 기존 텍스트/원본 보존, 최대 수동 재시도 3회 | 10분 lease/CAS는 결과 저장 권한을 제어하며 파서 실행을 중단하지 않음 |
| PE documents/retry-parse route | `maxDuration = 60`, 공통 `parseDocument`를 ports에 주입 | 호스팅 실행 설정이며 로컬 CPU 선점/취소를 구현하지 않음 |
| `src/lib/document-parser.ts:42,65` | 최종 저장 텍스트 500,000자, truncation warning/metadata | 전체 파싱 완료 후 자르므로 순간 메모리나 파싱 시간 한도가 아님 |
| `src/lib/document-parser.ts:191,218,231` | PPTX 슬라이드/노트 XML 각각 선언 확장 크기 20MiB | 총량, 항목 수, 실제 확장 스트림, 전체 파싱 시간 제한 없음 |
| `src/lib/zip-safety.ts:34` | `_data.uncompressedSize > maxBytes`이면 개별 항목을 건너뜀 | 없는 값, NaN/음수 등의 값에 대해 fail-open; 실제 읽은 바이트 검증 없음 |
| `src/lib/storage.ts:68,179` | 저장 파일 스트림/로컬 읽기의 maxBytes; 일부 네트워크 15초 timeout | 네트워크/입력 제한이고 파서 CPU를 중단하지 않음 |

PE 서비스가 warning/실패를 원본 보존 상태로 처리하는 기존 구조를 그대로 사용할 수 있다. 별도 업로드 상태 모델이나 DB 필드는 우선 필요하지 않다.

## 형식별 실제 경로와 공백

- DOCX: `document-parser.ts:125-126`에서 `mammoth.extractRawText({buffer})`로 넘긴다. 공통 ZIP guard를 통과하지 않으며 라이브러리 결과 전체를 받은 후 저장 텍스트만 자른다.
- XLSX: `document-parser.ts:258-276`에서 `xlsx.read`로 전체 workbook을 만들고 모든 sheet를 CSV로 만든 뒤 배열을 합친다. ZIP guard/시트 수/행·셀 수/CSV 누적량 한도가 없다. XLSX 확장량 검사와 workbook 객체 메모리 한도는 서로 다른 제한이다. legacy XLS도 이 공통 파서가 지원하므로 ZIP 검사만으로 모든 Excel을 보호했다고 보고할 수 없다(PE는 XLS 미허용).
- PPTX: `JSZip.loadAsync` 후 모든 항목 이름을 순회하고 slide/notes를 순차 해제한다. 개별 20MiB 항목이 여러 개면 총량은 제한되지 않는다. `readZipEntrySafe`가 null로 건너뛴 항목은 누락 사유가 결과 warning에 연결되지 않으므로 남은 텍스트가 300자 이상이면 부분 추출이 주의 없이 반환될 수 있다. 이는 정적 가능성이고 이번 실행으로 재현한 결과는 아니다.
- PDF: `document-parser.ts:144-177`에서 `PDFParse.getText()`의 전체 pages를 받고 문자열을 합친다. `finally`의 `destroy()`는 정상/예외 완료 뒤 정리이며 정지·과부하 때의 supervisor가 아니다. 애플리케이션의 kill 가능한 worker, 페이지/객체 처리 budget은 없다. pdfjs의 내부 worker가 있다고 해서 앱 자원 격리로 간주하지 않는다.
- TXT: `buffer.toString` 후 결과를 자른다. PE 입력 한도가 직접 적용되지만, 공통 파서 자체에는 입력 buffer 한도가 없다.

설치된 JSZip `lib/zipObject.js`는 `.async()`에서 전체 결과를 accumulate한다. `lib/compressedObject.js:37`의 실제 확장 크기 불일치 검사는 end 시점에 수행된다. 최종 불일치 오류를 기다리는 것은 해제 중 메모리 한도가 아니다. `internalStream`/`nodeStream`이 있는 것은 확인했으나 중단 후 실제 inflater 종료·메모리 회수가 검증된 것은 아니다.

인접 경로도 구분한다. `document-images.ts:35,71`의 개별 미디어 100MiB 제한과 결과 이미지 6개 선택은 모든 미디어를 읽어 보관한 뒤 적용되므로 전체 확장/메모리 제한이 아니다. VC `upload-recovery.ts:97`은 텍스트 파싱 후 이미지 추출도 수행한다. template parser/preview/reconstructor/structure-qa와 DART에는 별도 JSZip 해제 호출이 있다. 아래 PE 개선만으로 이 모든 경로를 보호했다고 주장하지 않는다.

## 최소 보완 순서

### 1. 기존 ZIP helper와 공통 파서에 자원 정책 연결

먼저 `zip-safety.ts`에 기존 패키지를 재사용하는 archive preflight/budget helper를 추가하는 안을 검증한다. OOXML의 항목 수, 개별 선언 확장량, 총 선언 확장량을 확인하고 unknown/invalid 크기는 보호 경로에서 거절한다. 누락 항목을 성공으로 조용히 취급하지 않도록 명시적인 resource-limit 오류 또는 warning을 반환한다. 기존 이미지 caller와의 호환성이 달라지므로 기존 helper를 일괄 변경하지 말고 opt-in 정책으로 시작하는 것이 최소 범위다.

`document-parser.ts`의 DOCX/PPTX/XLSX 진입 전에 같은 정책을 적용할 수 있는 optional bounded policy 또는 별도 bounded entry/wrapper를 추가하는 안이다. 기존 `parseDocument` 기본 동작은 VC recovery도 사용하므로 이 단계에서 일괄 변경하지 않는다. 새 정책은 검증 후 PE ports에서만 opt-in하고 공통 내부 파싱 구현을 재사용한다. 각 형식에서 실제 읽는 항목만 확인하면 다른 entry를 읽는 라이브러리 경로가 빠지므로 라이브러리가 소비할 archive 전체를 고려한다. 선언 metadata preflight는 빠른 거절 장치이며 실제 확장량 보장의 완료로 기록하지 않는다. 항목 수 검사는 JSZip.loadAsync가 이미 객체를 만든 뒤라 초기 로딩의 메모리 경계도 별도로 남는다.

새 bounded 경로의 PPTX 텍스트 누적은 parse 중 500,000자 상한으로 제한하고 생략을 warning에 연결한다. 같은 경로의 XLSX CSV/행 순회와 PDF 페이지 출력에도 가능한 조기 출력 제한을 적용한다. DOCX 라이브러리가 전체 문자열을 반환한다면 후처리 clamp만으로 메모리 제한을 주장하지 않는다. 페이지/슬라이드/시트 위치 표시는 현재 근거 추적 형식을 유지한다.

정확한 총 확장 MiB/항목 수/시트·페이지 수/시간값은 현재 고객 문서와 배포 메모리 목표의 근거가 없어 확정하지 않는다. 합성 시험에는 작은 주입 가능한 budget을 사용해 경계를 확인하고 실제 허용치는 대표 자료와 실행 환경을 확인한 뒤 결정한다. 기존 PE 4MiB와 출력 500,000자 정책은 유지하는 안이다.

### 2. 실제 확장량 및 kill 가능한 실행 격리

같은 JSZip의 byte stream을 사용해 전체/개별 해제 바이트를 증가시키고 초과 즉시 결과 축적을 멈추는 실험을 별도 TEMP 소스에서 진행한다. 검사 후 mammoth/xlsx가 원본을 다시 해제하면 중복 비용이 발생하므로 성공 archive 재사용 가능 여부와 재파싱 비용을 측정해야 한다. stream pause 또는 Promise rejection만으로 inflater의 CPU 중단을 보장했다고 보고하지 않는다.

Node 내장 child process 또는 worker_threads로 기존 파서 실행을 감싸는 안은 신규 npm 의존성이나 schema 없이 가능하지만 런타임 구조 변경이다. 채택 전에 변경 이유·파일 담당·배포 asset 추적 계획을 설명하고, 격리 TEMP 실험에서 먼저 확인한다. 같은 이벤트 루프의 `Promise.race` timeout은 동기 `xlsx.read`나 CPU 정체를 중단할 수 없으므로 대체 장치로 사용하지 않는다. 부모가 벽시계 deadline을 관찰하고 작업을 종료하며 입력/IPC 출력 크기·동시 작업 수·대기열 길이를 제한하는 계약이 필요하다. DB/저장소 쓰기는 기존 부모 서비스만 맡고 worker는 bytes→text/비민감 제한 결과만 전달한다. 환경과 오류 전문이 IPC/로그로 새지 않게 최소 환경과 고정 오류 코드를 사용한다.

worker resourceLimits/Node heap flag는 Buffer·네이티브 메모리 전체 RSS를 제한하지 않으므로 완전한 메모리 보호로 표현하지 않는다. Windows와 배포 런타임에서 RSS/CPU 정책, 실행 종료와 자식 정리, PDF native/dynamic assets를 확인해야 한다. 지원하지 않는 배포 환경에서는 안전하게 추출 불가를 반환하고 격리 없는 실행으로 조용히 fallback하지 않는다.

단일 프로세스 semaphore는 이 인스턴스의 부하만 제한한다. 여러 인스턴스 전체 한도가 필요하면 기존 lease/실행 환경 admission을 어떻게 재사용할지 별도 설계하고 durable 필드 필요 여부를 먼저 설명한다. 이번 계획에서는 신규 전역 큐/schema를 만들지 않는다.

### 3. PE 기존 ports에 연결한 뒤 인접 경로 확대

PE documents/retry-parse의 `parse` port를 bounded parser로 교체하되 원본 저장→PARSING→WARNING/READY와 CAS는 유지한다. resource limit/timeout은 WARNING·원본 확인 안내로 귀결시키고 재추출에서는 기존 텍스트/URL을 보존한다. 내부 오류, 원본 위치, fingerprint/token/추출 본문은 public 응답에 추가하지 않는다. 최대 3회와 늦은 worker 결과 fence를 유지한다. 파서가 해제돼도 이미 저장 결과가 UNKNOWN인 작업을 자동 재업로드/조정하지 않는다.

PE가 검증된 뒤 VC recoverDocument와 이미지, template 경로를 같은 helper로 확대할지 별도 범위를 정한다. 소스 전역 치환으로 공통 제한을 넣는 작업은 이번 최소 범위에 포함하지 않는다.

## 단계별 검증과 재개 위치

1. synthetic 작은 ZIP으로 exact/over single/aggregate/entry-count, missing/invalid metadata, 선언/실제 불일치, oversize slide/notes의 주의 표시를 검사한다. 거절 때 본문을 해제하지 않는 빠른 경로와 해제 중 중단을 구분한다. 거대한 폭탄 파일을 주 서버에서 실행하지 않는다.
2. 기존 `tools/test-pe-document-reparse-formats.ts`의 memory DOCX/PPTX/XLSX/PDF fixture와 marker/원본 보존 검사를 재사용한다. 별도 raw parser를 테스트해 실제 route가 다른 파서를 쓰는 공백을 만들지 않는다.
3. resource-limit/빈 결과/worker error/timeout/종료 뒤 late result를 `tools/test-pe-document-upload.ts`에 주입해 WARNING, 기존 parsedText/URL 보존, 재시도 횟수와 중복 한 번 실행을 확인한다. no full text/token/ref in public response 회귀도 유지한다.
4. 별도 TEMP 실행에서 supervisor heartbeat 지속, wall timeout 후 CPU 작업 종료·활성 slot 반환, queue overflow, IPC 출력 초과, worker/child exit 후 pending promise 종료를 확인한다. RSS/native bounds는 별도 측정으로 보고한다. 기존 server3000/SQLite/고객 자료와 환경을 사용하지 않는다.
5. focused 명령: `npm run test:pe-document-upload`, `npm run test:pe-storage-read-bound`, `npm run test:pe-document-reparse-formats`, 격리 PG의 `npm run test:pe-document-reparse-integration`, 변경 후 `npm exec -- tsc --noEmit --incremental false`. 실행 시 실제 exit와 합성/mock/PG 경계를 별도 기록한다. 이 문서 작업에서는 명령을 실행하지 않았다.
6. production bundle에서 PE 최초 업로드/재추출 PDF 모두 실제 parser assets가 포함되는지 확인한다. 현재 `next.config.mjs`의 강제 tracing pattern은 `/api/upload`만 명시하며 PE route와 향후 worker entry에 필요한 dynamic assets는 별도 검증 대상으로 남긴다.

다음 재개는 1단계 합성 RED 검증과 자원 정책 계약을 먼저 만들고 `zip-safety.ts`/`document-parser.ts`의 담당을 한 개발 agent에 배정하는 위치다. 이번 제한된 정적 조사로 대용량 업로드, 저장 UNKNOWN 조정, OCR/실문서 품질, 실제 클라우드 연결, CPU/RSS 격리, 전역 동시 부하가 해결됐다고 주장하지 않는다. localhost 브라우저 검증은 기존 접근 거절 상태를 유지했다. commit/push/배포/유료 서비스 호출은 없다.

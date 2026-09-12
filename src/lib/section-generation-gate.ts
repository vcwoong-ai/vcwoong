/**
 * 섹션 generation-time 품질 게이트.
 *
 * 배경(실제 프로덕션 사고, 2026-09-12): report=cmtycq7ne...의 9번 섹션
 * (OPINION_SUMMARY, 보고서에서 가장 중요한 "그래서 투자해야 하는가?" 결론)이
 * `"User Safety: safe"`(45자)로 저장된 채 보고서가 완료 처리됐다. 원인은
 * claude.ts의 callOnce()가 "응답이 비어있는가"만 검사하고 "응답이 말이
 * 되는가"는 전혀 검사하지 않았기 때문 — 45자짜리 무의미한 문자열도
 * "비어있지 않음"을 통과한다.
 *
 * 이 파일은 그 공백을 메운다 — sectionKey를 아는 도메인 레이어(base-agent.ts)에서
 * 호출해 claude.ts의 모델 체인(runModelChain)에 검증 콜백으로 주입한다.
 * claude.ts 자체는 "섹션"이라는 개념을 몰라야 한다(다른 여러 AI 호출 —
 * deep-dive, IC 질문, 섹터 감지 등 — 도 같은 claude.ts를 쓰기 때문).
 *
 * 여기서 하는 일은 report-quality.ts의 evaluateSection()과 다르다 —
 * evaluateSection은 "이미 저장된 결과물의 상대적 품질 점수"를 매기고,
 * 이 파일은 "애초에 저장해도 되는 최소 조건"만 이진 판정한다(통과/실패).
 * 두 시스템을 하나로 합치지 않는다 — 합치면 사소한 감점 사유(출처 표기
 * 부족 등)로도 재시도 루프가 계속 돌아 보고서 생성이 끝나지 않을 위험이
 * 있다. 여기서 검증하는 항목은 "이 결과를 신뢰할 수 있는가"에 대한
 * 명백하고 오검출 위험이 낮은 신호로 한정한다.
 */
import { SectionKey } from "@prisma/client";
import { SECTION_META } from "@/types";

export type GateFailureReason =
  | "EMPTY"
  | "TOO_SHORT"
  | "BOILERPLATE_REFUSAL"
  | "REPETITIVE"
  | "MISSING_RECOMMENDATION_LABEL";

export interface GateResult {
  ok: boolean;
  reason?: GateFailureReason;
}

/**
 * 모델이 실제 콘텐츠 대신 뱉는 것으로 실측/보고된 정형화된 비정상 응답
 * 패턴 — 안전 필터/거절 문구, 메타 발언. 오검출을 줄이기 위해 "짧은
 * 문장 전체"나 "응답 맨 앞부분"에만 적용되는 패턴 위주로 구성한다(본문
 * 중간에 우연히 이런 단어가 섞인 정상적인 리스크 설명까지 걸러내지
 * 않도록).
 */
const REFUSAL_PATTERNS: RegExp[] = [
  /^\s*user\s*safety\s*:/i, // 실제 관측된 케이스: "User Safety: safe"
  /^\s*i(?:'|’)?m sorry/i,
  /^\s*i cannot (?:help|assist|provide|continue|comply)/i,
  /^\s*i can(?:'|’)?t (?:help|assist) with (?:this|that)/i,
  /^\s*as an ai (?:language model|assistant)/i,
  /^\s*i(?:'|’)?m (?:not able|unable) to/i,
  /^\s*죄송하지만.{0,30}(?:도와드릴 수 없|답변할 수 없|응답할 수 없)/,
  /^\s*본\s*요청에\s*응답할\s*수\s*없습니다/,
];

/** OPINION_SUMMARY는 SECTION_META의 기본값(300자)보다 엄격하게 요구한다 — 사용자 지정 500자 */
const MIN_CHARS_OVERRIDE: Partial<Record<SectionKey, number>> = {
  OPINION_SUMMARY: 500,
};

const RECOMMENDATION_LABEL_RE =
  /투자\s*권고|조건부\s*투자|추가\s*검토|투자\s*보류|투자\s*비추천/;

/** 의미 있는 길이(20자 이상)의 한 줄이 3번 이상 그대로 반복되면 — 모델이 같은 문장을 되풀이 생성한 것으로 본다 */
function findRepeatedLine(content: string): boolean {
  const counts = new Map<string, number>();
  for (const raw of content.split(/\n+/)) {
    const line = raw.trim();
    if (line.length < 20) continue;
    const next = (counts.get(line) ?? 0) + 1;
    if (next >= 3) return true;
    counts.set(line, next);
  }
  return false;
}

/**
 * 순수 함수 — DB/네트워크 없음, 컴포넌트 렌더링 없음. runModelChain의
 * 재시도 판별(isRetryableAIError)과 동일하게 네트워크 없이 검증 가능하도록
 * 설계했다(tools/test-section-generation-gate.ts 참고).
 */
export function checkGenerationGate(
  sectionKey: SectionKey,
  content: string
): GateResult {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }

  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: "BOILERPLATE_REFUSAL" };
    }
  }

  // report-quality.ts의 evaluateSection과 동일 기준(공백 제외 글자수)으로 비교한다.
  const chars = trimmed.replace(/\s/g, "").length;
  const minChars = MIN_CHARS_OVERRIDE[sectionKey] ?? SECTION_META.find((m) => m.key === sectionKey)?.minChars ?? 0;
  if (minChars > 0 && chars < minChars) {
    return { ok: false, reason: "TOO_SHORT" };
  }

  if (findRepeatedLine(trimmed)) {
    return { ok: false, reason: "REPETITIVE" };
  }

  if (sectionKey === "OPINION_SUMMARY" && !RECOMMENDATION_LABEL_RE.test(trimmed)) {
    return { ok: false, reason: "MISSING_RECOMMENDATION_LABEL" };
  }

  return { ok: true };
}

/** claude.ts의 ClaudeOptions.validate에 그대로 넘길 수 있는 형태로 감싼다 */
export function buildSectionValidator(
  sectionKey: SectionKey
): (content: string) => { ok: boolean; reason?: string } {
  return (content: string) => checkGenerationGate(sectionKey, content);
}

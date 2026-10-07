import type { VCMissingInformation } from "./vc-decision-types";

export interface MaterialRequestItem {
  id: string;
  title: string;
  evidence: string;
  priority: string;
}

/** Preserve the full scoped report list; no invented evidence or auto-send. */
export function materialRequestItems(items: VCMissingInformation[]): MaterialRequestItem[] {
  return items.map((item, index) => ({ id: `missing-${index}`, title: item.item,
    evidence: item.requiredEvidence, priority: item.priority }));
}

export function materialRequestDraft(companyName: string, reportTitle: string,
  items: MaterialRequestItem[]): string {
  if (!items.length) return "";
  return [`${companyName} 검토를 위한 보완자료 요청 초안`, "",
    "안녕하세요. 투자 검토를 위해 아래 자료의 확인을 부탁드립니다.", "",
    ...items.flatMap((item, index) => [`${index + 1}. ${item.title}`, `   요청 자료: ${item.evidence || "관련 원본 자료를 확인해주세요."}`, ""]),
    "제출 가능 여부와 일정을 알려주시면 검토에 참고하겠습니다.", "",
    `검토 기준: ${reportTitle}`, "발송 전 요청 내용과 수신자를 확인해주세요."].join("\n");
}

/**
 * PE IC Committee Pack — 조립기(PR #110).
 *
 * `buildPEICDecision()`(PR #108)과 `buildPEICReviewWorkspace()`(PR #109)를
 * 호출해 결과를 그대로 봉투에 담을 뿐이다 — 새 readiness/재무/QoE/LBO/DD/
 * evidence 계산은 이 파일에도, 이 파일이 부르는 곳에도 없다.
 *
 * fingerprint 계산(crypto 사용)은 이 파일에 없다 — `pe-committee-pack-
 * fingerprint.ts`로 분리했다. "위원회 자료" 탭(`ma-deal-committee-pack.tsx`)은
 * 이 파일의 `buildPECommitteePackContent()`만 클라이언트에서 직접 호출한다
 * (fingerprint는 클라이언트가 신뢰할 수 없는 값이라 쓸 일도 없다 — §Step18
 * 10 참고). Node의 `crypto` 모듈을 이 파일에 두면 그 import가 클라이언트
 * 번들에 함께 실려 나가므로, fingerprint가 필요한 서버 전용 조립
 * (`buildPECommitteePack()`, pe-committee-pack-fingerprint.ts)과 분리해둔다.
 */

import type { PEDDCase } from "./dd-types";
import type { PEDecisionReadiness } from "./pe-decision-readiness";
import type { QoESummaryView, DartStatusView, FinancialQualityView, computeLboEntryEbitda } from "./ma-deal-dashboard";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import { buildPEICDecision } from "./pe-ic-decision";
import type { PEICProcessState } from "./pe-ic-decision-types";
import { buildPEICReviewWorkspace } from "./pe-ic-review";
import type { PEEvidenceRequestView } from "./pe-ic-review-types";
import type { PECommitteePackContent } from "./pe-committee-pack-types";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL } from "./ma-deal-labels";

type LboEntryEbitdaResult = ReturnType<typeof computeLboEntryEbitda>;

export interface PECommitteePackInput {
  dealId: string;
  maDeal: { companyName: string; name: string; dealType: MaDealType; status: MaDealStatus };
  readiness: PEDecisionReadiness;
  financialQuality: FinancialQualityView;
  qoeSummary: QoESummaryView | null;
  lboEntryEbitda: LboEntryEbitdaResult;
  dartStatus: DartStatusView;
  ddCase?: PEDDCase;
  evidenceRequests: PEEvidenceRequestView[];
}

/**
 * "IC가 지금 검토를 진행해도 되는가"를 한 문장으로 요약한다 — processState는
 * 이미 readiness 엔진이 정한 값을 그대로 읽을 뿐 재판정하지 않는다.
 * 투자 매력도/추천이 아니라 "지금 검토를 시작해도 되는 데이터 상태인가"만
 * 말한다(pe-ic-decision-types.ts §0 원칙과 동일).
 */
export function buildCurrentReviewStateLabel(processState: PEICProcessState): string {
  switch (processState) {
    case "BLOCKED":
      return "데이터 모순으로 IC 검토가 차단됨 — 모순을 해소하기 전까지 위원회 심의를 진행할 수 없습니다.";
    case "NOT_READY":
      return "IC 검토 전 추가 확인이 필요합니다.";
    case "PARTIALLY_READY":
      return "일부 정보가 아직 없습니다 — 현재 확인된 핵심 이슈 기준으로는 IC 검토를 진행할 수 있습니다.";
    case "READY_FOR_IC":
      return "현재 확인된 자료 기준으로 IC 검토가 가능합니다.";
  }
}

export function buildPECommitteePackContent(input: PECommitteePackInput): PECommitteePackContent {
  const decision = buildPEICDecision({
    dealId: input.dealId,
    readiness: input.readiness,
    financialQuality: input.financialQuality,
    qoeSummary: input.qoeSummary,
    lboEntryEbitda: input.lboEntryEbitda,
    dartStatus: input.dartStatus,
    ddCase: input.ddCase,
    // LBO 가정은 세션 로컬 client state일 뿐 서버에 없다 — 지어내지 않는다(pe-ic-decision.ts와 동일 원칙).
    lboAssumptionKeysProvided: undefined,
  });

  const review = buildPEICReviewWorkspace(input.dealId, decision.processState, decision.questions, input.evidenceRequests);

  return {
    dealId: input.dealId,
    generatedAt: new Date().toISOString(),
    deal: {
      companyName: input.maDeal.companyName,
      dealName: input.maDeal.name,
      dealType: input.maDeal.dealType,
      dealTypeLabel: MA_DEAL_TYPE_LABEL[input.maDeal.dealType],
      status: input.maDeal.status,
      statusLabel: MA_DEAL_STATUS_LABEL[input.maDeal.status],
    },
    decision,
    review,
    currentReviewStateLabel: buildCurrentReviewStateLabel(decision.processState),
  };
}

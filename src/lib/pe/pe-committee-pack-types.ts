/**
 * PE IC Committee Pack — 순수 뷰 모델(PR #110).
 *
 * ## 두 번째 진실 소스를 만들지 않는다(§3, 최우선 원칙)
 *
 * `decision`과 `review` 필드는 각각 `PEICDecision`(pe-ic-decision-types.ts,
 * PR #108)과 `PEICReviewWorkspace`(pe-ic-review-types.ts, PR #109) 인스턴스
 * 그대로다 — thesis/drivers/breakers/financial/QoE/LBO/DD/evidence/
 * questions/openItems/resolvedItems/evidenceRequests를 여기서 다시 복사해
 * 담지 않는다. Committee Pack은 이 두 객체를 하나로 묶는 봉투(envelope)일
 * 뿐이다. 화면/메모(IC Memo)/위원회 자료(Committee Pack)가 전부 같은
 * `buildPEICDecision()`/`buildPEICReviewWorkspace()` 호출 결과를 소비하므로
 * 구조적으로 서로 다른 결론을 낼 수 없다.
 *
 * ## 저장하지 않는다(§4)
 *
 * `PECommitteePack`은 매 요청마다 다시 조립되는 파생 뷰다. 저장되는 건
 * `PEICReview`/`PEICReviewComment`(사람의 실제 워크플로 행동)뿐이다.
 *
 * ## fingerprint(§Step13)
 *
 * `fingerprint`는 이 패키지를 구성하는 canonical 데이터(readiness/decision/
 * review item/evidence request 상태/DD finding/재무/QoE/LBO 가정)의
 * 결정론적 해시다 — 리뷰어 코멘트나 서명 상태는 포함하지 않는다(§Step19
 * 시나리오 F: "코멘트만 바뀌면 fingerprint는 그대로"). 리뷰 기록이 저장한
 * fingerprint와 지금 다시 계산한 fingerprint가 다르면 그 리뷰는 더 이상
 * 지금 자료를 반영하지 않는다 — `pe-ic-review-signoff.ts`의
 * `computeReviewDisplayState()`가 이 비교를 담당한다.
 */

import type { PEICDecision } from "./pe-ic-decision-types";
import type { PEICReviewWorkspace } from "./pe-ic-review-types";
import type { PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";
import type { MaDealType, MaDealStatus } from "@prisma/client";

export interface PECommitteePackDealSnapshot {
  companyName: string;
  dealName: string;
  dealType: MaDealType;
  dealTypeLabel: string;
  status: MaDealStatus;
  statusLabel: string;
}

/**
 * fingerprint 없는 부분 — `buildPECommitteePackContent()`(pe-committee-pack.ts,
 * crypto 없음)가 만든다. 클라이언트 컴포넌트("위원회 자료" 탭)는 항상 이
 * 타입까지만 다룬다.
 */
export interface PECommitteePackContent {
  dealId: string;
  /** 이 패키지를 조립한 시각(ISO) — fingerprint 계산에는 포함되지 않는다(매번 달라짐). */
  generatedAt: string;
  deal: PECommitteePackDealSnapshot;
  /** buildPEICDecision()의 결과 그대로(재계산 없음) — thesis/drivers/breakers/financial/qoe/lbo/dd/evidence/questions/readiness가 전부 여기 있다. */
  decision: PEICDecision;
  /** buildPEICReviewWorkspace()의 결과 그대로(재계산 없음) — openItems/resolvedItems/evidenceRequests/overallState가 전부 여기 있다. */
  review: PEICReviewWorkspace;
  /** "IC가 지금 검토를 진행해도 되는가"를 한 문장으로 요약한 템플릿 문구 — 투자 판단이 아니다(§4 "BUY/PASS 아님"과 동일 원칙). */
  currentReviewStateLabel: string;
}

/**
 * fingerprint 포함 — `buildPECommitteePack()`(pe-committee-pack-fingerprint.ts,
 * crypto 사용, 서버 전용)만 만든다. 클라이언트 컴포넌트에서 만들거나
 * import하면 안 된다(crypto가 번들에 실린다 — 파일 상단 주석 참고).
 */
export interface PECommitteePack extends PECommitteePackContent {
  /** canonical 데이터(리뷰 코멘트/서명 상태 제외)의 결정론적 해시 — 재검토 필요 판정에만 쓴다. */
  fingerprint: string;
  /** fingerprint의 카테고리별 하위 해시 — "무엇이 바뀌었는가"(§Step14)를 위한 것. */
  fingerprintBreakdown: PECommitteePackFingerprintBreakdown;
}

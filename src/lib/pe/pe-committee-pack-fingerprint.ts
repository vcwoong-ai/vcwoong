/**
 * PE IC Committee Pack — fingerprint(§Step13, PR #110).
 *
 * Node의 `crypto` 모듈을 쓴다 — 이 파일은 서버 전용이다. 클라이언트
 * 컴포넌트에서 import하면 안 된다(`crypto` import가 그대로 클라이언트
 * 번들에 실려 나간다). "위원회 자료" 탭은 fingerprint가 필요 없다 —
 * `pe-committee-pack.ts`의 `buildPECommitteePackContent()`만 쓴다.
 * fingerprint는 리뷰 서명(REVIEWED)의 유효성을 서버가 판정할 때만
 * 쓰인다(§Step18 10 — 클라이언트는 이 값을 계산도, 제출도 하지 않는다).
 */

import { createHash } from "crypto";
import { buildPECommitteePackContent, type PECommitteePackInput } from "./pe-committee-pack";
import type { PEICDecision } from "./pe-ic-decision-types";
import type { PEEvidenceRequestView } from "./pe-ic-review-types";
import type { PECommitteePack } from "./pe-committee-pack-types";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function evidenceRequestsMaterial(evidenceRequests: PEEvidenceRequestView[]) {
  return [...evidenceRequests]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, reviewItemSourceId: r.reviewItemSourceId, status: r.status, linkedDocumentId: r.linkedDocumentId }));
}

export interface PECommitteePackFingerprintBreakdown {
  overall: string;
  financial: string;
  qoe: string;
  lbo: string;
  dd: string;
  evidence: string;
  questions: string;
}

/**
 * canonical 데이터(리뷰 코멘트/서명 상태 제외)의 결정론적 해시(§Step13).
 * 카테고리별 하위 해시도 함께 계산한다 — "무엇이 바뀌었는가"(§Step14)를
 * 새 히스토리 테이블 없이 보여주기 위함이다: 리뷰 행이 REVIEWED 시점의
 * breakdown 전체를 저장해두면, 지금 breakdown과 필드별로 비교해서 바뀐
 * 카테고리만 골라낼 수 있다(전체 변경 이력이 아니라 "마지막 검토 대비
 * 지금"이라는 단일 스냅샷 비교, 계속 O(1) 저장). evidence request는 상태
 * 변화가 review workflow에 영향을 주므로(§4 예시) id/상태/연결 문서만
 * 뽑아 questions 카테고리 해시에 포함한다(생성/수정 시각은 제외 — 아무
 * 실질 변화 없이도 흔들릴 수 있어서).
 */
export function computeCommitteePackFingerprintBreakdown(
  decision: PEICDecision,
  evidenceRequests: PEEvidenceRequestView[]
): PECommitteePackFingerprintBreakdown {
  const evidenceRequestsHashInput = evidenceRequestsMaterial(evidenceRequests);
  const breakdown = {
    financial: sha256(decision.financial),
    qoe: sha256(decision.qoe),
    lbo: sha256(decision.lbo),
    dd: sha256(decision.dd),
    evidence: sha256(decision.evidence),
    questions: sha256({ questions: decision.questions, evidenceRequests: evidenceRequestsHashInput }),
  };
  return {
    overall: sha256({ decision, evidenceRequests: evidenceRequestsHashInput }),
    ...breakdown,
  };
}

export function computeCommitteePackFingerprint(decision: PEICDecision, evidenceRequests: PEEvidenceRequestView[]): string {
  return computeCommitteePackFingerprintBreakdown(decision, evidenceRequests).overall;
}

const FINGERPRINT_CATEGORY_LABEL: Record<Exclude<keyof PECommitteePackFingerprintBreakdown, "overall">, string> = {
  financial: "재무",
  qoe: "QoE",
  lbo: "LBO",
  dd: "DD",
  evidence: "근거",
  questions: "IC 질문",
};

/**
 * 저장된 breakdown과 지금 breakdown을 비교해 바뀐 카테고리 라벨만
 * 돌려준다(§Step14 "Show what changed"). 전체 변경 이력을 저장하지
 * 않는다 — 마지막 REVIEWED 스냅샷과 지금 딱 한 번만 비교한다.
 */
export function diffCommitteePackFingerprintBreakdown(
  previous: PECommitteePackFingerprintBreakdown | null,
  current: PECommitteePackFingerprintBreakdown
): string[] {
  if (!previous) return [];
  const changed: string[] = [];
  for (const key of Object.keys(FINGERPRINT_CATEGORY_LABEL) as Array<keyof typeof FINGERPRINT_CATEGORY_LABEL>) {
    if (previous[key] !== current[key]) changed.push(FINGERPRINT_CATEGORY_LABEL[key]);
  }
  return changed;
}

/** 서버 전용 — content 조립 + fingerprint 계산을 합쳐 완전한 PECommitteePack을 만든다. */
export function buildPECommitteePack(input: PECommitteePackInput): PECommitteePack {
  const content = buildPECommitteePackContent(input);
  const fingerprintBreakdown = computeCommitteePackFingerprintBreakdown(content.decision, input.evidenceRequests);
  return {
    ...content,
    fingerprint: fingerprintBreakdown.overall,
    fingerprintBreakdown,
  };
}

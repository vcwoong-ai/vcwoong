import type { PEEvidenceRequestView } from "./pe-ic-review-types";
import type { PEICDecision } from "./pe-ic-decision-types";

/** Shared canonical material; both displayed content and server validation use this exact serialization. */
export function evidenceRequestsMaterial(evidenceRequests: PEEvidenceRequestView[]) {
  return [...evidenceRequests].sort((a, b) => a.id.localeCompare(b.id)).map(r => ({
    id: r.id, reviewItemSourceId: r.reviewItemSourceId, status: r.status, linkedDocumentId: r.linkedDocumentId,
  }));
}
export async function fingerprintDisplayedCommitteePack(decision: PEICDecision, requests: PEEvidenceRequestView[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ decision, evidenceRequests: evidenceRequestsMaterial(requests) }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

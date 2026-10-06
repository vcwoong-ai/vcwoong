/**
 * PE Committee Pack — 서버 전용 로더(PR #110).
 *
 * export route(DOCX/PPTX), review sign-off route(fingerprint 계산), print
 * 페이지가 전부 똑같이 필요로 하는 조회 시퀀스(`loadMaDealIcContext()` →
 * `buildMaDealDashboard()` → evidence request 조회 → `buildPECommitteePack()`)를
 * 한 곳에 모은다 — pe-ma-deal-context.ts(PR #108)가 IC 화면/메모 export를
 * 위해 이미 한 것과 같은 이유(§10 "여러 곳이 각자 조회하면 나중에 한쪽만
 * 고쳐서 어긋날 위험")로, 이번엔 evidence request 조회까지 포함해 한 단계
 * 더 묶는다.
 *
 * prisma를 직접 다루는 서버 전용 코드다 — 클라이언트 컴포넌트에서
 * import하면 안 된다.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, MADeal } from "@prisma/client";
import { loadMaDealIcContext } from "./pe-ma-deal-context";
import { buildMaDealDashboard } from "./ma-deal-dashboard";
import { listPEEvidenceRequests, type PEDDActor } from "./pe-evidence-request-repository";
import { toPEEvidenceRequestView } from "./pe-ic-review-types";
import { buildPECommitteePack } from "./pe-committee-pack-fingerprint";
import type { PECommitteePack } from "./pe-committee-pack-types";

export interface LoadedPECommitteePack {
  maDeal: MADeal;
  pack: PECommitteePack;
}

export type LoadPECommitteePackResult = { status: "not_found" } | { status: "ok"; data: LoadedPECommitteePack };

export async function loadPECommitteePackForDeal(actor: PEDDActor, maDealId: string, client: Prisma.TransactionClient = prisma): Promise<LoadPECommitteePackResult> {
  const context = await loadMaDealIcContext(actor.userId, actor.teamId, maDealId, client);
  if (context.status === "not_found") return { status: "not_found" };

  const { maDeal, dashboardPeriods, ddCase } = context.data;
  const dashboard = buildMaDealDashboard(dashboardPeriods, ddCase);

  const ddCaseRow = await client.pEDDCase.findUnique({ where: { maDealId }, select: { id: true } });
  const evidenceRequestsResult = ddCaseRow ? await listPEEvidenceRequests(actor, ddCaseRow.id, client) : undefined;
  const evidenceRequests = evidenceRequestsResult?.status === "ok" ? evidenceRequestsResult.data.map((r) => toPEEvidenceRequestView(r)) : [];

  const pack = buildPECommitteePack({
    dealId: maDeal.id,
    maDeal: { companyName: maDeal.companyName, name: maDeal.name, dealType: maDeal.dealType, status: maDeal.status },
    readiness: dashboard.decisionReadiness,
    financialQuality: dashboard.financialQuality,
    qoeSummary: dashboard.qoeSummary,
    lboEntryEbitda: dashboard.lboEntryEbitda,
    dartStatus: dashboard.dartStatus,
    ddCase,
    evidenceRequests,
  });

  return { status: "ok", data: { maDeal, pack } };
}

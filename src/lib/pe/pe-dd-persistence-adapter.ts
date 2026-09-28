/**
 * PE DD Persistence → 순수 DD/Evidence Lineage 구조 변환(PR #105, Step 6).
 *
 * `buildPEDecisionReadiness()`(pe-decision-readiness.ts, PR #103, 수정하지
 * 않음)는 여전히 유일한 readiness 판정처다. 이 파일은 판정을 하지 않는다 —
 * `pe-dd-repository.ts`가 읽어온 DB row를 `dd-types.ts`/
 * `evidence-lineage-types.ts`의 순수 타입으로 옮겨 담고, 조립은 기존 순수
 * 함수(`buildPEDDCase()`, `buildPEEvidenceLineage()`, `createEvidenceSource()`,
 * `createEvidenceItem()` — 전부 dd-lineage.ts/evidence-lineage.ts, 수정 없음)에
 * 위임한다.
 *
 * ## Source/Evidence 1행 → 2노드 펼침
 *
 * `PEEvidence`는 한 행에 Source(출처)와 Evidence(그 안의 구체적 근거)를
 * 함께 담는다(schema.prisma 주석 참고 — PEEvidenceSource/PEEvidenceItem
 * 자체를 DB 테이블로 만들지 않기로 한 설계 결정). 이 어댑터는 매 row마다
 * `createEvidenceSource()`로 합성 source 노드(id: `${row.id}:source`)를,
 * `createEvidenceItem()`으로 evidence 노드(id: row.id — finding.evidenceIds가
 * 참조하는 바로 그 id)를 만든다. 결정론적이고(같은 row → 항상 같은 id 쌍)
 * 손실 없다.
 *
 * ## 이번 PR에서 의도적으로 비워두는 것
 *
 * claims/financialFacts/adjustments/qoeResults/lboBridges는 항상 빈 배열이다
 * — 이 PR은 DD finding/evidence만 영속화하고, QoE/LBO lineage 영속화는
 * 범위 밖이다(PR #103 감사와 동일한 이유 — 아직 실제 딜에 그 데이터를 만들
 * 방법이 없음). 그 결과 `PEDDFinding.financialImpact`/`lboImpact`도 이번
 * PR에서는 절대 채우지 않는다(영속화 스키마 자체에 컬럼이 없음 — schema.prisma
 * 주석 참고) — 지어내는 대신 아예 없는 채로 둔다.
 *
 * `financialPeriodId`가 가리키는 기간은 항상 존재한다 — 이 어댑터가 딜의
 * 모든 MAFinancialPeriod를 빠짐없이 `lineage.periods`에 포함하므로
 * dangling_period가 구조적으로 발생하지 않는다.
 *
 * ## 순수/DB 분리(이 저장소의 test:* 관례 — 라이브 DB 없이 테스트)
 *
 * `buildPEDDCaseFromRows()`는 Prisma row 배열만 받는 순수 함수다(prisma
 * client를 import하지 않음) — qoe-repository.ts의 `toQoEAdjustmentInput()`과
 * 같은 패턴. `loadPEDDCaseForReadiness()`만 실제 DB를 조회하는 얇은 wrapper다.
 */

import { prisma } from "@/lib/prisma";
import type { MAFinancialPeriod, PEDDFinding as PEDDFindingRow, PEEvidence as PEEvidenceRow } from "@prisma/client";
import { createEvidenceSource, createEvidenceItem, buildPEEvidenceLineage } from "./evidence-lineage";
import { buildPEDDCase } from "./dd-lineage";
import type { PEDDCase, PEDDFinding } from "./dd-types";
import type { PEFinancialPeriodIdentity } from "./evidence-lineage-types";

/** DB row 3종(순수 데이터)만으로 PEDDCase를 조립한다 — DB 호출 없음(순수 함수). */
export function buildPEDDCaseFromRows(
  periods: MAFinancialPeriod[],
  findingRows: PEDDFindingRow[],
  evidenceRows: PEEvidenceRow[]
): PEDDCase {
  const periodIdentities: PEFinancialPeriodIdentity[] = periods.map((p) => ({
    id: p.id,
    fiscalYear: p.fiscalYear,
    periodType: p.periodType as PEFinancialPeriodIdentity["periodType"],
    currency: p.currency,
  }));

  const sources = evidenceRows.map((row) =>
    createEvidenceSource({
      id: `${row.id}:source`,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      sourceLocation: row.sourceLocation ?? undefined,
      externalReference: row.externalReference ?? undefined,
      createdAt: row.createdAt.toISOString(),
    })
  );

  const evidenceItems = evidenceRows.map((row) =>
    createEvidenceItem({
      id: row.id,
      sourceId: `${row.id}:source`,
      locator: row.locator ?? undefined,
      excerpt: row.excerpt ?? undefined,
      confidence: row.confidence ?? undefined,
    })
  );

  const evidenceIdsByFinding = new Map<string, string[]>();
  for (const row of evidenceRows) {
    if (!row.findingId) continue;
    const list = evidenceIdsByFinding.get(row.findingId) ?? [];
    list.push(row.id);
    evidenceIdsByFinding.set(row.findingId, list);
  }

  const findings: PEDDFinding[] = findingRows.map((row) => ({
    id: row.id,
    category: row.category,
    subCategory: row.subCategory ?? undefined,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    evidenceIds: evidenceIdsByFinding.get(row.id) ?? [],
    claimIds: [],
    financialPeriodId: row.financialPeriodId ?? undefined,
    owner: row.owner ?? undefined,
    resolution: row.resolution ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }));

  const lineage = buildPEEvidenceLineage({
    periods: periodIdentities,
    sources,
    evidence: evidenceItems,
    claims: [],
    financialFacts: [],
    adjustments: [],
    qoeResults: [],
    lboBridges: [],
  });

  return buildPEDDCase(lineage, findings);
}

/** 딜에 PEDDCase가 없으면 undefined — pe-decision-readiness.ts의 기존 계약
 * ("ddCase 미제공 → NOT_STARTED")을 그대로 만족시킨다(엔진 수정 없음). */
export async function loadPEDDCaseForReadiness(maDealId: string): Promise<PEDDCase | undefined> {
  const ddCase = await prisma.pEDDCase.findUnique({ where: { maDealId } });
  if (!ddCase) return undefined;

  const [periods, findingRows, evidenceRows] = await Promise.all([
    prisma.mAFinancialPeriod.findMany({ where: { maDealId } }),
    prisma.pEDDFinding.findMany({ where: { ddCaseId: ddCase.id } }),
    prisma.pEEvidence.findMany({ where: { ddCaseId: ddCase.id } }),
  ]);

  return buildPEDDCaseFromRows(periods, findingRows, evidenceRows);
}

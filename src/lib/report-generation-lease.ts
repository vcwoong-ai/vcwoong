import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const GENERATION_LEASE_MS = 300_000;
export const GENERATION_HEARTBEAT_MS = 30_000;
export class GenerationLeaseLost extends Error {
  constructor() { super("Generation lease lost"); this.name = "GenerationLeaseLost"; }
}
export function generationLeaseWhere(reportId: string, token: string, now = new Date()): Prisma.ReportWhereInput {
  return { id: reportId, status: "GENERATING", generationClaim: token, generationLeaseExpiresAt: { gt: now } };
}
export function staleGenerationWhere(staleMs: number, now = new Date()): Prisma.ReportWhereInput {
  return { status: "GENERATING", OR: [
    { generationLeaseExpiresAt: { lte: now } },
    { generationLeaseExpiresAt: null, updatedAt: { lt: new Date(now.getTime() - staleMs) } },
  ] };
}
export function activeGenerationWhere(staleMs: number, now = new Date()): Prisma.ReportWhereInput {
  return { OR: [
    { generationClaim: { not: null }, generationLeaseExpiresAt: { gt: now } },
    { status: "GENERATING", generationLeaseExpiresAt: { gt: now } },
    { status: "GENERATING", generationLeaseExpiresAt: null, updatedAt: { gte: new Date(now.getTime() - staleMs) } },
  ] };
}
function availableClaimWhere(now: Date): Prisma.ReportWhereInput {
  return { OR: [{ generationClaim: null }, { generationLeaseExpiresAt: null }, { generationLeaseExpiresAt: { lte: now } }] };
}
export async function claimGeneration(tx: Prisma.TransactionClient, reportId: string, staleMs: number): Promise<string | null> {
  const report = await tx.report.findFirst({ where: { id: reportId }, select: { dealId: true } });
  if (!report) return null;
  // Same-deal resume/new creation use the same lock, preventing overlapping reports.
  const deal = await tx.deal.updateMany({ where: { id: report.dealId }, data: { updatedAt: new Date() } });
  if (deal.count !== 1) return null;
  const competing = await tx.report.findFirst({ where: { dealId: report.dealId, id: { not: reportId }, ...activeGenerationWhere(staleMs) }, select: { id: true } });
  if (competing) return null;
  const token = randomUUID();
  const now = new Date();
  const claimed = await tx.report.updateMany({
    where: { id: reportId, AND: [availableClaimWhere(now),
      { OR: [{ status: { not: "GENERATING" } }, staleGenerationWhere(staleMs, now)] }] },
    data: { status: "GENERATING", generationClaim: token, generationLeaseExpiresAt: new Date(now.getTime() + GENERATION_LEASE_MS) },
  });
  return claimed.count === 1 ? token : null;
}
export function sectionGenerationLeaseWhere(reportId: string, token: string, now = new Date()): Prisma.ReportWhereInput {
  return { id: reportId, status: { not: "GENERATING" }, generationClaim: token, generationLeaseExpiresAt: { gt: now } };
}
/** A report-wide section reservation preserves review status, serializing all section/model work. */
export async function claimSectionGeneration(tx: Prisma.TransactionClient, reportId: string, staleMs: number,
  expectedReportUpdatedAt: Date): Promise<{ token: string; updatedAt: Date } | null> {
  const report = await tx.report.findFirst({ where: { id: reportId }, select: { dealId: true } });
  if (!report) return null;
  const now = new Date();
  const deal = await tx.deal.updateMany({ where: { id: report.dealId }, data: { updatedAt: now } });
  if (deal.count !== 1) return null;
  const competing = await tx.report.findFirst({ where: { dealId: report.dealId, id: { not: reportId },
    ...activeGenerationWhere(staleMs, now) }, select: { id: true } });
  if (competing) return null;
  const token = randomUUID();
  const claimed = await tx.report.updateMany({ where: { id: reportId, status: { not: "GENERATING" },
    updatedAt: expectedReportUpdatedAt, ...availableClaimWhere(now) },
  data: { generationClaim: token, generationLeaseExpiresAt: new Date(now.getTime() + GENERATION_LEASE_MS), updatedAt: now } });
  return claimed.count === 1 ? { token, updatedAt: now } : null;
}
/** Release only our non-GENERATING token. Preserve the observed content revision so a release
 * cannot invalidate another editor's snapshot or roll review status backward. Bounded retry
 * handles one concurrent manual edit; otherwise expiry provides recovery without overwriting it.
 */
export async function releaseSectionGeneration(reportId: string, token: string): Promise<boolean> {
  return prisma.$transaction(async tx => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const report = await tx.report.findFirst({ where: { id: reportId, generationClaim: token,
        status: { not: "GENERATING" } }, select: { updatedAt: true } });
      if (!report) return false;
      const released = await tx.report.updateMany({ where: { id: reportId, generationClaim: token,
        status: { not: "GENERATING" }, updatedAt: report.updatedAt },
      data: { generationClaim: null, generationLeaseExpiresAt: null, updatedAt: report.updatedAt } });
      if (released.count === 1) return true;
    }
    return false;
  });
}
export async function renewGenerationLease(reportId: string, token: string, currentSectionTitle?: string | null) {
  const now = new Date();
  const renewed = await prisma.report.updateMany({
    where: generationLeaseWhere(reportId, token, now),
    data: { generationLeaseExpiresAt: new Date(now.getTime() + GENERATION_LEASE_MS), ...(currentSectionTitle !== undefined ? { currentSectionTitle } : {}) },
  });
  if (renewed.count !== 1) throw new GenerationLeaseLost();
}
export function publicGenerationReport<T extends object>(report: T): Omit<T, "generationClaim" | "generationLeaseExpiresAt"> {
  const copy = { ...report } as T & { generationClaim?: unknown; generationLeaseExpiresAt?: unknown };
  delete copy.generationClaim;
  delete copy.generationLeaseExpiresAt;
  return copy;
}

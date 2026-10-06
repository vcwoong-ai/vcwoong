/** Real PostgreSQL revision checks with disposable synthetic records; no export/provider execution. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";

let stage = "environment";
async function main() {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3119");
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const { prisma } = await import("../src/lib/prisma");
  const { loadReportForExport, markExported } = await import("../src/lib/report-export-common");
  let userId: string | undefined;
  const token = randomUUID();
  try {
    stage = "synthetic seed";
    const user = await prisma.user.create({ data: { email: `export-state-${token}@example.com`, role: "PARTNER", subscriptionPlan: "FULL", subscriptionStatus: "ACTIVE" } });
    userId = user.id;
    const deal = await prisma.deal.create({ data: { name: "합성 버전 검사", companyName: "합성 회사", sector: "GENERAL", userId: user.id } });
    const report = await prisma.report.create({ data: { dealId: deal.id, title: "합성 보고서", agentType: "GENERAL", status: "FINAL", sections: { create: { sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", content: "합성 본문 A", order: 0, status: "APPROVED" } } }, include: { sections: true } });
    async function capture() {
      const loaded = await loadReportForExport(user.id, report.id);
      if ("error" in loaded) throw new Error("Synthetic export input unavailable");
      return loaded.exportState;
    }
    stage = "stale A cannot mark reapproved B";
    const initial = await capture();
    await prisma.report.update({ where: { id: report.id }, data: { status: "FINAL", sections: { update: { where: { id: report.sections[0].id }, data: { content: "합성 수정 본문 B", status: "APPROVED" } } } } });
    assert.equal(await markExported(report.id, initial), false);
    assert.equal((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status, "FINAL");
    stage = "changed deal input without report timestamp change";
    const bodySame = await capture();
    const before = (await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).updatedAt.getTime();
    await prisma.deal.update({ where: { id: deal.id }, data: { companyName: "합성 회사 변경" } });
    assert.equal((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).updatedAt.getTime(), before);
    assert.equal(await markExported(report.id, bodySame), false);
    stage = "evidence change without report timestamp change";
    const beforeEvidence = await capture();
    const evidenceTimestamp = (await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).updatedAt.getTime();
    await prisma.reportEvidenceCheck.create({ data: { reportId: report.id, verdicts: [], modelUsed: "synthetic-test-only" } });
    assert.equal((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).updatedAt.getTime(), evidenceTimestamp);
    assert.equal(await markExported(report.id, beforeEvidence), false);
    stage = "same approved input records exported once";
    const latest = await capture();
    assert.equal(await markExported(report.id, latest), true);
    assert.equal((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status, "EXPORTED");
    assert.equal(await markExported(report.id, latest), false);
    stage = "draft download cannot mark later final";
    await prisma.report.update({ where: { id: report.id }, data: { status: "DRAFT" } });
    const draft = await capture();
    await prisma.report.update({ where: { id: report.id }, data: { status: "FINAL" } });
    assert.equal(await markExported(report.id, draft), false);
    stage = "generation state preserved";
    const final = await capture();
    await prisma.report.update({ where: { id: report.id }, data: { status: "GENERATING" } });
    assert.equal(await markExported(report.id, final), false);
    console.log("PASS PostgreSQL export input revision: stale reapproved/body/header skip, same final records, draft/generation preserved; no file/provider generation");
  } finally {
    try {
      if (userId) {
        await prisma.$transaction([prisma.deal.deleteMany({ where: { userId } }), prisma.user.deleteMany({ where: { id: userId } })]);
        assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
        assert.equal(await prisma.deal.count({ where: { userId } }), 0);
        console.log("PASS synthetic export revision cleanup");
      }
    } finally { await prisma.$disconnect(); }
  }
}
main().catch(() => { console.error(`EXPORT_STATE_INTEGRATION_FAILED stage=${stage}; private details withheld`); process.exitCode = 1; });

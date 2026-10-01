/** Measures real canonical batch loader using disposable SQLite rows; no production instrumentation. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db", "isolated SQLite only");
  const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  // The loader imports the existing singleton; use the actual DB client with query events.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { loadMaDealListReadinessSummaries: load } = await import("../src/lib/pe/ma-deal-list-readiness");
  let queries = 0;
  db.$on("query", () => { queries++; }); // Never retain SQL, parameters or IDs.
  const user = await db.user.create({ data: { email: `batch-perf-${Date.now()}@example.com` } });
  try {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const deal = await db.mADeal.create({ data: { name: "배치 측정 예시", companyName: "합성 기업", userId: user.id, dealType: "BUYOUT" } });
      ids.push(deal.id);
      await db.mAFinancialPeriod.create({ data: {
        maDealId: deal.id, fiscalYear: 2024, periodType: "ANNUAL", currency: "KRW",
        startDate: new Date("2024-01-01"), endDate: new Date("2024-12-31"),
        lineItems: { create: { statementType: "INCOME_STATEMENT", lineItem: "REVENUE", value: 100, currency: "KRW", source: "MANUAL" } },
      } });
      await db.pEDDCase.create({ data: { maDealId: deal.id } });
    }
    const results = [];
    queries = 0;
    assert.deepEqual(await load([], user.id), {});
    assert.equal(queries, 0, "empty input requires no queries");
    for (const count of [1, 10, 30]) {
      const permitted = await db.mADeal.findMany({ where: { id: { in: ids.slice(0, count) }, userId: user.id }, select: { id: true } });
      const batch = permitted.map(d => d.id); // Caller-owned IDs only; loader is not an auth boundary.
      await load(batch, user.id); // Unreported warmup.
      const samples = [];
      for (let run = 0; run < 5; run++) {
        queries = 0;
        const start = performance.now();
        const summary = await load(batch, user.id);
        const milliseconds = performance.now() - start;
        assert.equal(Object.keys(summary).length, count);
        assert(Object.values(summary).every(s => s.overall !== "READY"), "incomplete fixture stays incomplete");
        samples.push({ milliseconds: Number(milliseconds.toFixed(2)), queries });
      }
      results.push({ count, samples });
    }
    const queryCounts = results.flatMap(r => r.samples.map(s => s.queries));
    assert(queryCounts[0] > 0);
    assert(queryCounts.every(n => n === queryCounts[0]), "queries stay constant with 1/10/30 populated deals");
    mkdirSync("screenshots/week4", { recursive: true });
    writeFileSync("screenshots/week4/batch-performance.json", JSON.stringify({ database: "local SQLite", warmup: 1, runs: 5, results }, null, 2));
    console.log("PASS: real batch queries constant, empty input 0 queries, incomplete data not READY", JSON.stringify(results));
  } finally {
    await db.mADeal.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

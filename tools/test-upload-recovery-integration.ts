/** Actual PostgreSQL compare-and-swap races, expired-worker fencing, and legacy recovery. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";
import { queuedRecovery, readRecoveryState, claimDocumentRecovery, claimTemplateRecovery, completeDocumentRecovery, completeTemplateRecovery, recoverDocument, recoverTemplate, UPLOAD_LEASE_MS, MAX_UPLOAD_ATTEMPTS, LEGACY_PENDING_WARNING } from "../src/lib/upload-recovery";
import { prisma as recoveryDb } from "../src/lib/prisma";
import { Document as WordDocument, Packer, Paragraph, HeadingLevel } from "docx";

async function main() {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3100");
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  assert.equal(process.env.STORAGE_MODE, "local");
  assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
  const { uploadFile, deleteStoredFile } = await import("../src/lib/storage");
  const storedFiles: string[] = [];
  const db = new PrismaClient();
  const prefix = `e2e-recovery-${randomUUID()}`;
  let userId: string | undefined;
  let dealId: string | undefined;
  const now = Date.now();
  const json = (value: unknown) => JSON.parse(JSON.stringify(value));
  try {
    const user = await db.user.create({ data: { email: `${prefix}@example.com`, name: prefix } });
    userId = user.id;
    const deal = await db.deal.create({ data: { name: prefix, companyName: prefix, sector: "GENERAL", userId } });
    dealId = deal.id;
    const document = await db.document.create({ data: {
      dealId, name: "synthetic.txt", type: "OTHER", url: `private-local:${prefix}/not-read.txt`, size: 5, mimeType: "text/plain",
      metadata: json({ __uploadRecovery: queuedRecovery(now) }),
    } });
    const racers = await Promise.all(Array.from({ length: 8 }, () => claimDocumentRecovery(document.id, now)));
    const winners = racers.filter(claim => claim !== null);
    assert.equal(winners.length, 1, "document CAS must grant exactly one concurrent worker");
    const first = winners[0]!;
    assert.equal(await claimDocumentRecovery(document.id, now + 1), null);
    const takeover = await claimDocumentRecovery(document.id, now + UPLOAD_LEASE_MS + 1);
    assert(takeover);
    assert.equal(takeover.lease.attempt, 2);
    assert.equal(await completeDocumentRecovery(first, "stale worker content", {}, now + 1), false, "CAS fences a stale worker with an old clock");
    assert.equal(await completeDocumentRecovery(takeover, "fresh worker content", { charCount: 20 }, now + UPLOAD_LEASE_MS + 2), true);
    assert.equal(await completeDocumentRecovery(takeover, "duplicate commit", {}, now + UPLOAD_LEASE_MS + 3), false);
    const saved = await db.document.findUniqueOrThrow({ where: { id: document.id } });
    assert.equal(saved.parsedText, "fresh worker content");
    assert.equal(readRecoveryState(saved.metadata)?.status, "complete");
    assert.equal(await claimDocumentRecovery(document.id, now + 2 * UPLOAD_LEASE_MS), null);

    const legacy = await db.document.create({ data: {
      dealId, name: "legacy.txt", type: "OTHER", url: `private-local:${prefix}/not-read-legacy.txt`, size: 5, mimeType: "text/plain",
      metadata: { warning: LEGACY_PENDING_WARNING }, createdAt: new Date(now - UPLOAD_LEASE_MS - 1),
    } });
    assert(await claimDocumentRecovery(legacy.id, now), "old pending document can be recovered without a marker");
    const freshLegacy = await db.document.create({ data: {
      dealId, name: "fresh.txt", type: "OTHER", url: `private-local:${prefix}/not-read-fresh.txt`, size: 5, mimeType: "text/plain",
      metadata: { warning: LEGACY_PENDING_WARNING }, createdAt: new Date(now),
    } });
    assert.equal(await claimDocumentRecovery(freshLegacy.id, now), null, "fresh legacy work is not stolen");
    const limit = await db.document.create({ data: {
      dealId, name: "limit.txt", type: "OTHER", url: `private-local:${prefix}/not-read-limit.txt`, size: 5, mimeType: "text/plain",
      metadata: json({ __uploadRecovery: { ...queuedRecovery(now), status: "running", attempt: MAX_UPLOAD_ATTEMPTS, token: "terminated", leaseExpiresAt: now - 1 } }),
    } });
    assert.equal(await claimDocumentRecovery(limit.id, now), null);
    assert.equal(readRecoveryState((await db.document.findUniqueOrThrow({ where: { id: limit.id } })).metadata)?.status, "failed");

    const template = await db.template.create({ data: {
      name: prefix, userId, fileType: "DOCX", originalName: "synthetic.docx", fileUrl: `private-local:${prefix}/not-read.docx`, fileSize: 5,
      status: "ANALYZING", structure: json({ __uploadRecovery: queuedRecovery(now) }),
    } });
    const templateRaces = await Promise.all(Array.from({ length: 8 }, () => claimTemplateRecovery(template.id, now)));
    const templateWinners = templateRaces.filter(claim => claim !== null);
    assert.equal(templateWinners.length, 1, "template CAS must grant exactly one concurrent worker");
    const templateFirst = templateWinners[0]!;
    assert.equal(await claimTemplateRecovery(template.id, now + 1), null);
    const templateTakeover = await claimTemplateRecovery(template.id, now + UPLOAD_LEASE_MS + 1);
    assert(templateTakeover);
    assert.equal(await completeTemplateRecovery(templateFirst, { stale: true }, {}, now + 1), false);
    assert.equal(await completeTemplateRecovery(templateTakeover, { sections: [], fresh: true }, { mappings: [] }, now + UPLOAD_LEASE_MS + 2), true);
    assert.equal(await completeTemplateRecovery(templateTakeover, { duplicate: true }, {}, now + UPLOAD_LEASE_MS + 3), false);
    const savedTemplate = await db.template.findUniqueOrThrow({ where: { id: template.id } });
    assert.equal(savedTemplate.status, "READY");
    assert.deepEqual(savedTemplate.structure, { sections: [], fresh: true });
    const legacyTemplate = await db.template.create({ data: {
      name: `${prefix}-legacy`, userId, fileType: "DOCX", originalName: "legacy.docx", fileUrl: `private-local:${prefix}/not-read-legacy.docx`, fileSize: 5,
      status: "ANALYZING", updatedAt: new Date(now - UPLOAD_LEASE_MS - 1),
    } });
    assert(await claimTemplateRecovery(legacyTemplate.id, now), "legacy ANALYZING row can be recovered");
    const textBytes = Buffer.from(`Synthetic recovered upload ${prefix}`);
    const textFile = await uploadFile(textBytes, `${prefix}/recovery.txt`, "text/plain");
    storedFiles.push(textFile);
    const terminatedState = { ...queuedRecovery(0), status: "running", token: "terminated-worker", attempt: 1, leaseExpiresAt: now - 1 };
    const terminatedDocument = await db.document.create({ data: {
      dealId, name: "recovery.txt", type: "OTHER", url: textFile, size: textBytes.length, mimeType: "text/plain",
      metadata: json({ __uploadRecovery: terminatedState }),
    } });
    assert.equal(await recoverDocument(terminatedDocument.id), true, "real worker recovers a terminated reservation from synthetic local bytes");
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: terminatedDocument.id } })).parsedText, textBytes.toString());
    assert.equal(await recoverDocument(terminatedDocument.id), false, "completed document cannot be parsed twice");
    const templateBytes = await Packer.toBuffer(new WordDocument({ sections: [{ children: [
      new Paragraph({ text: "1. 투자개요", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Synthetic recovery template sample text."),
    ] }] }));
    const templateFile = await uploadFile(templateBytes, `${prefix}/recovery.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    storedFiles.push(templateFile);
    const terminatedTemplate = await db.template.create({ data: {
      name: `${prefix}-terminated`, userId, fileType: "DOCX", originalName: "recovery.docx", fileUrl: templateFile, fileSize: templateBytes.length,
      status: "ANALYZING", structure: json({ __uploadRecovery: terminatedState }),
    } });
    assert.equal(await recoverTemplate(terminatedTemplate.id), true, "real template worker parses/maps known headings without an AI call");
    assert.equal((await db.template.findUniqueOrThrow({ where: { id: terminatedTemplate.id } })).status, "READY");
    assert.equal(await recoverTemplate(terminatedTemplate.id), false);
    const unavailable = await db.document.create({ data: {
      dealId, name: "missing.txt", type: "OTHER", url: `private-local:${prefix}/missing.txt`, size: 5, mimeType: "text/plain",
      metadata: json({ __uploadRecovery: queuedRecovery(0) }),
    } });
    assert.equal(await recoverDocument(unavailable.id), false, "unavailable local bytes leave retryable state");
    const failedState = readRecoveryState((await db.document.findUniqueOrThrow({ where: { id: unavailable.id } })).metadata);
    assert.equal(failedState?.status, "queued");
    assert(failedState!.retryAfter > Date.now());
    assert.equal(await recoverDocument(unavailable.id), false, "worker respects failure backoff");
    console.log("PostgreSQL upload recovery CAS/stale fencing/legacy/retry cap plus real synthetic local VC/template parsing recovery passed; no provider calls.");
  } finally {
    try {
      await db.$transaction([
        db.deal.deleteMany({ where: { id: { in: dealId ? [dealId] : [] } } }),
        db.template.deleteMany({ where: { userId: { in: userId ? [userId] : [] } } }),
        db.user.deleteMany({ where: { id: { in: userId ? [userId] : [] } } }),
      ]);
    } finally {
      try { for (const file of storedFiles) assert(await deleteStoredFile(file), "synthetic recovery file cleanup failed"); }
      finally { await Promise.allSettled([db.$disconnect(), recoveryDb.$disconnect()]); }
    }
  }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Isolated upload recovery integration failed; no credentials logged."); process.exitCode = 1; });

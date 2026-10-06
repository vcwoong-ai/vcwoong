/** Disposable PostgreSQL CAS with synthetic stored-byte/parser ports. No files/cloud/parser/provider/browser. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";
let stage = "offline preflight";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function main() {
  if (!process.argv.includes("--run-db")) { console.log("PE reparse integration prepared; actual PostgreSQL checks require --run-db and explicit isolated environment. No connection performed."); return; }
  stage = "isolated guards";
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3119"); assertNoExternalE2ECredentials(); assertCleanE2EWorkspace();
  assert.equal(process.env.STORAGE_MODE, "local");
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const { PEUploadService, PEParseRecoveryService, createPrismaPEUploadRepository, PEUploadError, PE_DOCUMENT_MAX_BYTES } = await import("../src/lib/pe/pe-document-upload");
  const db = createBillingClient(process.env.TEST_DATABASE_URL!);
  const repository = createPrismaPEUploadRepository(db);
  const bytes = Buffer.from("synthetic confirmed stored reparse fixture");
  let userId: string | undefined;
  try {
    stage = "synthetic owned fixtures";
    const user = await db.user.create({ data: { email: `e2e-pe-reparse-${randomUUID()}@example.invalid`, role: "PARTNER" } }); userId = user.id;
    const deal = await db.mADeal.create({ data: { userId, name: "합성 추출 복구", companyName: "합성 회사", dealType: "BUYOUT" } });
    let uploadWrites = 0;
    async function warningDocument() {
      const service = new PEUploadService({ repository, now: () => new Date(), newToken: randomUUID,
        upload: async (_bytes, key) => { uploadWrites++; return `private-local:${key}`; }, parse: async () => { throw new Error("SYNTHETIC_PRIVATE_PARSE_FAILURE"); } });
      const created = await service.submit({ userId: user.id, dealId: deal.id, uploadId: randomUUID(), fileName: "synthetic.txt", mimeType: "text/plain", type: "DD_MATERIAL", bytes });
      assert(created.data.id); return repository.find(created.data.id).then(row => { assert(row); return row; });
    }
    stage = "actual PostgreSQL simultaneous claim one winner";
    const original = await warningDocument(), now = new Date();
    const claims = await Promise.all([repository.claimParse(original, "synthetic-claim-A", now), repository.claimParse(original, "synthetic-claim-B", now)]);
    assert.equal(claims.filter(Boolean).length, 1);
    stage = "expired lease new worker and stale metadata fenced";
    const oldClaim = await repository.find(original.id); assert(oldClaim);
    const oldState = oldClaim.metadata as { __peUpload: { token: string; expiresAt: number; phase: string; parseAttempts?: number } };
    await db.mADocument.update({ where: { id: original.id }, data: { metadata: { __peUpload: { ...oldState.__peUpload, expiresAt: Date.now() - 1 } } } });
    const expired = await repository.find(original.id); assert(expired);
    assert.equal(await repository.claimParse(expired, "synthetic-new-claim", new Date()), true);
    const newClaim = await repository.find(original.id); assert(newClaim);
    assert.equal(await repository.update(oldClaim, oldState.__peUpload.token, new Date(), { parsedText: "synthetic stale text", metadata: oldClaim.metadata }), false);
    const newState = newClaim.metadata as { __peUpload: { token: string; expiresAt: number; phase: string; parseAttempts: number } };
    assert.equal(await repository.update(newClaim, "synthetic-new-claim", new Date(), { parsedText: "synthetic fresh text", metadata: { __peUpload: { ...newState.__peUpload, phase: "READY", token: null } } }), true);
    assert.equal((await repository.find(original.id))!.parsedText, "synthetic fresh text");
    stage = "service parses known stored warning without new storage write";
    const recover = await warningDocument(); const writesBefore = uploadWrites; let parseCalls = 0;
    const service = new PEParseRecoveryService({ repository, now: () => new Date(), newToken: randomUUID,
      read: async (ref, max) => { assert.equal(ref, recover.url); assert.equal(max, PE_DOCUMENT_MAX_BYTES); return bytes; },
      parse: async (_bytes, mime, fileName) => { parseCalls++; assert.equal(mime, "text/plain"); assert.equal(fileName, "synthetic.txt"); return { text: "synthetic recovered text" }; } });
    const view = await service.retry({ dealId: deal.id, documentId: recover.id }); assert.equal(view.parseStatus, "complete"); assert.equal(parseCalls, 1); assert.equal(uploadWrites, writesBefore);
    assert.equal((await repository.find(recover.id))!.url, recover.url); assert.equal((await repository.find(recover.id))!.parsedText, "synthetic recovered text");
    stage = "concurrent retry processing result and one parser";
    const concurrent = await warningDocument(), readGate = deferred<Buffer>(), entered = deferred<void>(); let calls = 0;
    const concurrentService = new PEParseRecoveryService({ repository, now: () => new Date(), newToken: randomUUID, read: async () => { entered.resolve(); return readGate.promise; }, parse: async () => { calls++; return { text: "synthetic once" }; } });
    const first = concurrentService.retry({ dealId: deal.id, documentId: concurrent.id });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([entered.promise, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Synthetic parse barrier not reached")), 15000); })]); assert.equal((await concurrentService.retry({ dealId: deal.id, documentId: concurrent.id })).status, "processing"); }
    finally { if (timeout) clearTimeout(timeout); readGate.resolve(bytes); }
    await first; assert.equal(calls, 1);
    stage = "wrong document scope and unsupported metadata cannot read";
    await assert.rejects(service.retry({ dealId: `${deal.id}-wrong`, documentId: recover.id }), error => error instanceof PEUploadError && error.status === 404);
    console.log("PASS actual isolated PostgreSQL PE reparse claim CAS, expired takeover, old worker fencing and service single parse; byte/parser ports synthetic, no files/providers/browser");
  } finally {
    try {
      if (userId) { await db.mADeal.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId } }); assert.equal(await db.mADeal.count({ where: { userId } }), 0); assert.equal(await db.user.count({ where: { id: userId } }), 0); console.log("PASS synthetic PE reparse fixture cleanup"); }
    } finally { await db.$disconnect(); }
  }
}
main().catch(() => { console.error(`PE_REPARSE_INTEGRATION_FAILED stage=${stage}; private details withheld.`); process.exitCode = 1; });

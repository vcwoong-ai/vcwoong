/** Offline adversarial checks; no database, external provider, or real key required. */
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createUploadGrant, verifyUploadGrant, validateUploadFile, MAX_UPLOAD_BYTES, publicDocument, publicTemplate, attachmentHeaders, type UploadClaims } from "../src/lib/upload-security";
import { safeStorageKey, readBoundedResponse, assertPrivateBlobUploads, configuredLegacyPublicBlobHosts, readStoredFile } from "../src/lib/storage";

async function main() {
  const signingKey = randomBytes(32).toString("hex");
  const now = 1_000_000;
  const input = { userId: "fixture-owner", scope: "deal" as const, resourceId: "fixture-deal", fileName: "fixture.pdf", mimeType: "application/pdf", fileSize: 5 };
  const grant = createUploadGrant(input, signingKey, now);
  const claims = verifyUploadGrant(grant.binding, input.userId, "deal", input.resourceId, signingKey, now);
  assert.equal(claims.pathname, grant.pathname);
  assert.equal(claims.expiresAt, now + 15 * 60_000);
  assert.equal(verifyUploadGrant(grant.binding, input.userId, "deal", input.resourceId, signingKey, now).uploadId, claims.uploadId, "retries retain the same registration identity");
  assert.notEqual(createUploadGrant(input, signingKey, now).pathname, grant.pathname, "different uploads cannot overwrite each other");
  assert.throws(() => verifyUploadGrant(grant.binding, "other-user", "deal", input.resourceId, signingKey, now));
  assert.throws(() => verifyUploadGrant(grant.binding, input.userId, "template", undefined, signingKey, now));
  assert.throws(() => verifyUploadGrant(grant.binding, input.userId, "deal", "other-deal", signingKey, now));
  assert.throws(() => verifyUploadGrant(grant.binding, input.userId, "deal", input.resourceId, "wrong-synthetic-key", now));
  assert.throws(() => verifyUploadGrant(grant.binding, input.userId, "deal", input.resourceId, signingKey, claims.expiresAt));
  const [payload] = grant.binding.split(".");
  const editedPayload = Buffer.from(JSON.stringify({ ...claims, fileSize: 6 })).toString("base64url");
  assert.throws(() => verifyUploadGrant(grant.binding.replace(payload, editedPayload), input.userId, "deal", input.resourceId, signingKey, now));
  // Correctly signed malformed claims still require semantic validation.
  function signedClaims(change: Partial<UploadClaims>) {
    const encoded = Buffer.from(JSON.stringify({ ...claims, ...change })).toString("base64url");
    return `${encoded}.${createHmac("sha256", signingKey).update(`dealmind-upload-v1:${encoded}`).digest("base64url")}`;
  }
  for (const change of [
    { pathname: "deals/fixture-deal/uploads/../escape.pdf" },
    { pathname: "deals/other-deal/uploads/fixture.pdf" },
    { uploadId: "different-identity" }, { mimeType: "text/html" },
    { fileSize: MAX_UPLOAD_BYTES + 1 }, { fileSize: 0 }, { expiresAt: now - 1 },
    { expiresAt: now + 15 * 60_000 + 1 },
  ]) assert.throws(() => verifyUploadGrant(signedClaims(change), input.userId, "deal", input.resourceId, signingKey, now));
  const template = createUploadGrant({ userId: input.userId, scope: "template", fileName: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: 5 }, signingKey, now);
  assert.match(template.pathname, /^templates\/fixture-owner\/[a-f0-9-]+\.docx$/);
  assert.equal(verifyUploadGrant(template.binding, input.userId, "template", undefined, signingKey, now).scope, "template");
  assert.equal(validateUploadFile({ ...input, fileSize: MAX_UPLOAD_BYTES }, "deal"), "pdf");
  for (const change of [{ fileName: "../fixture.pdf" }, { fileName: "fixture.html" }, { mimeType: "text/plain" }, { fileSize: -1 }, { fileSize: 1.5 }, { fileSize: Number.NaN }]) {
    assert.throws(() => validateUploadFile({ ...input, ...change }, "deal"));
  }
  assert.throws(() => validateUploadFile(input, "template"), "PDF cannot be registered as a template");
  assert.equal(safeStorageKey("deals/fixture/file.pdf"), "deals/fixture/file.pdf");
  for (const key of ["../file", "/absolute", "C:\\file", "deals//file", "deals/./file", "deals/%2e%2e/file", "deals/file?query", "deals/file#fragment", "deals/file\u0000"]) assert.throws(() => safeStorageKey(key));
  const serialized = publicDocument({ id: "fixture-document", url: "private-local:fixture.pdf", name: "fixture.pdf", metadata: { images: [{ url: "private-local:image.png" }], warning: "retained", __uploadRecovery: { token: "synthetic-internal-worker" } } });
  assert(!JSON.stringify(serialized).includes("private-local:"));
  assert(!JSON.stringify(serialized).includes("synthetic-internal-worker"), "worker lease markers must stay server-only");
  assert.equal(serialized.downloadUrl, "/api/documents/fixture-document/download");
  assert.equal((serialized.metadata as Record<string, unknown>).warning, "retained");
  assert.equal(publicTemplate({ id: "fixture-template", fileUrl: "private-local:fixture.docx" }).fileUrl, "/api/templates/fixture-template/download");
  const serializedTemplate = publicTemplate({ id: "fixture-template", fileUrl: "private-local:fixture.docx", structure: { __uploadRecovery: { token: "synthetic-internal-worker" } } });
  assert.equal(serializedTemplate.structure, null);
  const headers = attachmentHeaders("unsafe\r\nheader.pdf");
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert(!headers["Content-Disposition"].includes("\r"));
  assert.deepEqual(await readBoundedResponse(new Response("small"), 5), Buffer.from("small"));
  await assert.rejects(() => readBoundedResponse(new Response("large", { headers: { "content-length": "100" } }), 5));
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(() => readBoundedResponse(new Response(stream), 5));
  assert(canceled, "oversize streams must stop consuming bytes");
  const names = ["BLOB_STORE_ACCESS", "BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN", "BLOB_LEGACY_PUBLIC_STORE_IDS"] as const;
  const original = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.throws(() => assertPrivateBlobUploads(), "missing configuration must reject uploads");
    process.env.BLOB_STORE_ACCESS = "public";
    process.env.BLOB_STORE_ID = "Fixture123";
    process.env.BLOB_READ_WRITE_TOKEN = "synthetic-never-sent-to-provider";
    assert.throws(() => assertPrivateBlobUploads(), "public stores must reject private uploads");
    process.env.BLOB_STORE_ACCESS = "private";
    assert.doesNotThrow(() => assertPrivateBlobUploads());
    process.env.BLOB_LEGACY_PUBLIC_STORE_IDS = "store_OldFixture456, invalid.example, ../bad";
    assert.deepEqual(configuredLegacyPublicBlobHosts(), ["oldfixture456.public.blob.vercel-storage.com"]);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async (_input, options) => {
        calls++;
        assert.deepEqual(options?.headers, {}, "legacy public reads do not send private credentials");
        return new Response("legacy fixture");
      };
      assert.deepEqual(await readStoredFile("https://oldfixture456.public.blob.vercel-storage.com/fixture.txt"), Buffer.from("legacy fixture"));
      assert.equal(await readStoredFile("https://untrusted.public.blob.vercel-storage.com/fixture.txt"), null);
      assert.equal(calls, 1, "only explicitly configured legacy store hosts can be read");
    } finally { globalThis.fetch = originalFetch; }
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  }
  console.log("Offline upload grants, scope/tamper/expiry/idempotency, private serialization, bounded reads and store guards passed.");
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Offline upload security regression failed."); process.exitCode = 1; });

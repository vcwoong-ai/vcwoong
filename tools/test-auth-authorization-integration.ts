/** Real NextAuth + VC/PE HTTP authorization against an explicitly isolated application/database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { request, type APIRequestContext } from "playwright";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";
import { createUploadGrant } from "../src/lib/upload-security";
import { queuedRecovery } from "../src/lib/upload-recovery";

const base = process.env.BASE_URL ?? "http://localhost:3100";

async function main() {
  assertE2ETarget(base);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  assert.equal(process.env.STORAGE_MODE, "local", "integration requires local synthetic storage");
  assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads", "integration requires dedicated test upload directory");
  const { uploadFile, deleteStoredFile } = await import("../src/lib/storage");
  const db = new PrismaClient();
  const prefix = `e2e-auth-${randomUUID()}`;
  const password = randomUUID() + "aA1!";
  const contexts: APIRequestContext[] = [];
  let teamId: string | undefined;
  const users: string[] = [];
  const vcIds: string[] = [];
  const peIds: string[] = [];
  const templateIds: string[] = [];
  const downloads: { path: string; shared: boolean }[] = [];
  const fixtureBytes = Buffer.from(`synthetic authorized download ${prefix}`);
  let storedFile: string | undefined;
  const ip = `2001:db8:3::${Date.now().toString(16).slice(-4)}`;
  async function context() {
    const client = await request.newContext({ baseURL: base, extraHTTPHeaders: { "x-forwarded-for": ip } });
    contexts.push(client);
    return client;
  }
  async function login(email: string, suppliedPassword: string, expectedId?: string, expectedRole?: string) {
    const client = await context();
    const csrf = await client.get("/api/auth/csrf");
    assert.equal(csrf.status(), 200);
    const { csrfToken } = await csrf.json();
    await client.post("/api/auth/callback/credentials", {
      form: { email, password: suppliedPassword, csrfToken, callbackUrl: `${base}/dashboard`, json: "true" },
      maxRedirects: 0,
    });
    const session = await (await client.get("/api/auth/session")).json();
    if (expectedId) {
      assert.equal(session.user?.id, expectedId, "login must preserve account identity");
      assert.equal(session.user.role, expectedRole, "login must preserve server role");
    } else {
      assert.equal(session.user, undefined, "failed login must never authenticate");
    }
    return client;
  }
  try {
    storedFile = await uploadFile(fixtureBytes, `${prefix}/fixture.pdf`, "application/pdf");
    const team = await db.team.create({ data: { name: prefix } });
    teamId = team.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const actors = {} as Record<"owner" | "analyst" | "partner" | "outsider", { id: string; email: string; role: string }>;
    for (const kind of ["owner", "analyst", "partner", "outsider"] as const) {
      const user = await db.user.create({ data: {
        email: `${prefix}-${kind}@example.com`, name: `${prefix}-${kind}`, passwordHash,
        role: kind === "partner" ? "PARTNER" : "ANALYST", teamId: kind === "outsider" ? null : team.id,
      } });
      users.push(user.id);
      actors[kind] = { id: user.id, email: user.email!, role: user.role };
    }
    const owner = actors.owner;
    for (const shared of [true, false]) {
      const deal = await db.deal.create({ data: {
        name: `${prefix}-${shared ? "shared" : "private"}`, companyName: prefix, sector: "GENERAL",
        userId: owner.id, teamId: shared ? team.id : null,
        reports: { create: { title: prefix, agentType: "GENERAL", status: "DRAFT" } },
      } });
      vcIds.push(deal.id);
      const document = await db.document.create({ data: {
        dealId: deal.id, name: "synthetic.pdf", type: "OTHER", url: storedFile,
        size: fixtureBytes.length, mimeType: "application/pdf",
      } });
      downloads.push({ path: `/api/documents/${document.id}/download`, shared });
      const pe = await db.mADeal.create({ data: {
        name: `${prefix}-${shared ? "shared" : "private"}`, companyName: prefix, dealType: "BUYOUT",
        userId: owner.id, teamId: shared ? team.id : null,
        documents: { create: { name: "synthetic.pdf", type: "DD_MATERIAL", url: storedFile, size: fixtureBytes.length, mimeType: "application/pdf", parsedText: "private fixture content" } },
      } });
      peIds.push(pe.id);
      const peDocument = await db.mADocument.findFirstOrThrow({ where: { maDealId: pe.id } });
      downloads.push({ path: `/api/ma-deals/${pe.id}/documents/${peDocument.id}/download`, shared });
      const template = await db.template.create({ data: {
        name: `${prefix}-template`, originalName: "synthetic.docx", fileType: "DOCX", fileUrl: storedFile,
        fileSize: fixtureBytes.length, userId: owner.id, teamId: shared ? team.id : null,
      } });
      templateIds.push(template.id);
      downloads.push({ path: `/api/templates/${template.id}/download`, shared });
    }
    const summaryPath = `/api/deals/decision-summaries?ids=${vcIds.join(",")}`;
    const anon = await context();
    assert.equal((await anon.get(summaryPath)).status(), 401);
    assert.equal((await anon.get(`/api/ma-deals/${peIds[0]}/documents`)).status(), 401);
    for (const download of downloads) assert.equal((await anon.get(download.path)).status(), 401, "anonymous download refused");
    const resumable = downloads.filter(download => !download.path.startsWith("/api/ma-deals/")).map(download => ({ ...download, path: download.path.replace(/\/download$/, "/resume") }));
    for (const resource of resumable) assert.equal((await anon.post(resource.path)).status(), 401, "anonymous upload recovery refused");
    assert.equal((await anon.get("/api/cron/resume-uploads")).status(), 401, "unconfigured cron authentication fails closed");
    assert.equal((await anon.post("/api/upload/blob-token", { data: { type: "upload.prepare" } })).status(), 401);
    assert.equal((await anon.post("/api/templates/blob-token", { data: { type: "upload.prepare" } })).status(), 401);
    await login(owner.email, "incorrect-synthetic-password");
    await login(`${prefix}-missing@example.com`, password);

    const clients = {} as Record<keyof typeof actors, APIRequestContext>;
    for (const kind of ["owner", "analyst", "partner", "outsider"] as const) {
      clients[kind] = await login(actors[kind].email.toUpperCase(), password, actors[kind].id, actors[kind].role);
    }
    for (const kind of ["owner", "analyst", "partner", "outsider"] as const) {
      const res = await clients[kind].get(summaryPath);
      assert.equal(res.status(), 200);
      const body = await res.json();
      const allowed = kind === "owner" ? vcIds : kind === "outsider" ? [] : [vcIds[0]];
      assert.deepEqual(Object.keys(body.data).sort(), [...allowed].sort(), `${kind} VC scope`);
      for (const resource of resumable) {
        const writable = kind === "owner" || (kind === "partner" && resource.shared);
        // These rows have no queued reservation: permitted scheduling must not read providers.
        assert.equal((await clients[kind].post(resource.path)).status(), writable ? 202 : 404, `${kind} recovery requires current edit access`);
      }
      for (const download of downloads) {
        const readable = kind === "owner" || (kind !== "outsider" && download.shared);
        const response = await clients[kind].get(download.path);
        assert.equal(response.status(), readable ? 200 : 404, `${kind} download scope`);
        if (readable) {
          assert.deepEqual(await response.body(), fixtureBytes, "authorized download returns fixture bytes");
          assert.equal(response.headers()["cache-control"], "private, no-store");
          assert.match(response.headers()["content-disposition"], /^attachment;/);
          assert.equal(response.headers()["x-content-type-options"], "nosniff");
        }
      }
      for (let index = 0; index < peIds.length; index++) {
        const readable = kind === "owner" || (kind !== "outsider" && index === 0);
        const documents = await clients[kind].get(`/api/ma-deals/${peIds[index]}/documents`);
        assert.equal(documents.status(), readable ? 200 : 404, `${kind} PE read scope`);
        const content = await documents.text();
        assert(!content.includes("private fixture content"), "document listings exclude parsedText");
        assert(!content.includes("private-local:"), "document listings exclude storage references");
        if (readable) assert.equal(JSON.parse(content).data.documents.length, 1, "authorized listing is not vacuous");
      }
    }
    const hidden = await clients.outsider.get(`/api/deals/decision-summaries?ids=${vcIds[0]}`);
    const missing = await clients.outsider.get("/api/deals/decision-summaries?ids=nonexistent-e2e");
    assert.equal(await hidden.text(), await missing.text(), "foreign VC IDs must not reveal existence");
    const upload = { type: "upload.prepare", dealId: vcIds[0], fileName: "fixture.pdf", mimeType: "application/pdf", fileSize: 5 };
    // No Blob token is provisioned: token routes must fail closed even for an owner.
    for (const kind of ["owner", "analyst", "outsider"] as const) assert.equal((await clients[kind].post("/api/upload/blob-token", { data: upload })).status(), 400, "unconfigured private Blob must never issue a token");
    const grant = createUploadGrant({ userId: owner.id, scope: "deal", resourceId: vcIds[0], fileName: "fixture.pdf", mimeType: "application/pdf", fileSize: 5 });
    // Synthetic local grants exercise route checks without requesting a real Blob token.
    const registration = { dealId: vcIds[0], fileName: "fixture.pdf", mimeType: "application/pdf", fileSize: 5, blobUrl: "https://invalid.example/no-fetch.pdf", binding: grant.binding };
    assert.equal((await clients.owner.post("/api/upload", { data: { ...registration, binding: "tampered" } })).status(), 400);
    assert.equal((await clients.partner.post("/api/upload", { data: registration })).status(), 400, "grant cannot transfer to a different writer");
    for (const kind of ["analyst", "outsider"] as const) {
      const ownGrant = createUploadGrant({ userId: actors[kind].id, scope: "deal", resourceId: vcIds[0], fileName: "fixture.pdf", mimeType: "application/pdf", fileSize: 5 });
      assert.equal((await clients[kind].post("/api/upload", { data: { ...registration, binding: ownGrant.binding } })).status(), 403, "a signed binding cannot replace deal write authorization");
    }
    assert.equal((await clients.owner.post("/api/templates/blob-token", { data: { type: "upload.prepare", fileName: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: 5 } })).status(), 400, "template token issuance fails closed without private store");
    assert.equal((await clients.owner.post("/api/templates", { data: { fileName: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: 5, blobUrl: "https://invalid.example/no-fetch.docx", binding: "tampered" } })).status(), 400);
    for (const kind of ["analyst", "outsider"] as const) {
      assert.equal((await clients[kind].patch(`/api/ma-deals/${peIds[0]}`, { data: { name: `${prefix}-denied` } })).status(), 403);
    }
    assert.equal((await clients.partner.patch(`/api/ma-deals/${peIds[1]}`, { data: { name: `${prefix}-denied` } })).status(), 403, "partner cannot write a private deal");
    assert.equal((await clients.partner.patch(`/api/ma-deals/${peIds[0]}`, { data: { name: `${prefix}-partner` } })).status(), 200);
    assert.equal((await db.mADeal.findUniqueOrThrow({ where: { id: peIds[0] } })).name, `${prefix}-partner`, "authorized HTTP update persisted");
    assert.equal((await clients.owner.patch(`/api/ma-deals/${peIds[1]}`, { data: { name: `${prefix}-owner` } })).status(), 200);
    assert.equal((await db.mADeal.findUniqueOrThrow({ where: { id: peIds[1] } })).name, `${prefix}-owner`);
    assert(process.env.CRON_SECRET, "isolated HTTP integration requires synthetic cron authentication");
    const cronRows: string[] = [];
    for (let index = 0; index < 2; index++) {
      const row = await db.document.create({ data: {
        dealId: vcIds[0], name: `cron-${index}.txt`, type: "OTHER", url: storedFile!, size: fixtureBytes.length, mimeType: "text/plain",
        metadata: JSON.parse(JSON.stringify({ __uploadRecovery: queuedRecovery(0) })),
      } });
      cronRows.push(row.id);
    }
    for (let expected = 1; expected <= 2; expected++) {
      const cron = await anon.get("/api/cron/resume-uploads", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      assert.equal(cron.status(), 200);
      assert.deepEqual((await cron.json()).data, { attempted: 1, completed: true }, "cron processes at most one upload per tick");
      assert.equal(await db.document.count({ where: { id: { in: cronRows }, parsedText: fixtureBytes.toString() } }), expected);
    }
    console.log("Actual HTTP login/VC/PE/template/download/upload authorization matrix passed; synthetic local files only.");
  } finally {
    try {
      await Promise.all(contexts.map(client => client.dispose()));
    } finally {
      try {
        await db.$transaction([
          db.deal.deleteMany({ where: { id: { in: vcIds } } }),
          db.mADeal.deleteMany({ where: { id: { in: peIds } } }),
          db.template.deleteMany({ where: { id: { in: templateIds } } }),
          db.user.deleteMany({ where: { id: { in: users } } }),
          db.team.deleteMany({ where: { id: { in: teamId ? [teamId] : [] } } }),
          db.rateLimit.deleteMany({ where: { key: `login:${ip}` } }),
        ]);
      } finally {
        try { if (storedFile) assert(await deleteStoredFile(storedFile), "test file cleanup failed"); }
        finally { await db.$disconnect(); }
      }
    }
  }
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : "HTTP authorization integration failed; no cookies or credentials logged.");
  process.exitCode = 1;
});

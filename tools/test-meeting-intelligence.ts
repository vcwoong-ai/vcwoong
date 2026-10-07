/** Actual source + isolated SQLite. Provider/storage are synthetic; no existing DB or keys. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const nativeRequire = createRequire(import.meta.url);
async function main() {
  const dir = mkdtempSync(join(tmpdir(), "dealmind-meeting-test-"));
  const pgUrl = process.env.MEETING_TEST_POSTGRES_URL;
  if (pgUrl) {
    const target = new URL(pgUrl);
    if (target.hostname !== "127.0.0.1" || !target.port || !/^\/dealmind_meeting_[a-z0-9]+$/.test(target.pathname)
        || process.env.DEALMIND_E2E_ISOLATED !== "1" || !process.env.MEETING_TEST_POSTGRES_CLIENT) throw new Error("Isolated PostgreSQL target required");
  }
  const url = pgUrl ?? `file:${join(dir, "fixture.db").replace(/\\/g, "/")}`;
  const Client = pgUrl ? nativeRequire(process.env.MEETING_TEST_POSTGRES_CLIENT!).PrismaClient : PrismaClient;
  const db: PrismaClient = new Client({ datasources: { db: { url } }, log: [] });
  const env: Record<string, string> = { NODE_ENV: "test", STORAGE_MODE: "local", MEETING_INTELLIGENCE_ENABLED: "1",
    MEETING_MONTHLY_MINUTES: "4", MEETING_MAX_MINUTES: "2", MEETING_OPENAI_API_KEY: "synthetic-test-key",
    MEETING_FFPROBE_PATH: "C:/synthetic/ffprobe.exe" };
  const modules: Record<string, any> = { "@/lib/prisma": { prisma: db } };
  const removed: string[] = [];
  function source(file: string, extras: Record<string, any> = {}) {
    const exports: Record<string, any> = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, require: (name: string) => {
      if (Object.hasOwn(extras, name)) return extras[name];
      if (Object.hasOwn(modules, name)) return modules[name];
      return nativeRequire(name);
    }, process: { env }, Buffer, Date, URL, Response, Request, AbortSignal, ReadableStream, console });
    return exports;
  }
  try {
    // Prisma on this Windows volume requires a precreated empty SQLite file.
    if (!pgUrl) writeFileSync(join(dir, "fixture.db"), "", { flag: "wx" });
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", pgUrl ? "prisma/schema.prisma" : "prisma/schema.sqlite.prisma", "--skip-generate"],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    modules["@/lib/team-access"] = source("src/lib/team-access.ts");
    modules["@/lib/pe/ma-team-access"] = source("src/lib/pe/ma-team-access.ts");
    const paid = new Set(["owner"]);
    modules["@/lib/subscription"] = { getUserPlanKey: async (id: string) => paid.has(id) ? "solo" : "free" };
    modules["@/lib/storage"] = { deleteStoredFile: async (ref: string) => { removed.push(ref); return true; }, assertPrivateBlobUploads: () => {} };
    modules["@/lib/storage-configuration"] = source("src/lib/storage-configuration.ts");
    const policy = source("src/lib/meetings/policy.ts"); modules["./policy"] = policy;
    modules["./meetings/policy"] = policy;
    const context = source("src/lib/decision-context.ts");
    const service = source("src/lib/meetings/service.ts");
    modules["./service"] = service;
    modules["@/lib/meetings/service"] = service;
    modules["@/lib/meetings/policy"] = policy;
    let sessionUserId: string | null = "owner";
    modules["next-auth"] = { getServerSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null };
    modules["@/lib/auth"] = { authOptions: {} };
    const http = source("src/lib/meetings/http.ts"); modules["@/lib/meetings/http"] = http;
    const requestParams = { track: "vc", dealId: "vc" };
    sessionUserId = null;
    await assert.rejects(http.authorizeMeetingRequest(new NextRequest("https://fixture.invalid/"), requestParams, true), (error: any) => error.status === 401);
    sessionUserId = "owner";
    await assert.rejects(http.authorizeMeetingRequest(new NextRequest("https://fixture.invalid/", { headers: { origin: "https://wrong.invalid" } }), requestParams, true), (error: any) => error.status === 403);
    assert.equal(policy.meetingMonth(new Date("2026-10-31T15:00:00Z")), "2026-11");
    assert.equal(policy.meetingPolicy({}).enabled, false);
    assert.equal(policy.meetingPolicy({ MEETING_INTELLIGENCE_ENABLED: "1", MEETING_MONTHLY_MINUTES: "0", MEETING_MAX_MINUTES: "2" }).configured, false);
    assert.throws(() => policy.validateAudio({ fileName: "../audio.mp3", mimeType: "audio/mpeg", fileSize: 100 }));
    assert.throws(() => policy.verifyAudioSignature(Buffer.from("not an audio file"), "mp3"));
    assert.throws(() => policy.validateMinutes({ summary: "확인", claims: [{ text: "매출", start: 0, end: 1, verification: "VERIFIED", note: "" }], questions: [], actions: [] }, 5));
    const team = await db.team.create({ data: { id: "team", name: "Synthetic team", ownerUserId: null } });
    await db.user.createMany({ data: [
      { id: "owner", email: "owner@synthetic.invalid", subscriptionPlan: "SOLO", teamId: team.id, role: "ADMIN" },
      { id: "partner", email: "partner@synthetic.invalid", teamId: team.id, role: "PARTNER" },
      { id: "analyst", email: "analyst@synthetic.invalid", teamId: team.id, role: "ANALYST" },
      { id: "stranger", email: "stranger@synthetic.invalid", role: "ADMIN" },
    ] });
    await db.deal.create({ data: { id: "vc", userId: "owner", teamId: team.id, name: "Synthetic VC", companyName: "Synthetic VC", sector: "GENERAL" } });
    await db.mADeal.create({ data: { id: "pe", userId: "owner", teamId: team.id, name: "Synthetic PE", companyName: "Synthetic PE", dealType: "BUYOUT" } });
    const scope = await service.meetingScope("owner", "vc", "vc", true);
    await assert.rejects(service.meetingScope("stranger", "vc", "vc"));
    await assert.rejects(service.meetingScope("analyst", "vc", "vc", true));
    await service.meetingScope("analyst", "vc", "vc");
    await service.meetingScope("partner", "pe", "pe", true);
    paid.clear(); await assert.rejects(service.meetingScope("owner", "vc", "vc", true));
    await service.meetingScope("owner", "vc", "vc", true, false); paid.add("owner");
    const input = () => ({ requestId: randomUUID(), title: "Synthetic meeting", occurredAt: "2026-10-06T01:00:00.000Z",
      participants: "Synthetic CEO", consentConfirmed: true, fileName: "sample.wav", mimeType: "audio/wav", fileSize: 44 });
    assert.equal(policy.newMeetingSchema.parse(input()).uploadMemo, "");
    assert.throws(() => policy.newMeetingSchema.parse({ ...input(), uploadMemo: "x".repeat(3001) }));
    const firstInput = { ...input(), uploadMemo: "심사역 메모: 매출 기준 확인\n추가 자료 요청" }, first = await service.prepareMeeting(scope, firstInput);
    assert.equal(first.uploadMemo, firstInput.uploadMemo);
    assert.equal(service.publicMeeting(first, true).uploadMemo, firstInput.uploadMemo);
    assert.equal(service.publicMeeting(first).uploadMemo, undefined);
    if (pgUrl) await assert.rejects(db.meeting.update({ where: { id: first.id }, data: { maDealId: "pe" } }), "Both deal tracks must be rejected by the additive patch");
    assert.equal((await service.prepareMeeting(scope, firstInput)).id, first.id);
    await assert.rejects(service.prepareMeeting(scope, { ...firstInput, title: "Changed" }));
    await assert.rejects(service.prepareMeeting(scope, { ...firstInput, uploadMemo: "Changed memo" }));
    let second;
    if (pgUrl) {
      const race = await Promise.allSettled([service.prepareMeeting(scope, input()), service.prepareMeeting(scope, input())]);
      const winners = race.filter(item => item.status === "fulfilled");
      assert.equal(winners.length, 1, "Only one final quota reservation may win");
      second = (winners[0] as PromiseFulfilledResult<any>).value;
    } else second = await service.prepareMeeting(scope, input());
    await assert.rejects(service.prepareMeeting(scope, input()), /한도/);
    await service.removeMeeting(scope, second);
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: second.id } })).status, "RELEASED");
    const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.write("WAVE", 8);
    const hash = createHash("sha256").update(wav).digest("hex");
    const token = await service.claimLocalUpload(first);
    await assert.rejects(service.claimLocalUpload(first));
    await service.completeMeetingUpload(first, first.uploadRef, hash, token);
    const preview = (await service.listMeetings(scope))[0];
    for (const key of ["storageRef", "storageKey", "sha256", "leaseToken", "transcript", "minutes"]) assert(!Object.hasOwn(preview, key));
    await assert.rejects(service.scopedMeeting(await service.meetingScope("owner", "pe", "pe"), first.id));
    modules["./audio"] = { probeMeetingAudio: async () => 30 };
    modules["./provider"] = { createMeetingProvider: () => { throw new Error("unexpected provider"); } };
    const worker = source("src/lib/meetings/worker.ts");
    let calls = 0;
    let summaryInput = "";
    const provider = { transcribe: async () => { calls++; return [{ start: 0, end: 30, text: "내년 목표 매출 30억원" }]; },
      summarize: async (segments: unknown) => { summaryInput = JSON.stringify(segments); return { summary: "회사는 내년 매출 목표를 제시했다.", claims: [{ text: "내년 목표 매출 30억원", start: 0, end: 30, verification: "VERIFIED", note: "합성 자료" }], questions: ["목표의 근거 확인"], actions: ["수주 내역 요청"] }; } };
    const ports = { provider, read: async () => wav, probe: async () => 30 };
    assert.equal(await worker.processMeeting(first.id, ports), "DRAFT");
    assert(summaryInput.includes("내년 목표 매출 30억원") && !summaryInput.includes("심사역 메모"), "upload memo must not be supplied as recorded speech");
    assert.equal(await worker.processMeeting(first.id, ports), "NOT_CLAIMED"); assert.equal(calls, 1);
    let current = await db.meeting.findUniqueOrThrow({ where: { id: first.id } });
    const minutes = JSON.parse(current.minutes!); assert.equal(minutes.claims[0].verification, "UNVERIFIED");
    current = await service.reviseMeeting(scope, current, { version: current.version, action: "APPROVE", minutes });
    assert.equal(current.status, "APPROVED");
    const references = await db.deal.findFirstOrThrow({ where: { id: "vc", userId: "owner" }, select: { ...context.REPORT_MEETING_REFERENCE_INCLUDE, id: true } }) as any;
    assert.equal(references.meetings.length, 1);
    assert.equal(context.buildDecisionContext({ sections: [], documents: [], meetings: references.meetings }).meetings[0].version, current.version);
    assert.equal(await db.deal.findFirst({ where: { id: "vc", userId: "outsider" }, select: { ...context.REPORT_MEETING_REFERENCE_INCLUDE, id: true } }), null);
    const exporter = source("src/lib/meetings/export.ts");
    const exportText = exporter.meetingExport(current);
    assert.equal(current.uploadMemo, firstInput.uploadMemo, "processing and revision must preserve the original upload memo");
    assert(exportText.includes("심사역 메모 · 업로드 시 입력") && exportText.includes("> 심사역 메모: 매출 기준 확인"));
    assert(exportText.includes("미검증") && exportText.includes("0:00–0:30") && exportText.includes("독립적인 검증을 뜻하지 않습니다"));
    assert(!exportText.includes("storageRef") && !exportText.includes("private-local"));
    modules["@/lib/storage"].readStoredFile = async () => wav;
    const audioRoute = source("src/app/api/meetings/[track]/[dealId]/[meetingId]/audio/route.ts");
    const partial = await audioRoute.GET(new NextRequest("https://fixture.invalid/", { headers: { range: "bytes=0-7" } }),
      { params: { ...requestParams, meetingId: first.id } });
    assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 8);
    assert.equal(partial.headers.get("cache-control"), "private, no-store");
    const invalidRange = await audioRoute.GET(new NextRequest("https://fixture.invalid/", { headers: { range: "bytes=1000-" } }),
      { params: { ...requestParams, meetingId: first.id } });
    assert.equal(invalidRange.status, 416);
    await assert.rejects(service.reviseMeeting(scope, current, { version: current.version - 1, action: "SAVE", minutes }));
    assert.equal(await db.meetingRevision.count({ where: { meetingId: first.id } }), 2);
    current = await service.reviseMeeting(scope, current, { version: current.version, action: "SAVE", minutes: { ...minutes, summary: "정정 내용" } });
    assert.equal(current.status, "DRAFT"); assert.equal(current.approvedAt, null);
    const revisedReferences = await db.deal.findFirstOrThrow({ where: { id: "vc", userId: "owner" }, select: { ...context.REPORT_MEETING_REFERENCE_INCLUDE, id: true } }) as any;
    assert.equal(revisedReferences.meetings.length, 0, "revised draft must disappear from current report references");
    await service.removeMeeting(scope, current);
    const deletedRow = await db.meeting.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(deletedRow.participants, ""); assert.equal(deletedRow.title, "삭제된 회의");
    assert.equal(deletedRow.uploadMemo, "");
    assert.equal(deletedRow.fileName, "deleted-audio"); assert.equal(deletedRow.transcript, null);
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: first.id } })).status, "CHARGED");
    assert.equal(removed.length, 1);
    const unknown = await service.prepareMeeting(scope, input());
    await db.meeting.update({ where: { id: unknown.id }, data: { storageRef: "private-local:synthetic.wav", sha256: hash, status: "QUEUED" } });
    const failing = { ...ports, provider: { ...provider, transcribe: async () => { calls++; throw new Error("synthetic-secret-url-and-key"); } } };
    assert.equal(await worker.processMeeting(unknown.id, failing), "UNKNOWN");
    assert.equal(await worker.processMeeting(unknown.id, ports), "NOT_CLAIMED");
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: unknown.id } })).status, "CHARGED");
    const unknownRow = await db.meeting.findUniqueOrThrow({ where: { id: unknown.id } });
    assert(!JSON.stringify(service.publicMeeting(unknownRow, true)).includes("synthetic-secret"));
    await service.removeMeeting(scope, unknownRow);
    const revoked = await service.prepareMeeting(scope, input());
    await db.meeting.update({ where: { id: revoked.id }, data: { storageRef: "private-local:synthetic.wav", sha256: hash, status: "QUEUED" } });
    paid.clear(); const before = calls;
    assert.equal(await worker.processMeeting(revoked.id, ports), "FAILED"); assert.equal(calls, before);
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: revoked.id } })).status, "RELEASED");
    paid.add("owner");
    const abandoned = await service.prepareMeeting(scope, input());
    await db.meeting.update({ where: { id: abandoned.id }, data: { createdAt: new Date(Date.now() - 21 * 60_000) } });
    await worker.maintainMeetings();
    const expiredUpload = await db.meeting.findUniqueOrThrow({ where: { id: abandoned.id } });
    assert(expiredUpload.deletedAt); assert.equal(expiredUpload.errorCode, "UPLOAD_EXPIRED");
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: abandoned.id } })).status, "RELEASED");
    assert(removed.includes(abandoned.uploadRef));
    const orphan = await service.prepareMeeting(scope, input());
    await db.meeting.update({ where: { id: orphan.id }, data: { status: "DRAFT", providerStartedAt: new Date() } });
    await db.meetingUsageAdmission.update({ where: { meetingId: orphan.id }, data: { status: "CHARGED", seconds: 10 } });
    await db.deal.delete({ where: { id: "vc" } });
    assert.equal((await db.meeting.findUniqueOrThrow({ where: { id: orphan.id } })).dealId, null);
    await worker.maintainMeetings();
    assert((await db.meeting.findUniqueOrThrow({ where: { id: orphan.id } })).deletedAt);
    assert.equal((await db.meetingUsageAdmission.findUniqueOrThrow({ where: { meetingId: orphan.id } })).seconds, 10);
    if (process.env.MEETING_TEST_FFPROBE_PATH) {
      env.MEETING_FFPROBE_PATH = process.env.MEETING_TEST_FFPROBE_PATH;
      const actualAudio = source("src/lib/meetings/audio.ts");
      const pcm = Buffer.alloc(44 + 16_000); pcm.write("RIFF", 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write("WAVEfmt ", 8);
      pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
      pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
      pcm.write("data", 36); pcm.writeUInt32LE(16000, 40);
      const metadata = { fileName: "synthetic.wav", mimeType: "audio/wav", fileSize: pcm.length };
      assert.equal(await actualAudio.probeMeetingAudio(pcm, metadata, 2), 1);
      await assert.rejects(actualAudio.probeMeetingAudio(pcm, metadata, 0));
      console.log("PASS native ffprobe: generated PCM duration and time-limit rejection; no customer audio");
    }
    console.log(`PASS meetings: isolated ${pgUrl ? "PostgreSQL + quota concurrency" : "SQLite"}, paid/tenant gates, admission/idempotency, private DTO, worker claim, uncertain-result fence, approval CAS, delete and retained usage (synthetic providers)`);
  } finally {
    await db.$disconnect();
    const target = resolve(dir), child = relative(resolve(tmpdir()), target);
    if (child.startsWith("dealmind-meeting-test-") && !child.includes("..") && !isAbsolute(child)) rmSync(target, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error("FAIL meeting intelligence isolated validation", String(error?.message ?? "unknown").slice(0, 500));
  process.exitCode = 1;
});

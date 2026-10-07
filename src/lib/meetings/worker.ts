import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readStoredFile, deleteStoredFile } from "@/lib/storage";
import { getUserPlanKey } from "@/lib/subscription";
import { requireMeetingPolicy, parseTranscript, validateMinutes, type MeetingMinutes } from "./policy";
import { probeMeetingAudio } from "./audio";
import { createMeetingProvider, type MeetingProvider } from "./provider";

interface WorkerPorts {
  provider?: MeetingProvider;
  probe?: typeof probeMeetingAudio;
  read?: typeof readStoredFile;
  plan?: typeof getUserPlanKey;
}
/** One claim, one provider attempt. A lost/expired paid result is never retried automatically. */
export async function processMeeting(id: string, ports: WorkerPorts = {}) {
  const policy = requireMeetingPolicy(), token = randomUUID();
  const now = new Date(), leaseUntil = new Date(now.getTime() + 10 * 60_000);
  const claimed = await prisma.meeting.updateMany({ where: { id, status: "QUEUED", deletedAt: null, providerStartedAt: null },
    data: { status: "PROCESSING", leaseToken: token, leaseUntil, errorCode: null } });
  if (claimed.count !== 1) return "NOT_CLAIMED";
  const live = () => ({ id, status: "PROCESSING", deletedAt: null, leaseToken: token, leaseUntil: { gt: new Date() } });
  let started = false;
  try {
    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id } });
    const owner = meeting.dealId
      ? await prisma.deal.findUnique({ where: { id: meeting.dealId }, select: { userId: true } })
      : meeting.maDealId ? await prisma.mADeal.findUnique({ where: { id: meeting.maDealId }, select: { userId: true } }) : null;
    if (!owner || owner.userId !== meeting.ownerUserId || await (ports.plan ?? getUserPlanKey)(owner.userId) === "free") throw new Error("MEETING_ACCESS_REVOKED");
    if (!meeting.storageRef || !meeting.sha256) throw new Error("MEETING_ORIGINAL_MISSING");
    const buffer = await (ports.read ?? readStoredFile)(meeting.storageRef, meeting.fileSize);
    if (!buffer || buffer.length !== meeting.fileSize || createHash("sha256").update(buffer).digest("hex") !== meeting.sha256) throw new Error("MEETING_ORIGINAL_CHANGED");
    const duration = await (ports.probe ?? probeMeetingAudio)(buffer, meeting, policy.maxMinutes * 60);
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > policy.maxMinutes * 60) throw new Error("MEETING_DURATION_REJECTED");
    const provider = ports.provider ?? createMeetingProvider();
    if (await (ports.plan ?? getUserPlanKey)(meeting.ownerUserId) === "free") throw new Error("MEETING_ACCESS_REVOKED");
    const admission = await prisma.$transaction(async tx => {
      const result = await tx.meeting.updateMany({ where: live(), data: { providerStartedAt: new Date(), durationSeconds: duration } });
      if (result.count !== 1) return false;
      const charged = await tx.meetingUsageAdmission.updateMany({ where: { meetingId: id, status: "RESERVED", seconds: { gte: duration } },
        data: { seconds: duration, status: "CHARGED" } });
      if (charged.count !== 1) throw new Error("MEETING_ADMISSION_MISSING");
      return true;
    });
    if (!admission) return "STALE";
    started = true;
    const segments = parseTranscript(await provider.transcribe(buffer, meeting.fileName, meeting.mimeType, duration), duration);
    const saved = await prisma.meeting.updateMany({ where: live(), data: { transcript: JSON.stringify(segments) } });
    if (saved.count !== 1) return "STALE";
    let minutes: MeetingMinutes, errorCode: string | null = null;
    try {
      minutes = validateMinutes(await provider.summarize(segments, duration), duration);
      minutes.claims = minutes.claims.map(claim => ({ ...claim, verification: "UNVERIFIED" }));
    }
    catch {
      // Preserve the verified transcript for manual review. Never retranscribe on a summary failure.
      minutes = { summary: "자동 회의록을 완성하지 못했습니다. 아래 전사를 검토하여 내용을 작성해주세요.", claims: [], questions: [], actions: [] };
      errorCode = "SUMMARY_UNAVAILABLE";
    }
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.meeting.updateMany({ where: live(), data: { status: "DRAFT", minutes: JSON.stringify(minutes),
        errorCode, leaseToken: null, leaseUntil: null, version: { increment: 1 } } });
      if (updated.count !== 1) return false;
      const current = await tx.meeting.findUniqueOrThrow({ where: { id }, select: { version: true } });
      await tx.meetingRevision.create({ data: { meetingId: id, version: current.version, actorUserId: "meeting-worker",
        action: "AI_DRAFT", minutes: JSON.stringify(minutes) } });
      return true;
    });
    return result ? "DRAFT" : "STALE";
  } catch {
    // Exceptions may include provider keys, audio names or transcript fragments.
    await prisma.$transaction(async tx => {
      const result = await tx.meeting.updateMany({ where: live(), data: { status: started ? "UNKNOWN" : "FAILED",
        errorCode: started ? "PROVIDER_RESULT_UNCONFIRMED" : "AUDIO_OR_ACCESS_REJECTED", leaseToken: null, leaseUntil: null } });
      if (result.count === 1 && !started) await tx.meetingUsageAdmission.updateMany({ where: { meetingId: id, status: "RESERVED" }, data: { seconds: 0, status: "RELEASED" } });
    }).catch(() => {});
    return started ? "UNKNOWN" : "FAILED";
  }
}

/** Bounded maintenance: fence expired workers and remove already-authorized deleted originals. */
export async function maintainMeetings() {
  requireMeetingPolicy();
  await prisma.meeting.updateMany({ where: { status: { in: ["PROCESSING", "UPLOADING"] }, leaseUntil: { lte: new Date() } },
    data: { status: "UNKNOWN", errorCode: "WORKER_RESULT_UNCONFIRMED", leaseToken: null, leaseUntil: null } });
  // Wait beyond the 15-minute upload grant before releasing abandoned reservations.
  const abandoned = await prisma.meeting.findMany({ where: { status: "UPLOAD_PENDING", deletedAt: null,
    createdAt: { lte: new Date(Date.now() - 20 * 60_000) } }, orderBy: { createdAt: "asc" }, take: 25 });
  for (const meeting of abandoned) {
    await prisma.$transaction(async tx => {
      const changed = await tx.meeting.updateMany({ where: { id: meeting.id, status: "UPLOAD_PENDING", deletedAt: null,
        version: meeting.version }, data: { deletedAt: new Date(), status: "CANCELLED", errorCode: "UPLOAD_EXPIRED",
          title: "삭제된 회의", participants: "", uploadMemo: "", fileName: "deleted-audio", version: { increment: 1 } } });
      if (changed.count !== 1) return;
      await tx.meetingUsageAdmission.updateMany({ where: { meetingId: meeting.id, status: "RESERVED" },
        data: { seconds: 0, status: "RELEASED" } });
    });
  }
  const orphans = await prisma.meeting.findMany({ where: { deletedAt: null, dealId: null, maDealId: null,
    status: { notIn: ["PROCESSING", "UPLOADING"] } }, take: 25 });
  for (const meeting of orphans) {
    await prisma.$transaction(async tx => {
      const changed = await tx.meeting.updateMany({ where: { id: meeting.id, version: meeting.version, deletedAt: null,
        dealId: null, maDealId: null, status: { notIn: ["PROCESSING", "UPLOADING"] } },
        data: { deletedAt: new Date(), status: "CANCELLED", title: "삭제된 회의", participants: "", uploadMemo: "", fileName: "deleted-audio",
          transcript: null, minutes: null, version: { increment: 1 } } });
      if (changed.count !== 1) return;
      await tx.meetingRevision.deleteMany({ where: { meetingId: meeting.id } });
      if (!meeting.providerStartedAt) await tx.meetingUsageAdmission.updateMany({ where: { meetingId: meeting.id, status: "RESERVED" }, data: { seconds: 0, status: "RELEASED" } });
    });
  }
  const deleted = await prisma.meeting.findMany({ where: { deletedAt: { not: null }, originalDeletedAt: null,
    createdAt: { lte: new Date(Date.now() - 20 * 60_000) } }, orderBy: { updatedAt: "asc" }, take: 25 });
  for (const meeting of deleted) {
    const success = await deleteStoredFile(meeting.storageRef ?? meeting.uploadRef);
    await prisma.meeting.updateMany({ where: { id: meeting.id, deletedAt: { not: null }, originalDeletedAt: null },
      data: success ? { storageRef: null, originalDeletedAt: new Date() } : { updatedAt: new Date() } });
  }
}

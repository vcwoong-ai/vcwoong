import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, Meeting } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserPlanKey } from "@/lib/subscription";
import { getUserTeamContext, dealReadWhere, dealWriteWhere } from "@/lib/team-access";
import { maDealReadWhere, maDealWriteWhere } from "@/lib/pe/ma-team-access";
import { deleteStoredFile, assertPrivateBlobUploads, configuredBlobHost } from "@/lib/storage";
import { resolveStorageMode } from "@/lib/storage-configuration";
import { MeetingError, requireMeetingPolicy, meetingMonth, newMeetingSchema, validateAudio,
  validateMinutes, type MeetingTrack } from "./policy";

export async function meetingScope(userId: string, track: MeetingTrack, dealId: string, write = false, requirePaid = write) {
  requireMeetingPolicy();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(dealId)) throw new MeetingError("딜을 찾을 수 없습니다.", 404);
  const { teamId, role } = await getUserTeamContext(userId);
  const select = { id: true, userId: true, companyName: true };
  const deal = track === "vc"
    ? await prisma.deal.findFirst({ where: { id: dealId, ...(write ? dealWriteWhere(userId, teamId, role) : dealReadWhere(userId, teamId)) }, select })
    : await prisma.mADeal.findFirst({ where: { id: dealId, ...(write ? maDealWriteWhere(userId, teamId, role) : maDealReadWhere(userId, teamId)) }, select });
  if (!deal) throw new MeetingError("딜을 찾을 수 없거나 권한이 없습니다.", 404);
  if (requirePaid && await getUserPlanKey(deal.userId) === "free") throw new MeetingError("회의 기록 생성·편집은 유효한 유료 구독에서 사용할 수 있습니다.", 402);
  return { ...deal, track, actorUserId: userId };
}
export function meetingWhere(scope: { track: MeetingTrack; id: string }) {
  return scope.track === "vc" ? { dealId: scope.id, maDealId: null } : { dealId: null, maDealId: scope.id };
}
type MeetingPreview = Pick<Meeting, "id" | "title" | "occurredAt" | "participants" | "fileName" | "fileSize" | "status" | "durationSeconds" | "version" | "approvedAt" | "createdAt" | "errorCode">
  & Partial<Pick<Meeting, "transcript" | "minutes" | "uploadMemo">>;
export function publicMeeting(meeting: MeetingPreview, detail = false) {
  return { id: meeting.id, title: meeting.title, occurredAt: meeting.occurredAt.toISOString(),
    participants: meeting.participants, fileName: meeting.fileName, fileSize: meeting.fileSize,
    status: meeting.status, durationSeconds: meeting.durationSeconds, version: meeting.version,
    approvedAt: meeting.approvedAt?.toISOString() ?? null, createdAt: meeting.createdAt.toISOString(),
    errorCode: meeting.errorCode,
    ...(detail ? { uploadMemo: meeting.uploadMemo ?? "", transcript: meeting.transcript ? JSON.parse(meeting.transcript) : [],
      minutes: meeting.minutes ? JSON.parse(meeting.minutes) : null } : {}),
  };
}
type Scope = Awaited<ReturnType<typeof meetingScope>>;
export async function scopedMeeting(scope: Scope, id: string) {
  const meeting = await prisma.meeting.findFirst({ where: { id, ...meetingWhere(scope), deletedAt: null } });
  if (!meeting) throw new MeetingError("회의 기록을 찾을 수 없습니다.", 404);
  return meeting;
}
export async function listMeetings(scope: Scope) {
  return (await prisma.meeting.findMany({ where: { ...meetingWhere(scope), deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 25, select: { id: true, title: true, occurredAt: true,
      participants: true, fileName: true, fileSize: true, status: true, durationSeconds: true,
      version: true, approvedAt: true, createdAt: true, errorCode: true } })).map(item => publicMeeting(item));
}
async function serial<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error) { if (attempt >= 2 || (error as { code?: string })?.code !== "P2034") throw error; }
  }
}
export async function prepareMeeting(scope: Scope, input: unknown) {
  const mode = resolveStorageMode(process.env);
  if (!process.env.MEETING_OPENAI_API_KEY || !process.env.MEETING_FFPROBE_PATH
      || (mode !== "vercel-blob" && !(mode === "local" && process.env.NODE_ENV !== "production"))) throw new MeetingError("녹음 처리 환경을 준비 중입니다.", 503);
  if (mode === "vercel-blob") assertPrivateBlobUploads();
  const policy = requireMeetingPolicy(), data = newMeetingSchema.parse(input);
  const ext = validateAudio(data), now = new Date(), month = meetingMonth(now);
  return serial(async tx => {
    // Serialize the owner's quota, including independent team members creating meetings.
    await tx.user.update({ where: { id: scope.userId }, data: { updatedAt: now } });
    const prior = await tx.meeting.findUnique({ where: { createdByUserId_requestId: { createdByUserId: scope.actorUserId, requestId: data.requestId } } });
    if (prior) {
      if (prior.ownerUserId !== scope.userId || prior.dealId !== (scope.track === "vc" ? scope.id : null)
          || prior.maDealId !== (scope.track === "pe" ? scope.id : null) || prior.deletedAt
          || prior.fileSize !== data.fileSize || prior.fileName !== data.fileName || prior.mimeType !== data.mimeType
          || prior.title !== data.title || prior.participants !== data.participants || prior.uploadMemo !== data.uploadMemo || prior.occurredAt.toISOString() !== new Date(data.occurredAt).toISOString()) throw new MeetingError("같은 요청으로 다른 회의를 만들 수 없습니다.", 409);
      return prior;
    }
    const used = await tx.meetingUsageAdmission.aggregate({ where: { ownerUserId: scope.userId, month,
      status: { in: ["RESERVED", "CHARGED"] } }, _sum: { seconds: true } });
    const seconds = policy.maxMinutes * 60;
    if ((used._sum.seconds ?? 0) + seconds > policy.monthlyMinutes * 60) throw new MeetingError("이번 달 회의 전사 한도를 초과했습니다. 대기 중인 업로드를 취소하거나 다음 달에 이용해주세요.", 429);
    const id = randomUUID();
    const storageKey = `meetings/${scope.userId}/${id}.${ext}`;
    const meeting = await tx.meeting.create({ data: { id, ownerUserId: scope.userId, createdByUserId: scope.actorUserId,
      requestId: data.requestId, ...meetingWhere(scope), title: data.title, occurredAt: new Date(data.occurredAt),
      participants: data.participants, uploadMemo: data.uploadMemo, consentAt: now, fileName: data.fileName, mimeType: data.mimeType,
      fileSize: data.fileSize, storageKey, uploadRef: mode === "local" ? `private-local:${storageKey}` : `https://${configuredBlobHost()}/${storageKey}` } });
    await tx.meetingUsageAdmission.create({ data: { meetingId: id, ownerUserId: scope.userId, month, seconds } });
    return meeting;
  });
}
export function assertUploadPending(meeting: Meeting) {
  if (meeting.status !== "UPLOAD_PENDING" || meeting.storageRef || meeting.createdAt.getTime() + 15 * 60_000 <= Date.now()) throw new MeetingError("업로드 자리가 만료되었거나 이미 처리 중입니다. 회의를 다시 조회해주세요.", 409);
}
export async function claimLocalUpload(meeting: Meeting) {
  assertUploadPending(meeting);
  const token = randomUUID();
  const result = await prisma.meeting.updateMany({ where: { id: meeting.id, status: "UPLOAD_PENDING", storageRef: null, deletedAt: null },
    data: { status: "UPLOADING", leaseToken: token, leaseUntil: new Date(Date.now() + 5 * 60_000) } });
  if (result.count !== 1) throw new MeetingError("이미 업로드 중입니다.", 409);
  return token;
}
export async function completeMeetingUpload(meeting: Meeting, storageRef: string, sha256: string, token?: string) {
  if (storageRef !== meeting.uploadRef) throw new MeetingError("승인한 저장 위치와 다릅니다.");
  const result = await prisma.meeting.updateMany({ where: { id: meeting.id, status: token ? "UPLOADING" : "UPLOAD_PENDING",
    ...(token ? { leaseToken: token } : { storageRef: null }), deletedAt: null },
    data: { storageRef, sha256, status: "QUEUED", leaseToken: null, leaseUntil: null, version: { increment: 1 } } });
  if (result.count !== 1) throw new MeetingError("업로드 결과를 확정하지 못했습니다. 회의를 다시 조회해주세요.", 409);
}
export async function reviseMeeting(scope: Scope, meeting: Meeting, input: unknown) {
  const data = z.object({ version: z.number().int().nonnegative(), action: z.enum(["SAVE", "APPROVE"]), minutes: z.unknown() }).parse(input);
  const minutes = validateMinutes(data.minutes, meeting.durationSeconds ?? 0);
  return serial(async tx => {
    const updated = await tx.meeting.updateMany({ where: { id: meeting.id, ...meetingWhere(scope), deletedAt: null,
      version: data.version, status: { in: ["DRAFT", "APPROVED"] } }, data: { minutes: JSON.stringify(minutes),
      version: { increment: 1 }, status: data.action === "APPROVE" ? "APPROVED" : "DRAFT",
      approvedAt: data.action === "APPROVE" ? new Date() : null,
      approvedByUserId: data.action === "APPROVE" ? scope.actorUserId : null } });
    if (updated.count !== 1) throw new MeetingError("다른 변경사항이 있습니다. 회의를 다시 불러와주세요.", 409);
    await tx.meetingRevision.create({ data: { meetingId: meeting.id, version: data.version + 1,
      actorUserId: scope.actorUserId, action: data.action, minutes: JSON.stringify(minutes) } });
    return tx.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
  });
}
export async function removeMeeting(scope: Scope, meeting: Meeting) {
  // Deletion is available after expiry, but processing must first finish or be reconciled.
  if (["PROCESSING", "UPLOADING"].includes(meeting.status)) throw new MeetingError("처리 중인 기록은 아직 삭제할 수 없습니다.", 409);
  await serial(async tx => {
    const result = await tx.meeting.updateMany({ where: { id: meeting.id, ...meetingWhere(scope), deletedAt: null,
      version: meeting.version, status: { notIn: ["PROCESSING", "UPLOADING"] } },
      data: { deletedAt: new Date(), status: "CANCELLED", title: "삭제된 회의", participants: "", uploadMemo: "", fileName: "deleted-audio",
        transcript: null, minutes: null, version: { increment: 1 } } });
    if (result.count !== 1) throw new MeetingError("삭제 상태를 다시 확인해주세요.", 409);
    await tx.meetingRevision.deleteMany({ where: { meetingId: meeting.id } });
    if (!meeting.providerStartedAt) await tx.meetingUsageAdmission.updateMany({ where: { meetingId: meeting.id, status: "RESERVED" }, data: { status: "RELEASED", seconds: 0 } });
  });
  // Keep the private ref until cleanup succeeds; never reset charged usage on delete.
  if (meeting.storageRef && await deleteStoredFile(meeting.storageRef)) await prisma.meeting.update({ where: { id: meeting.id }, data: { storageRef: null, originalDeletedAt: new Date() } });
}

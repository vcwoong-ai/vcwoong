import { randomUUID } from "crypto";
import { Prisma, TemplateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readStoredFile, uploadFile, deleteStoredFile } from "@/lib/storage";
import { parseDocument } from "@/lib/document-parser";
import { extractDocumentImages } from "@/lib/document-images";
import { parseTemplate } from "@/lib/template/template-parser";
import { mapTemplateSections } from "@/lib/template/template-mapper";

export const UPLOAD_LEASE_MS = 10 * 60_000;
export const MAX_UPLOAD_ATTEMPTS = 3;
export const LEGACY_PENDING_WARNING = "문서 텍스트를 추출 중입니다. 잠시 후 새로고침해주세요.";
export interface RecoveryState {
  version: 1;
  status: "queued" | "running" | "complete" | "failed";
  token: string | null;
  attempt: number;
  leaseExpiresAt: number;
  retryAfter: number;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function queuedRecovery(now = Date.now()): RecoveryState {
  return { version: 1, status: "queued", token: null, attempt: 0, leaseExpiresAt: 0, retryAfter: now };
}
export function readRecoveryState(value: unknown): RecoveryState | null {
  const state = object(object(value).__uploadRecovery);
  if (state.version !== 1 || !["queued", "running", "complete", "failed"].includes(String(state.status)) || !(state.token === null || typeof state.token === "string") || !Number.isSafeInteger(state.attempt) || Number(state.attempt) < 0 || !Number.isFinite(state.leaseExpiresAt) || !Number.isFinite(state.retryAfter)) return null;
  return state as unknown as RecoveryState;
}
export function nextRecoveryLease(state: RecoveryState, now = Date.now(), token = randomUUID()): RecoveryState | null {
  if (state.status === "complete" || state.status === "failed" || state.attempt >= MAX_UPLOAD_ATTEMPTS || state.retryAfter > now || (state.status === "running" && state.leaseExpiresAt > now)) return null;
  return { version: 1, status: "running", token, attempt: state.attempt + 1, leaseExpiresAt: now + UPLOAD_LEASE_MS, retryAfter: 0 };
}
export function canCommitRecovery(current: RecoveryState | null, lease: RecoveryState, now = Date.now()): boolean {
  return current?.status === "running" && typeof current.token === "string" && current.token.length > 0 && current.token === lease.token && current.attempt === lease.attempt && current.leaseExpiresAt === lease.leaseExpiresAt && lease.leaseExpiresAt > now;
}
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function jsonEquals(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.DbNull { return value === null ? Prisma.DbNull : json(value); }
type DocumentRow = NonNullable<Awaited<ReturnType<typeof prisma.document.findUnique>>>;
type TemplateRow = NonNullable<Awaited<ReturnType<typeof prisma.template.findUnique>>>;
export interface DocumentClaim { row: DocumentRow; lease: RecoveryState; metadata: Prisma.InputJsonValue }
export interface TemplateClaim { row: TemplateRow; lease: RecoveryState; structure: Prisma.InputJsonValue; updatedAt: Date }

export async function claimDocumentRecovery(id: string, now = Date.now()): Promise<DocumentClaim | null> {
  const row = await prisma.document.findUnique({ where: { id } });
  if (!row || row.parsedText !== null) return null;
  let state = readRecoveryState(row.metadata);
  if (!state && object(row.metadata).warning === LEGACY_PENDING_WARNING && row.createdAt.getTime() + UPLOAD_LEASE_MS <= now) state = queuedRecovery(0);
  if (!state) return null;
  const lease = nextRecoveryLease(state, now);
  if (!lease) {
    if (state.status === "running" && state.leaseExpiresAt <= now && state.attempt >= MAX_UPLOAD_ATTEMPTS) await prisma.document.updateMany({ where: { id, metadata: { equals: jsonEquals(row.metadata) }, parsedText: null }, data: { metadata: json({ ...object(row.metadata), warning: "문서 추출 자동 재시도 한도에 도달했습니다. 원본을 확인하고 다시 업로드해주세요.", __uploadRecovery: { ...state, status: "failed", token: null } }) } });
    return null;
  }
  const metadata = json({ ...object(row.metadata), warning: LEGACY_PENDING_WARNING, __uploadRecovery: lease });
  const claimed = await prisma.document.updateMany({ where: { id, parsedText: null, metadata: { equals: jsonEquals(row.metadata) } }, data: { metadata } });
  return claimed.count === 1 ? { row, lease, metadata } : null;
}
export async function claimTemplateRecovery(id: string, now = Date.now()): Promise<TemplateClaim | null> {
  const row = await prisma.template.findUnique({ where: { id } });
  if (!row || row.status !== TemplateStatus.ANALYZING) return null;
  let state = readRecoveryState(row.structure);
  if (!state && row.updatedAt.getTime() + UPLOAD_LEASE_MS <= now) state = queuedRecovery(0);
  if (!state) return null;
  const lease = nextRecoveryLease(state, now);
  if (!lease) {
    if (state.status === "running" && state.leaseExpiresAt <= now && state.attempt >= MAX_UPLOAD_ATTEMPTS) await prisma.template.updateMany({ where: { id, status: TemplateStatus.ANALYZING, updatedAt: row.updatedAt }, data: { status: TemplateStatus.ERROR } });
    return null;
  }
  const structure = json({ __uploadRecovery: lease });
  const updatedAt = new Date(Math.max(now, row.updatedAt.getTime() + 1));
  const claimed = await prisma.template.updateMany({ where: { id, status: TemplateStatus.ANALYZING, updatedAt: row.updatedAt }, data: { structure, updatedAt } });
  return claimed.count === 1 ? { row, lease, structure, updatedAt } : null;
}
export async function completeDocumentRecovery(claim: DocumentClaim, parsedText: string, metadata: unknown, now = Date.now()): Promise<boolean> {
  if (!canCommitRecovery(claim.lease, claim.lease, now)) return false;
  const completed = await prisma.document.updateMany({ where: { id: claim.row.id, parsedText: null, metadata: { equals: claim.metadata } }, data: { parsedText, metadata: json({ ...object(metadata), __uploadRecovery: { ...claim.lease, status: "complete", token: null } }) } });
  return completed.count === 1;
}
export async function completeTemplateRecovery(claim: TemplateClaim, structure: unknown, sectionMap: unknown, now = Date.now()): Promise<boolean> {
  if (!canCommitRecovery(claim.lease, claim.lease, now)) return false;
  const completed = await prisma.template.updateMany({ where: { id: claim.row.id, status: TemplateStatus.ANALYZING, updatedAt: claim.updatedAt, structure: { equals: claim.structure } }, data: { structure: json(structure), sectionMap: json(sectionMap), status: TemplateStatus.READY } });
  return completed.count === 1;
}
function failureState(lease: RecoveryState, now: number): RecoveryState {
  return { ...lease, status: lease.attempt >= MAX_UPLOAD_ATTEMPTS ? "failed" : "queued", token: null, leaseExpiresAt: 0, retryAfter: now + 60_000 };
}
export async function recoverDocument(id: string, buffer?: Buffer): Promise<boolean> {
  const claim = await claimDocumentRecovery(id);
  if (!claim) return false;
  const images: Array<{ url: string; mimeType: string }> = [];
  try {
    const bytes = buffer ?? await readStoredFile(claim.row.url);
    if (!bytes || bytes.length !== claim.row.size) throw new Error("stored_file_unavailable");
    const parsed = await parseDocument(bytes, claim.row.mimeType, claim.row.name);
    const metadata = { ...object(parsed.metadata) };
    if (parsed.warning) metadata.warning = parsed.warning;
    const extracted = await extractDocumentImages(bytes, claim.row.mimeType, claim.row.name).catch(() => {
      metadata.warning = metadata.warning ?? "첨부 이미지 추출을 완료하지 못했습니다.";
      return [];
    });
    for (let index = 0; index < extracted.length; index += 1) {
      const image = extracted[index];
      if (claim.lease.leaseExpiresAt <= Date.now()) throw new Error("lease_expired");
      try {
        const key = `deals/${claim.row.dealId}/images/${claim.row.id}-${claim.lease.token}-${index}.${image.mimeType.split("/")[1] ?? "png"}`;
        images.push({ url: await uploadFile(image.buffer, key, image.mimeType), mimeType: image.mimeType });
      } catch { metadata.warning = metadata.warning ?? "일부 첨부 이미지를 저장하지 못했습니다."; }
    }
    if (images.length) metadata.images = images;
    const completed = await completeDocumentRecovery(claim, parsed.text, metadata);
    if (!completed) await Promise.all(images.map((image) => deleteStoredFile(image.url)));
    return completed;
  } catch {
    await Promise.all(images.map((image) => deleteStoredFile(image.url)));
    if (claim.lease.leaseExpiresAt > Date.now()) {
      const state = failureState(claim.lease, Date.now());
      await prisma.document.updateMany({ where: { id, parsedText: null, metadata: { equals: claim.metadata } }, data: { metadata: json({ ...object(claim.row.metadata), warning: state.status === "failed" ? "문서 추출 자동 재시도 한도에 도달했습니다. 원본을 확인하고 다시 업로드해주세요." : "문서 텍스트 추출을 다시 시도할 예정입니다.", __uploadRecovery: state }) } });
    }
    return false;
  }
}
export async function recoverTemplate(id: string, buffer?: Buffer, mimeType?: string): Promise<boolean> {
  const claim = await claimTemplateRecovery(id);
  if (!claim) return false;
  try {
    const bytes = buffer ?? await readStoredFile(claim.row.fileUrl);
    if (!bytes || bytes.length !== claim.row.fileSize) throw new Error("stored_file_unavailable");
    const ext = claim.row.originalName.split(".").pop()?.toLowerCase();
    const mime = mimeType ?? (ext === "ppt" ? "application/vnd.ms-powerpoint" : ext === "doc" ? "application/msword" : claim.row.fileType === "PPTX" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const structure = await parseTemplate(bytes, mime, claim.row.originalName);
    const current = await prisma.template.findUnique({ where: { id }, select: { structure: true } });
    if (!canCommitRecovery(readRecoveryState(current?.structure), claim.lease)) return false;
    const sectionMap = await mapTemplateSections(structure.sections);
    return await completeTemplateRecovery(claim, structure, sectionMap);
  } catch {
    if (claim.lease.leaseExpiresAt > Date.now()) {
      const state = failureState(claim.lease, Date.now());
      await prisma.template.updateMany({ where: { id, status: TemplateStatus.ANALYZING, updatedAt: claim.updatedAt, structure: { equals: claim.structure } }, data: { structure: json({ __uploadRecovery: state }), status: state.status === "failed" ? TemplateStatus.ERROR : TemplateStatus.ANALYZING } });
    }
    return false;
  }
}

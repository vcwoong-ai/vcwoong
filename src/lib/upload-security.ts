import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export type UploadScope = "deal" | "template";
export interface UploadFileInput { fileName: string; mimeType: string; fileSize: number }
export interface UploadClaims extends UploadFileInput {
  userId: string;
  scope: UploadScope;
  resourceId?: string;
  pathname: string;
  expiresAt: number;
  uploadId: string;
}
const TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  doc: ["application/msword"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ppt: ["application/vnd.ms-powerpoint"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  txt: ["text/plain"],
};
export function validateUploadFile(input: UploadFileInput, scope: UploadScope): string {
  if (typeof input.fileName !== "string" || input.fileName.length > 255 || /[\x00-\x1f/\\]/.test(input.fileName)) throw new Error("잘못된 파일명입니다");
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext] || (scope === "template" && !["docx", "pptx", "doc", "ppt"].includes(ext))) throw new Error("지원하지 않는 파일 형식입니다");
  if (!TYPES[ext].includes(input.mimeType)) throw new Error("파일 형식과 MIME 유형이 일치하지 않습니다");
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_UPLOAD_BYTES) throw new Error("파일 크기는 1바이트 이상 50MB 이하여야 합니다");
  return ext;
}
function signingKey(secret = process.env.NEXTAUTH_SECRET): string {
  if (!secret) throw new Error("업로드 서명 설정이 필요합니다");
  return secret;
}
function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`dealmind-upload-v1:${payload}`).digest();
}
export function createUploadGrant(input: Omit<UploadClaims, "pathname" | "expiresAt" | "uploadId">, secret?: string, now = Date.now()) {
  const ext = validateUploadFile(input, input.scope);
  if (!/^[a-zA-Z0-9_-]+$/.test(input.userId) || (input.scope === "deal" && !/^[a-zA-Z0-9_-]+$/.test(input.resourceId ?? ""))) throw new Error("잘못된 업로드 대상입니다");
  const uploadId = randomUUID();
  const pathname = input.scope === "deal" ? `deals/${input.resourceId}/uploads/${uploadId}.${ext}` : `templates/${input.userId}/${uploadId}.${ext}`;
  const claims: UploadClaims = { ...input, uploadId, pathname, expiresAt: now + 15 * 60_000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { binding: `${payload}.${signature(payload, signingKey(secret)).toString("base64url")}`, pathname };
}
export function verifyUploadGrant(binding: string, userId: string, scope: UploadScope, resourceId?: string, secret?: string, now = Date.now()): UploadClaims {
  if (typeof binding !== "string" || binding.length > 4096) throw new Error("잘못된 업로드 승인입니다");
  const [payload, mac, extra] = binding.split(".");
  if (!payload || !mac || extra) throw new Error("잘못된 업로드 승인입니다");
  const expected = signature(payload, signingKey(secret));
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error("업로드 승인을 확인할 수 없습니다");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as UploadClaims;
  if (claims.userId !== userId || claims.scope !== scope || claims.resourceId !== resourceId || !Number.isFinite(claims.expiresAt) || claims.expiresAt <= now || claims.expiresAt > now + 15 * 60_000) throw new Error("업로드 승인이 만료되었거나 대상이 다릅니다");
  const ext = validateUploadFile(claims, scope);
  const prefix = scope === "deal" ? `deals/${resourceId}/uploads/` : `templates/${userId}/`;
  const tail = claims.pathname.startsWith(prefix) ? claims.pathname.slice(prefix.length) : "";
  if (!new RegExp(`^[a-f0-9-]{36}\\.${ext}$`).test(tail) || tail !== `${claims.uploadId}.${ext}`) throw new Error("잘못된 업로드 경로입니다");
  return claims;
}
export function attachmentHeaders(filename: string): Record<string, string> {
  const safe = filename.replace(/[\x00-\x1f\x7f/\\]/g, "_");
  return { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
}
export function publicDocument<T extends { id: string; url?: string; metadata?: unknown }>(document: T) {
  const { metadata } = document;
  const rest = { ...document };
  delete rest.url;
  delete rest.metadata;
  const safeMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata as Record<string, unknown> } : metadata;
  if (safeMetadata && typeof safeMetadata === "object") {
    delete (safeMetadata as Record<string, unknown>).images;
    delete (safeMetadata as Record<string, unknown>).__uploadRecovery;
  }
  return { ...rest, ...(metadata !== undefined ? { metadata: safeMetadata } : {}), downloadUrl: `/api/documents/${document.id}/download` };
}
export function publicTemplate<T extends { id: string; fileUrl: string; structure?: unknown }>(template: T) {
  const rest = { ...template };
  delete (rest as { fileUrl?: string }).fileUrl;
  if (rest.structure && typeof rest.structure === "object" && !Array.isArray(rest.structure)) {
    const structure = { ...rest.structure as Record<string, unknown> };
    delete structure.__uploadRecovery;
    rest.structure = Object.keys(structure).length ? structure : null;
  }
  return { ...rest, fileUrl: `/api/templates/${template.id}/download` };
}

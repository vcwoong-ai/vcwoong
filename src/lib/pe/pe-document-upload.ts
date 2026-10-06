import { createHash } from "node:crypto";
import { MaDocumentType, type PrismaClient, type Prisma } from "@prisma/client";
import { validateUploadFile } from "@/lib/upload-security";
import { isPrivateStoredFileReference } from "@/lib/storage";

export const PE_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const PE_MULTIPART_MAX_BYTES = PE_DOCUMENT_MAX_BYTES + 64 * 1024;
const LEASE_MS = 10 * 60_000;
type Phase = "STORING" | "PARSING" | "READY" | "WARNING" | "UNKNOWN";
interface State { version: 1; userId: string; fingerprint: string; phase: Phase; token: string | null; expiresAt: number; parseAttempts?: number }
export interface PEUploadRow {
  id: string; maDealId: string; name: string; type: MaDocumentType; url: string;
  size: number; mimeType: string; parsedText: string | null; metadata: unknown; createdAt: Date;
}
export type PEUploadPatch = Partial<Pick<PEUploadRow, "url" | "parsedText">> & { metadata: unknown };
export interface PEUploadRepository {
  find(id: string): Promise<PEUploadRow | null>;
  reserve(row: PEUploadRow): Promise<boolean>;
  update(row: PEUploadRow, token: string, now: Date, patch: PEUploadPatch): Promise<boolean>;
}
export interface PEUploadPublic {
  status: "ready" | "processing" | "failed" | "not_found";
  uploadId: string;
  id?: string; name?: string; type?: MaDocumentType; size?: number; mimeType?: string; createdAt?: Date;
  parseStatus?: "complete" | "unavailable"; warning?: string; retryAllowed: boolean;
}
export interface PEUploadInput {
  userId: string; dealId: string; uploadId: string; fileName: string; mimeType: string; type: string; bytes: Buffer;
}
export interface PEUploadPorts {
  repository: PEUploadRepository;
  upload(bytes: Buffer, key: string, mimeType: string): Promise<string>;
  parse(bytes: Buffer, mimeType: string, fileName: string): Promise<{ text: string; warning?: string }>;
  now(): Date; newToken(): string;
}
export class PEUploadError extends Error {
  constructor(public readonly status: number, message = "자료 업로드 상태를 확인하지 못했습니다. 작업 상태를 조회해 주세요.") {
    super(message); this.name = "PEUploadError";
  }
}
export async function readPEUploadForm(request: Request): Promise<Omit<PEUploadInput, "userId" | "dealId">> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType) || contentType.length > 300) throw new PEUploadError(400, "파일 업로드 형식을 확인해 주세요.");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > PE_MULTIPART_MAX_BYTES)) throw new PEUploadError(413, "업로드 요청은 파일 4MiB와 제한된 입력값만 허용합니다.");
  if (!request.body) throw new PEUploadError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PE_MULTIPART_MAX_BYTES) { await reader.cancel(); throw new PEUploadError(413, "자료는 4MiB 이하 파일만 업로드할 수 있습니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Request("http://pe-upload.local", { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new PEUploadError(400, "파일 업로드 입력값을 확인해 주세요."); }
  const fields = Array.from(form.keys());
  if (fields.length !== 3 || !["file", "type", "uploadId"].every(key => form.getAll(key).length === 1)) throw new PEUploadError(400);
  const file = form.get("file"), type = form.get("type"), uploadId = form.get("uploadId");
  if (!file || typeof file === "string" || typeof type !== "string" || typeof uploadId !== "string") throw new PEUploadError(400);
  if (file.size > PE_DOCUMENT_MAX_BYTES) throw new PEUploadError(413, "자료는 4MiB 이하 파일만 업로드할 수 있습니다.");
  return { fileName: file.name, mimeType: file.type || (file.name.toLowerCase().endsWith(".txt") ? "text/plain" : ""),
    type, uploadId, bytes: Buffer.from(await file.arrayBuffer()) };
}
export function peUploadOperationId(userId: string, dealId: string, uploadId: string): string {
  if (![userId, dealId].every(value => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value)) ||
      typeof uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId))
    throw new PEUploadError(400, "업로드 작업 정보가 올바르지 않습니다.");
  return `peu_${createHash("sha256").update(JSON.stringify(["pe-document-upload-v1", userId, dealId, uploadId.toLowerCase()])).digest("hex")}`;
}
function stateOf(row: PEUploadRow): State {
  const state = (row.metadata as { __peUpload?: State } | null)?.__peUpload;
  if (!state || state.version !== 1 || !["STORING", "PARSING", "READY", "WARNING", "UNKNOWN"].includes(state.phase) ||
      typeof state.userId !== "string" || typeof state.fingerprint !== "string" || !Number.isFinite(state.expiresAt) ||
      (state.parseAttempts !== undefined && (!Number.isSafeInteger(state.parseAttempts) || state.parseAttempts < 0 || state.parseAttempts > 3)))
    throw new PEUploadError(409);
  return state;
}
function publicView(row: PEUploadRow, now: Date, uploadId: string): PEUploadPublic {
  const state = stateOf(row);
  if (state.phase === "UNKNOWN" || (state.phase === "STORING" && state.expiresAt <= now.getTime()))
    return { status: "failed", uploadId, retryAllowed: false, warning: "저장 결과가 불확실합니다. 재업로드하지 말고 관리자에게 확인을 요청해 주세요." };
  if (state.phase === "STORING" || (state.phase === "PARSING" && state.expiresAt > now.getTime()))
    return { status: "processing", uploadId, retryAllowed: false, warning: "자료 저장 또는 텍스트 추출 상태를 확인하고 있습니다. 작업 상태를 다시 조회해 주세요." };
  if (!row.url) throw new PEUploadError(409);
  const complete = state.phase === "READY";
  return { status: "ready", uploadId, id: row.id, name: row.name, type: row.type, size: row.size, mimeType: row.mimeType,
    createdAt: row.createdAt, parseStatus: complete ? "complete" : "unavailable", retryAllowed: false,
    ...(!complete ? { warning: "원본은 저장되었지만 텍스트 추출을 완료하지 못했거나 확인이 필요합니다. 원본을 확인해 주세요." } : {}) };
}

/** One immutable reservation owns one storage write. An interrupted write is never blindly retried.
 * Parser metadata, raw storage errors, references, tokens and extracted text are server-only.
 * No lease reclaim here: ambiguous storage requires operator reconciliation; parsing recovery is separate.
 */
export class PEUploadService {
  constructor(private readonly ports: PEUploadPorts) {}
  async lookup(input: Pick<PEUploadInput, "userId" | "dealId" | "uploadId">): Promise<PEUploadPublic> {
    const id = peUploadOperationId(input.userId, input.dealId, input.uploadId);
    const row = await this.ports.repository.find(id);
    if (!row) return { status: "not_found", uploadId: input.uploadId, retryAllowed: true };
    if (row.maDealId !== input.dealId || stateOf(row).userId !== input.userId) throw new PEUploadError(409);
    return publicView(row, this.ports.now(), input.uploadId);
  }
  async submit(input: PEUploadInput): Promise<{ status: 200 | 201 | 202; data: PEUploadPublic }> {
    const id = peUploadOperationId(input.userId, input.dealId, input.uploadId);
    if (!Buffer.isBuffer(input.bytes) || input.bytes.length > PE_DOCUMENT_MAX_BYTES) throw new PEUploadError(413, "자료는 4MiB 이하 파일만 업로드할 수 있습니다.");
    if (!Object.values(MaDocumentType).includes(input.type as MaDocumentType)) throw new PEUploadError(400, "자료 종류를 선택해 주세요.");
    let ext: string;
    try { ext = validateUploadFile({ fileName: input.fileName, mimeType: input.mimeType, fileSize: input.bytes.length }, "deal"); }
    catch { throw new PEUploadError(400, "파일 이름, 형식, MIME 유형 또는 크기를 확인해 주세요."); }
    if (!["pdf", "docx", "pptx", "xlsx", "txt"].includes(ext)) throw new PEUploadError(400, "PDF, DOCX, PPTX, XLSX, TXT 자료만 업로드할 수 있습니다.");
    const fingerprint = createHash("sha256").update(JSON.stringify([input.fileName, input.mimeType, input.type, input.bytes.length,
      createHash("sha256").update(input.bytes).digest("hex")])).digest("hex");
    const replay = (row: PEUploadRow) => {
      const state = stateOf(row);
      if (row.maDealId !== input.dealId || state.userId !== input.userId || state.fingerprint !== fingerprint)
        throw new PEUploadError(409, "기존 업로드 작업과 파일 또는 자료 종류가 다릅니다.");
      const data = publicView(row, this.ports.now(), input.uploadId);
      if (data.status === "failed") throw new PEUploadError(409, data.warning);
      return { status: data.status === "processing" ? 202 as const : 200 as const, data };
    };
    const existing = await this.ports.repository.find(id);
    if (existing) return replay(existing);
    const now = this.ports.now();
    const token = this.ports.newToken();
    if (!Number.isFinite(now.getTime()) || typeof token !== "string" || !token || token.length > 200) throw new PEUploadError(503);
    const state: State = { version: 1, userId: input.userId, fingerprint, phase: "STORING", token, expiresAt: now.getTime() + LEASE_MS };
    let row: PEUploadRow = { id, maDealId: input.dealId, name: input.fileName, type: input.type as MaDocumentType,
      url: "", size: input.bytes.length, mimeType: input.mimeType, parsedText: null, metadata: { __peUpload: state }, createdAt: now };
    if (!await this.ports.repository.reserve(row)) {
      const winner = await this.ports.repository.find(id);
      if (!winner) throw new PEUploadError(503);
      return replay(winner);
    }
    let url: string;
    try { url = await this.ports.upload(input.bytes, `ma-deals/${input.dealId}/uploads/${id}.${ext}`, input.mimeType); }
    catch {
      await this.ports.repository.update(row, token, this.ports.now(), { metadata: { __peUpload: { ...state, phase: "UNKNOWN", token: null } } });
      throw new PEUploadError(503);
    }
    if (typeof url !== "string" || !url) throw new PEUploadError(503);
    const parsing = { __peUpload: { ...state, phase: "PARSING" as const } };
    if (!await this.ports.repository.update(row, token, this.ports.now(), { url, metadata: parsing })) throw new PEUploadError(409);
    row = { ...row, url, metadata: parsing };
    let text: string | null = null, warning = true;
    try {
      const parsed = await this.ports.parse(input.bytes, input.mimeType, input.fileName);
      if (typeof parsed.text === "string" && parsed.text.trim()) { text = parsed.text.slice(0, 500_000); warning = !!parsed.warning || parsed.text.length > 500_000; }
    } catch { /* Saved original remains available; parsing is explicitly incomplete. */ }
    const metadata = { __peUpload: { ...state, phase: warning ? "WARNING" as const : "READY" as const, token: null },
      ...(warning ? { warning: "원본은 저장되었지만 텍스트 추출을 확인해야 합니다." } : {}) };
    if (!await this.ports.repository.update(row, token, this.ports.now(), { parsedText: text, metadata })) throw new PEUploadError(409);
    row = { ...row, parsedText: text, metadata };
    return { status: 201, data: publicView(row, this.ports.now(), input.uploadId) };
  }
}

export interface PEParseSummary {
  parseStatus: "complete" | "unavailable" | "processing" | "unknown";
  parseRetryAllowed: boolean;
  parseAttempts: number;
}
type PEParseRow = Pick<PEUploadRow, "id" | "maDealId" | "name" | "mimeType" | "size" | "url" | "metadata">;
function confirmedParseSource(row: PEParseRow): boolean {
  try {
    if (!/^peu_[a-f0-9]{64}$/.test(row.id) || !/^[A-Za-z0-9_-]{1,200}$/.test(row.maDealId) || row.size > PE_DOCUMENT_MAX_BYTES) return false;
    const ext = validateUploadFile({ fileName: row.name, mimeType: row.mimeType, fileSize: row.size }, "deal");
    return ["pdf", "docx", "pptx", "xlsx", "txt"].includes(ext) &&
      isPrivateStoredFileReference(row.url, `ma-deals/${row.maDealId}/uploads/${row.id}.${ext}`);
  } catch { return false; }
}
/** Public parsing state only. No storage reference, fingerprint, owner, token or extracted text. */
export function peDocumentParseSummary(row: PEParseRow, now: Date): PEParseSummary {
  try {
    const state = stateOf(row as PEUploadRow);
    const parseAttempts = state.parseAttempts ?? 0;
    if (!Number.isFinite(now.getTime()) || !confirmedParseSource(row) || !/^[a-f0-9]{64}$/.test(state.fingerprint))
      return { parseStatus: "unknown", parseRetryAllowed: false, parseAttempts };
    if (state.phase === "READY") return { parseStatus: "complete", parseRetryAllowed: false, parseAttempts };
    if (state.phase === "PARSING" && state.expiresAt > now.getTime()) return { parseStatus: "processing", parseRetryAllowed: false, parseAttempts };
    if (state.phase === "WARNING" || state.phase === "PARSING") return { parseStatus: "unavailable", parseRetryAllowed: parseAttempts < 3, parseAttempts };
    return { parseStatus: "unknown", parseRetryAllowed: false, parseAttempts };
  } catch { return { parseStatus: "unknown", parseRetryAllowed: false, parseAttempts: 0 }; }
}
export interface PEParseRecoveryRepository extends PEUploadRepository {
  claimParse(row: PEUploadRow, token: string, now: Date): Promise<boolean>;
}
export interface PEParseRecoveryPorts {
  repository: PEParseRecoveryRepository;
  read(ref: string, maxBytes: number): Promise<Buffer | null>;
  parse(bytes: Buffer, mimeType: string, fileName: string): Promise<{ text: string; warning?: string }>;
  now(): Date;
  newToken(): string;
}
export interface PEParseRecoveryPublic {
  id: string;
  status: "ready" | "processing";
  parseStatus: "complete" | "unavailable";
  retryAllowed: boolean;
  parseAttempts: number;
  warning?: string;
}
export class PEParseRecoveryService {
  constructor(private readonly ports: PEParseRecoveryPorts) {}
  async retry(input: { dealId: string; documentId: string }): Promise<PEParseRecoveryPublic> {
    const row = await this.ports.repository.find(input.documentId);
    if (!row || row.maDealId !== input.dealId) throw new PEUploadError(404, "자료를 찾을 수 없습니다.");
    const now = this.ports.now();
    const summary = peDocumentParseSummary(row, now);
    if (summary.parseStatus === "processing") return { id: row.id, status: "processing", parseStatus: "unavailable", retryAllowed: false, parseAttempts: summary.parseAttempts };
    if (!summary.parseRetryAllowed) throw new PEUploadError(409, "이 자료의 텍스트 추출을 다시 요청할 수 없습니다. 원본과 작업 상태를 확인해 주세요.");
    const token = this.ports.newToken();
    if (typeof token !== "string" || !token || token.length > 200) throw new PEUploadError(503);
    const prior = stateOf(row);
    const state: State = { ...prior, phase: "PARSING", token, expiresAt: now.getTime() + LEASE_MS, parseAttempts: summary.parseAttempts + 1 };
    if (!await this.ports.repository.claimParse(row, token, now)) throw new PEUploadError(409, "다른 텍스트 추출이 진행 중입니다. 자료 상태를 다시 조회해 주세요.");
    const metadataBase = row.metadata as Record<string, unknown>;
    const claimed = { ...row, metadata: { ...metadataBase, __peUpload: state } };
    let parsedText = row.parsedText;
    let warning = true;
    try {
      const bytes = await this.ports.read(row.url, PE_DOCUMENT_MAX_BYTES);
      if (!Buffer.isBuffer(bytes) || bytes.length !== row.size || bytes.length > PE_DOCUMENT_MAX_BYTES) throw new Error("Stored source unavailable");
      const fingerprint = createHash("sha256").update(JSON.stringify([row.name, row.mimeType, row.type, row.size,
        createHash("sha256").update(bytes).digest("hex")])).digest("hex");
      if (fingerprint !== prior.fingerprint) throw new Error("Stored source changed");
      const parsed = await this.ports.parse(bytes, row.mimeType, row.name);
      if (typeof parsed.text === "string" && parsed.text.trim()) {
        warning = !!parsed.warning || parsed.text.length > 500_000;
        parsedText = warning && row.parsedText ? row.parsedText : parsed.text.slice(0, 500_000);
      }
    } catch { /* Preserve previously extracted text and the confirmed original on every uncertain parse. */ }
    const metadata: Record<string, unknown> = { ...metadataBase, __peUpload: { ...state, phase: warning ? "WARNING" : "READY", token: null } };
    if (warning) metadata.warning = "원본은 보존되었지만 텍스트 추출을 완료하지 못했습니다. 원본을 확인해 주세요.";
    else delete metadata.warning;
    if (!await this.ports.repository.update(claimed, token, this.ports.now(), { parsedText, metadata })) throw new PEUploadError(409, "텍스트 추출 결과를 저장하지 못했습니다. 자료 상태를 다시 조회해 주세요.");
    return { id: row.id, status: "ready", parseStatus: warning ? "unavailable" : "complete", retryAllowed: warning && state.parseAttempts! < 3,
      parseAttempts: state.parseAttempts!, ...(warning ? { warning: "원본은 보존되었지만 텍스트 추출을 완료하지 못했습니다. 원본을 확인해 주세요." } : {}) };
  }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
export function createPrismaPEUploadRepository(client: Pick<PrismaClient, "mADocument">): PEParseRecoveryRepository {
  return {
    find: id => client.mADocument.findUnique({ where: { id } }),
    claimParse: async (row, token, now) => {
      const summary = peDocumentParseSummary(row, now);
      if (!summary.parseRetryAllowed) return false;
      const prior = stateOf(row);
      const metadata = { ...row.metadata as Record<string, unknown>, __peUpload: { ...prior, phase: "PARSING", token,
        expiresAt: now.getTime() + LEASE_MS, parseAttempts: summary.parseAttempts + 1 } };
      const changed = await client.mADocument.updateMany({ where: { id: row.id, maDealId: row.maDealId, url: row.url,
        name: row.name, mimeType: row.mimeType, type: row.type, size: row.size,
        metadata: { equals: json(row.metadata) } }, data: { metadata: json(metadata) } });
      return changed.count === 1;
    },
    reserve: async row => {
      try {
        // PostgreSQL resolves the expected reservation race without emitting a unique-error log.
        // This adapter requires PostgreSQL at runtime; the optional SQLite generated client
        // used for offline type checking does not declare PostgreSQL's skipDuplicates option.
        const documents = client.mADocument as unknown as {
          createMany(input: { data: Prisma.MADocumentCreateManyInput[]; skipDuplicates: boolean }): Promise<{ count: number }>;
        };
        const input = { data: [{ ...row, metadata: json(row.metadata) }], skipDuplicates: true };
        return (await documents.createMany(input)).count === 1;
      } catch { throw new PEUploadError(503); }
    },
    update: async (row, token, now, patch) => {
      const state = stateOf(row);
      if (state.token !== token || state.expiresAt <= now.getTime() || !["STORING", "PARSING"].includes(state.phase)) return false;
      const changed = await client.mADocument.updateMany({ where: { id: row.id, maDealId: row.maDealId, url: row.url,
        name: row.name, mimeType: row.mimeType, type: row.type, size: row.size,
        metadata: { equals: json(row.metadata) } }, data: { ...patch, metadata: json(patch.metadata) } });
      return changed.count === 1;
    },
  };
}

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { put as blobPut, del as blobDel, head as blobHead } from "@vercel/blob";
import path from "path";
import fs from "fs/promises";
import { resolveStorageMode } from "./storage-configuration";

// STORAGE_MODE을 명시하지 않아도 Vercel Blob 스토어가 연결돼 있으면
// (BLOB_READ_WRITE_TOKEN 자동 주입) 그쪽을 기본으로 쓴다. Vercel 서버리스는
// 배포 파일시스템이 읽기 전용이라 "local" 모드는 로컬 개발 전용이다.
const storageMode = resolveStorageMode(process.env);

const s3Client =
  storageMode === "s3"
    ? new S3Client({
        region: process.env.AWS_REGION ?? "ap-northeast-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        },
      })
    : null;

const bucket = process.env.AWS_S3_BUCKET ?? "";
const uploadDir = process.env.UPLOAD_DIR ?? "./.private-uploads";

/** Vercel Blob 자체 스토어 호스트를 구성할 때만 사용한다. */
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export class PrivateStorageConfigurationError extends Error {}
export function assertPrivateBlobUploads(): void {
  if (process.env.BLOB_STORE_ACCESS !== "private" || !configuredBlobHost() || !process.env.BLOB_READ_WRITE_TOKEN) throw new PrivateStorageConfigurationError("비공개 Blob 저장소와 BLOB_STORE_ACCESS=private 설정을 확인해주세요");
}

export function configuredBlobHost(access: "public" | "private" = "private"): string | null {
  const rawStoreId = process.env.BLOB_STORE_ID ?? process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
  const storeId = rawStoreId?.replace(/^store_/, "");
  return storeId && /^[A-Za-z0-9]+$/.test(storeId) ? `${storeId.toLowerCase()}.${access}${BLOB_HOST_SUFFIX}` : null;
}
/** Explicit old public stores remain readable after switching new uploads to a private store. */
export function configuredLegacyPublicBlobHosts(): string[] {
  return (process.env.BLOB_LEGACY_PUBLIC_STORE_IDS ?? "").split(",").map((id) => id.trim().replace(/^store_/, ""))
    .filter((id) => /^[A-Za-z0-9]+$/.test(id)).map((id) => `${id.toLowerCase()}.public${BLOB_HOST_SUFFIX}`);
}
export function safeStorageKey(key: string): string {
  if (!key || key.length > 1024 || /[\\\x00-\x1f?#%]/.test(key) || key.startsWith("/") || key.split("/").some((part) => !part || part === "." || part === "..") || !/^[A-Za-z0-9_./-]+$/.test(key)) throw new Error("잘못된 저장 경로입니다");
  return key;
}
function privateLocalDir(): string {
  const dir = path.resolve(process.cwd(), uploadDir);
  const publicDir = path.resolve(process.cwd(), "public");
  const relative = path.relative(publicDir, dir);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("업로드 저장 위치는 public 디렉터리 밖이어야 합니다");
  return dir;
}
function localFile(ref: string): string {
  if (ref.startsWith("private-local:")) return path.join(privateLocalDir(), safeStorageKey(ref.slice(14)).replace(/\//g, "_"));
  if (ref.startsWith("/uploads/")) return path.join(process.cwd(), "public/uploads", safeStorageKey(ref.slice(9)).replace(/\//g, "_"));
  return path.join(privateLocalDir(), safeStorageKey(ref).replace(/\//g, "_"));
}
function blobAddress(ref: string): URL {
  if (/%|\.\.|\\/.test(ref)) throw new Error("허용되지 않은 저장 주소입니다");
  const url = new URL(ref);
  const hosts = [configuredBlobHost("public"), configuredBlobHost("private"), ...configuredLegacyPublicBlobHosts()];
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !hosts.includes(url.hostname) || /%|\.\./.test(url.pathname)) throw new Error("허용되지 않은 저장 주소입니다");
  safeStorageKey(url.pathname.slice(1));
  return url;
}
export async function readBoundedResponse(response: Response, limit = 50 * 1024 * 1024): Promise<Buffer> {
  if (Number(response.headers.get("content-length") ?? 0) > limit) throw new Error("파일 크기 제한을 초과했습니다");
  if (!response.body) throw new Error("파일을 읽을 수 없습니다");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("파일 크기 제한을 초과했습니다");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}
function s3Key(ref: string): string {
  if (!ref.startsWith("https://")) return safeStorageKey(ref);
  if (/%|\.\.|\\/.test(ref)) throw new Error("허용되지 않은 저장 주소입니다");
  const url = new URL(ref);
  if (url.hostname !== `${bucket}.s3.${process.env.AWS_REGION ?? "ap-northeast-2"}.amazonaws.com` || url.username || url.password || url.port || url.search || url.hash) throw new Error("허용되지 않은 저장 주소입니다");
  return safeStorageKey(url.pathname.slice(1));
}

/**
 * 클라이언트가 보낸 Blob URL이 우리가 발급한 업로드 자리인지 검증한다.
 *
 * 큰 파일은 브라우저에서 Blob으로 직접 올린 뒤 그 URL을 서버로 보내는데,
 * 이 값을 그대로 믿고 서버가 fetch하면(readStoredFile) 로그인한 사용자가
 * 아무 주소나 서버에게 대신 요청시킬 수 있다(SSRF). 응답 본문이 그대로
 * parsedText로 저장돼 화면에 보이기까지 하므로 내용 유출로도 이어진다.
 *
 * 자체 private 스토어 호스트와 기대한 접두사만 허용한다.
 */
export function isAllowedBlobUrl(
  urlString: string,
  expectedPrefix: string,
  expectedHost: string | null = configuredBlobHost()
): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!expectedHost || url.hostname !== expectedHost || url.username || url.password || url.port || url.search || url.hash) return false;
  if (/%|\.\./.test(url.pathname) || /\\|\.\./.test(urlString)) return false;
  // URL 인코딩된 "../" 등으로 접두사 검사를 우회하지 못하게 디코드 후 확인한다.
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (pathname.includes("..")) return false;
  return pathname.startsWith(`/${expectedPrefix}`);
}

/** Verify a server-known immutable upload key against the configured private backend. */
export function isPrivateStoredFileReference(ref: string, expectedKey: string): boolean {
  try {
    safeStorageKey(expectedKey);
    if (storageMode === "vercel-blob") return isAllowedBlobUrl(ref, expectedKey) && new URL(ref).pathname === `/${expectedKey}`;
    if (storageMode === "s3") return ref.startsWith("https://") && s3Key(ref) === expectedKey;
    return ref === `private-local:${expectedKey}`;
  } catch { return false; }
}

export async function uploadFile(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  safeStorageKey(key);
  if (storageMode === "vercel-blob") {
    assertPrivateBlobUploads();
    const blob = await blobPut(key, buffer, {
      access: "private",
      contentType: mimeType,
      addRandomSuffix: false,
    }).catch(() => { throw new PrivateStorageConfigurationError("비공개 Blob 저장소 연결을 확인해주세요. 공개 저장소에는 업로드할 수 없습니다"); });
    return blob.url;
  }

  if (storageMode === "s3" && s3Client) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    return `https://${bucket}.s3.${process.env.AWS_REGION ?? "ap-northeast-2"}.amazonaws.com/${key}`;
  }

  // Local storage fallback
  const localDir = privateLocalDir();
  await fs.mkdir(localDir, { recursive: true });
  const filePath = path.join(localDir, key.replace(/\//g, "_"));
  await fs.writeFile(filePath, buffer);
  return `private-local:${key}`;
}

/**
 * 저장된 파일을 다시 읽는다 (양식 재현 시 원본 DOCX 필요).
 * 읽지 못하면 null을 반환해 호출부가 폴백하도록 한다.
 */
export async function readStoredFile(
  urlOrKey: string,
  maxBytes = 50 * 1024 * 1024
): Promise<Buffer | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 50 * 1024 * 1024) return null;
  try {
    if (storageMode === "vercel-blob" || urlOrKey.includes(".blob.vercel-storage.com")) {
      // 타임아웃 필수 — 이 호출은 업로드·내보내기·양식 분석의 길목이라,
      // Blob이 응답하지 않으면 함수 실행시간(60초)을 통째로 태우고 강제
      // 종료된다. 못 읽으면 null로 폴백하는 게 낫다.
      const url = blobAddress(urlOrKey);
      const headers: Record<string, string> = {};
      if (url.hostname.includes(".private.")) {
        if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
        headers.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
      }
      const response = await fetch(url.href, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      return await readBoundedResponse(response, maxBytes);
    }

    if (storageMode === "s3" && s3Client) {
      // 전체 URL로 저장돼 있으면 키만 떼어낸다
      const key = s3Key(urlOrKey);
      const res = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const body = res.Body?.transformToWebStream();
      if ((res.ContentLength ?? 0) > maxBytes) {
        await body?.cancel().catch(() => {});
        return null;
      }
      return body ? await readBoundedResponse(new Response(body), maxBytes) : null;
    }

    // 로컬: uploadFile이 반환한 "/uploads/<name>" 형태를 되돌린다
    const file = localFile(urlOrKey);
    const handle = await fs.open(file, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) return null;
      const chunks: Buffer[] = [];
      let length = 0;
      while (true) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - length + 1));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        length += bytesRead;
        if (length > maxBytes) return null;
        chunks.push(chunk.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks, length);
    } finally { await handle.close(); }
  } catch {
    return null;
  }
}

/**
 * 저장된 파일을 URL로 삭제한다 (Document.url / Template.fileUrl 에 저장된 형태).
 *
 * deleteFile()은 업로드 시점의 key를 받지만, DB에는 업로드 결과 URL만 남기
 * 때문에 그대로는 지울 수 없다. 지우지 못하면 Blob에 파일이 영구히 쌓여
 * 스토리지 요금만 계속 나간다.
 *
 * 삭제 실패가 상위 작업(딜/문서 삭제)을 막으면 안 되므로 예외를 삼키고
 * 성공 여부만 돌려준다.
 */
export async function deleteStoredFile(urlOrKey: string): Promise<boolean> {
  try {
    if (
      storageMode === "vercel-blob" ||
      urlOrKey.includes(".blob.vercel-storage.com")
    ) {
      // Vercel Blob의 del()은 공개 URL을 그대로 받는다.
      blobAddress(urlOrKey);
      await blobDel(urlOrKey);
      return true;
    }

    if (storageMode === "s3" && s3Client) {
      const key = s3Key(urlOrKey);
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
      return true;
    }

    await fs.unlink(localFile(urlOrKey));
    return true;
  } catch {
    console.warn("[Storage] 파일 삭제 실패 (무시)");
    return false;
  }
}

export async function getFileUrl(key: string): Promise<string> {
  void key;
  throw new Error("문서 ID를 사용하는 인증 다운로드 경로가 필요합니다");
}

export async function deleteFile(key: string): Promise<void> {
  if (storageMode === "vercel-blob") {
    blobAddress(key);
    await blobDel(key);
    return;
  }
  if (storageMode === "s3" && s3Client) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: s3Key(key) })
    );
    return;
  }
  const filePath = localFile(key);
  await fs.unlink(filePath).catch(() => {});
}

/** Verify immutable object metadata in our private store before registration. */
export async function verifyUploadedBlob(url: string, pathname: string, size: number, mimeType: string): Promise<void> {
  if (!isAllowedBlobUrl(url, pathname) || new URL(url).pathname !== `/${pathname}`) throw new Error("업로드 승인과 저장 주소가 다릅니다");
  const blob = await blobHead(url, { abortSignal: AbortSignal.timeout(15000) });
  if (blob.pathname !== pathname || blob.size !== size || blob.contentType !== mimeType) throw new Error("업로드 파일의 크기 또는 형식이 다릅니다");
}

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { put as blobPut, del as blobDel } from "@vercel/blob";
import path from "path";
import fs from "fs/promises";

// STORAGE_MODE을 명시하지 않아도 Vercel Blob 스토어가 연결돼 있으면
// (BLOB_READ_WRITE_TOKEN 자동 주입) 그쪽을 기본으로 쓴다. Vercel 서버리스는
// 배포 파일시스템이 읽기 전용이라 "local" 모드는 로컬 개발 전용이다.
const storageMode =
  process.env.STORAGE_MODE ?? (process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local");

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
const uploadDir = process.env.UPLOAD_DIR ?? "./public/uploads";

export async function uploadFile(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  if (storageMode === "vercel-blob") {
    const blob = await blobPut(key, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
    });
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
    return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  // Local storage fallback
  const localDir = path.join(process.cwd(), uploadDir);
  await fs.mkdir(localDir, { recursive: true });
  const filePath = path.join(localDir, key.replace(/\//g, "_"));
  await fs.writeFile(filePath, buffer);
  return `/uploads/${key.replace(/\//g, "_")}`;
}

/**
 * 저장된 파일을 다시 읽는다 (양식 재현 시 원본 DOCX 필요).
 * 읽지 못하면 null을 반환해 호출부가 폴백하도록 한다.
 */
export async function readStoredFile(
  urlOrKey: string
): Promise<Buffer | null> {
  try {
    if (storageMode === "vercel-blob" || urlOrKey.includes(".blob.vercel-storage.com")) {
      const res = await fetch(urlOrKey);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }

    if (storageMode === "s3" && s3Client) {
      // 전체 URL로 저장돼 있으면 키만 떼어낸다
      const key = urlOrKey.startsWith("http")
        ? new URL(urlOrKey).pathname.replace(/^\//, "")
        : urlOrKey;
      const res = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    }

    // 로컬: uploadFile이 반환한 "/uploads/<name>" 형태를 되돌린다
    const name = urlOrKey.replace(/^\/uploads\//, "").replace(/\//g, "_");
    const filePath = path.join(process.cwd(), uploadDir, name);
    return await fs.readFile(filePath);
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
      await blobDel(urlOrKey);
      return true;
    }

    if (storageMode === "s3" && s3Client) {
      const key = urlOrKey.startsWith("http")
        ? new URL(urlOrKey).pathname.replace(/^\//, "")
        : urlOrKey;
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
      return true;
    }

    const name = urlOrKey.replace(/^\/uploads\//, "").replace(/\//g, "_");
    await fs.unlink(path.join(process.cwd(), uploadDir, name));
    return true;
  } catch (error) {
    console.warn(`[Storage] 파일 삭제 실패 (무시): ${urlOrKey}`, error);
    return false;
  }
}

export async function getFileUrl(key: string): Promise<string> {
  if (storageMode === "vercel-blob") {
    // uploadFile이 이미 공개 URL을 반환하므로 key 자체가 URL이다.
    return key;
  }
  if (storageMode === "s3" && s3Client) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
  return `/uploads/${key.replace(/\//g, "_")}`;
}

export async function deleteFile(key: string): Promise<void> {
  if (storageMode === "vercel-blob") {
    await blobDel(key);
    return;
  }
  if (storageMode === "s3" && s3Client) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
    return;
  }
  const filePath = path.join(
    process.cwd(),
    uploadDir,
    key.replace(/\//g, "_")
  );
  await fs.unlink(filePath).catch(() => {});
}

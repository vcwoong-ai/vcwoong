import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import fs from "fs/promises";

const storageMode = process.env.STORAGE_MODE ?? "local";

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

export async function getFileUrl(key: string): Promise<string> {
  if (storageMode === "s3" && s3Client) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
  return `/uploads/${key.replace(/\//g, "_")}`;
}

export async function deleteFile(key: string): Promise<void> {
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

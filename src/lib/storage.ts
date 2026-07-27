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

export async function getFileUrl(key: string): Promise<string> {
  if (storageMode === "s3" && s3Client) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
  return `/uploads/${key.replace(/\//g, "_")}`;
}

/**
 * uploadFile이 돌려준 URL로 원본 파일을 다시 읽는다.
 * 양식 재현 엔진이 업로드된 원본 DOCX/PPTX를 열 때 사용한다.
 */
export async function readFileByUrl(fileUrl: string): Promise<Buffer | null> {
  try {
    if (storageMode === "s3" && s3Client) {
      const key = new URL(fileUrl).pathname.replace(/^\//, "");
      const result = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    }

    const name = path.basename(fileUrl);
    return await fs.readFile(path.join(process.cwd(), uploadDir, name));
  } catch {
    return null;
  }
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

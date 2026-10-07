import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { resolveStorageMode } from "@/lib/storage-configuration";
import { assertPrivateBlobUploads, readBoundedResponse, readStoredFile, uploadFile, verifyUploadedBlob } from "@/lib/storage";
import { authorizeMeetingRequest, meetingHeaders, meetingJson, meetingFailure, type MeetingParams } from "@/lib/meetings/http";
import { scopedMeeting, assertUploadPending, claimLocalUpload, completeMeetingUpload } from "@/lib/meetings/service";
import { MAX_LOCAL_AUDIO_BYTES, MeetingError, validateAudio, verifyAudioSignature } from "@/lib/meetings/policy";

export const maxDuration = 60;
export async function POST(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  let localToken: string | undefined;
  try {
    const scope = await authorizeMeetingRequest(request, params, true);
    const meeting = await scopedMeeting(scope, params.meetingId);
    assertUploadPending(meeting);
    const mode = resolveStorageMode(process.env);
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      if (mode !== "local" || process.env.NODE_ENV === "production") throw new MeetingError("오디오를 비공개 저장소로 직접 업로드해주세요.");
      if (meeting.fileSize > MAX_LOCAL_AUDIO_BYTES) throw new MeetingError("로컬 업로드는 4MiB까지 지원합니다. 큰 파일은 비공개 Blob 저장소를 연결해주세요.", 413);
      const bytes = await readBoundedResponse(new Response(request.body, { headers: request.headers }), MAX_LOCAL_AUDIO_BYTES + 32 * 1024);
      const form = await new Request("https://meeting-upload.invalid", { method: "POST", body: new Uint8Array(bytes), headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.name !== meeting.fileName || file.size !== meeting.fileSize || file.type !== meeting.mimeType) throw new MeetingError("승인한 파일과 업로드가 다릅니다.");
      const buffer = Buffer.from(await file.arrayBuffer());
      verifyAudioSignature(buffer, validateAudio(meeting));
      localToken = await claimLocalUpload(meeting);
      const ref = await uploadFile(buffer, meeting.storageKey, meeting.mimeType);
      await completeMeetingUpload(meeting, ref, createHash("sha256").update(buffer).digest("hex"), localToken);
    } else {
      if (mode !== "vercel-blob") throw new MeetingError("비공개 Blob 저장소 설정을 확인해주세요.", 503);
      assertPrivateBlobUploads();
      const body = z.object({ type: z.string() }).passthrough().parse(await meetingJson(request, 8192));
      if (body.type === "blob.generate-client-token") {
        const tokenBody: HandleUploadBody = z.object({ type: z.literal("blob.generate-client-token"), payload: z.object({
          pathname: z.string().max(1024), multipart: z.boolean(), clientPayload: z.string().max(1024).nullable(),
        }) }).parse(body);
        const response = await handleUpload({ body: tokenBody, request,
          onBeforeGenerateToken: async pathname => {
            if (pathname !== meeting.storageKey) throw new MeetingError("승인한 업로드 경로와 다릅니다.");
            return { allowedContentTypes: [meeting.mimeType], maximumSizeInBytes: meeting.fileSize,
              validUntil: meeting.createdAt.getTime() + 15 * 60_000, addRandomSuffix: false, allowOverwrite: false,
              tokenPayload: JSON.stringify({ meetingId: meeting.id }) };
          }, onUploadCompleted: async () => {} });
        return NextResponse.json(response, { headers: meetingHeaders });
      }
      if (body.type !== "meeting.complete") throw new MeetingError("업로드 요청을 확인해주세요.");
      const { blobUrl } = z.object({ blobUrl: z.string().max(2048) }).parse(body);
      await verifyUploadedBlob(blobUrl, meeting.storageKey, meeting.fileSize, meeting.mimeType);
      const buffer = await readStoredFile(blobUrl, meeting.fileSize);
      if (!buffer || buffer.length !== meeting.fileSize) throw new MeetingError("저장된 오디오를 확인하지 못했습니다.", 503);
      verifyAudioSignature(buffer, validateAudio(meeting));
      await completeMeetingUpload(meeting, blobUrl, createHash("sha256").update(buffer).digest("hex"));
    }
    return NextResponse.json({ message: "업로드를 완료했습니다. 전사 작업을 기다리고 있습니다." }, { headers: meetingHeaders });
  } catch (error) {
    if (localToken) await prisma.meeting.updateMany({ where: { id: params.meetingId, status: "UPLOADING", leaseToken: localToken },
      data: { status: "UNKNOWN_UPLOAD", errorCode: "UPLOAD_RESULT_UNCONFIRMED", leaseToken: null, leaseUntil: null } }).catch(() => {});
    return meetingFailure(error);
  }
}

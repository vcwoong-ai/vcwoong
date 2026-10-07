import { NextRequest } from "next/server";
import { readStoredFile } from "@/lib/storage";
import { authorizeMeetingRequest, meetingHeaders, meetingFailure, type MeetingParams } from "@/lib/meetings/http";
import { scopedMeeting } from "@/lib/meetings/service";
import { MeetingError } from "@/lib/meetings/policy";
import { createHash } from "node:crypto";

export async function GET(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  try {
    const scope = await authorizeMeetingRequest(request, params);
    const meeting = await scopedMeeting(scope, params.meetingId);
    if (!meeting.storageRef || !meeting.sha256) throw new MeetingError("원본 오디오를 찾을 수 없습니다.", 404);
    const buffer = await readStoredFile(meeting.storageRef, meeting.fileSize);
    if (!buffer || createHash("sha256").update(buffer).digest("hex") !== meeting.sha256) throw new MeetingError("원본 오디오를 확인하지 못했습니다.", 503);
    let start = 0, end = buffer.length - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { ...meetingHeaders, "Content-Range": `bytes */${buffer.length}` } });
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= buffer.length) return new Response(null, { status: 416, headers: { ...meetingHeaders, "Content-Range": `bytes */${buffer.length}` } });
    }
    const chunk = new Uint8Array(buffer.subarray(start, end + 1));
    // Stream the bounded file to avoid a buffered serverless response size limit.
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.close(); } }),
      { status: range ? 206 : 200, headers: { ...meetingHeaders, "Content-Type": meeting.mimeType,
        "Accept-Ranges": "bytes", "Content-Length": String(chunk.length),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${buffer.length}` } : {}) } });
  } catch (error) { return meetingFailure(error); }
}

import { NextRequest } from "next/server";
import { attachmentHeaders } from "@/lib/upload-security";
import { authorizeMeetingRequest, meetingFailure, type MeetingParams } from "@/lib/meetings/http";
import { scopedMeeting } from "@/lib/meetings/service";
import { meetingExport } from "@/lib/meetings/export";
import { MeetingError } from "@/lib/meetings/policy";

export async function GET(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  try {
    const scope = await authorizeMeetingRequest(request, params);
    const meeting = await scopedMeeting(scope, params.meetingId);
    if (meeting.status !== "APPROVED" || !meeting.approvedAt) throw new MeetingError("검토·확정한 회의록만 내보낼 수 있습니다.", 409);
    return new Response(meetingExport(meeting), { headers: { ...attachmentHeaders(`${meeting.title}-v${meeting.version}.md`), Vary: "Cookie" } });
  } catch (error) { return meetingFailure(error); }
}

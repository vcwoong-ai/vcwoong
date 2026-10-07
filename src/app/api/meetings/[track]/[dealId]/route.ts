import { NextRequest, NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingHeaders, meetingJson, meetingFailure, type MeetingParams } from "@/lib/meetings/http";
import { listMeetings, prepareMeeting, publicMeeting } from "@/lib/meetings/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { MeetingError } from "@/lib/meetings/policy";

export async function GET(request: NextRequest, { params }: { params: MeetingParams }) {
  try {
    const scope = await authorizeMeetingRequest(request, params);
    return NextResponse.json({ data: await listMeetings(scope) }, { headers: meetingHeaders });
  } catch (error) { return meetingFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: MeetingParams }) {
  try {
    const scope = await authorizeMeetingRequest(request, params, true);
    const rate = await checkRateLimit(`meeting-prepare:${scope.actorUserId}`, 30, 60 * 60_000);
    if (!rate.allowed) throw new MeetingError("요청이 많습니다. 잠시 후 다시 시도해주세요.", 429);
    const meeting = await prepareMeeting(scope, await meetingJson(request, 8192));
    return NextResponse.json({ data: publicMeeting(meeting), pathname: meeting.storageKey }, { status: 201, headers: meetingHeaders });
  } catch (error) { return meetingFailure(error); }
}

import { NextRequest, NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingHeaders, meetingJson, meetingFailure, type MeetingParams } from "@/lib/meetings/http";
import { scopedMeeting, publicMeeting, reviseMeeting, removeMeeting } from "@/lib/meetings/service";

export async function GET(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  try {
    const scope = await authorizeMeetingRequest(request, params);
    return NextResponse.json({ data: publicMeeting(await scopedMeeting(scope, params.meetingId), true) }, { headers: meetingHeaders });
  } catch (error) { return meetingFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  try {
    const scope = await authorizeMeetingRequest(request, params, true);
    const meeting = await scopedMeeting(scope, params.meetingId);
    const updated = await reviseMeeting(scope, meeting, await meetingJson(request));
    return NextResponse.json({ data: publicMeeting(updated, true) }, { headers: meetingHeaders });
  } catch (error) { return meetingFailure(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: MeetingParams & { meetingId: string } }) {
  try {
    const scope = await authorizeMeetingRequest(request, params, true, false);
    await removeMeeting(scope, await scopedMeeting(scope, params.meetingId));
    return NextResponse.json({ message: "회의 기록을 삭제했습니다." }, { headers: meetingHeaders });
  } catch (error) { return meetingFailure(error); }
}

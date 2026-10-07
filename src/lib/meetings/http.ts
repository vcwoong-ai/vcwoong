import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { readBoundedResponse } from "@/lib/storage";
import { MeetingError, TRACKS } from "./policy";
import { meetingScope } from "./service";

export const meetingHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
export type MeetingParams = { track: string; dealId: string; meetingId?: string };
export async function authorizeMeetingRequest(request: NextRequest, params: MeetingParams, write = false, paid = write) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new MeetingError("로그인이 필요합니다.", 401);
  if (write) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) throw new MeetingError("요청 출처를 확인해주세요.", 403);
  }
  const track = z.enum(TRACKS).safeParse(params.track);
  if (!track.success) throw new MeetingError("딜을 찾을 수 없습니다.", 404);
  return meetingScope(session.user.id, track.data, params.dealId, write, paid);
}
export async function meetingJson(request: NextRequest, maxBytes = 64 * 1024) {
  try {
    const bytes = await readBoundedResponse(new Response(request.body, { headers: request.headers }), maxBytes);
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch { throw new MeetingError("요청 내용을 확인해주세요. 허용 크기를 초과했을 수 있습니다.", 400); }
}
export function meetingFailure(error: unknown) {
  return NextResponse.json({ error: error instanceof MeetingError ? error.message
    : error instanceof z.ZodError ? "입력 내용을 확인해주세요." : "회의 기록 상태를 확인하지 못했습니다. 잠시 후 다시 조회해주세요." },
    { status: error instanceof MeetingError ? error.status : error instanceof z.ZodError ? 400 : 503, headers: meetingHeaders });
}

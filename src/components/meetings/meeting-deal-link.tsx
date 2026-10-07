import Link from "next/link";
import { meetingPolicy, type MeetingTrack } from "@/lib/meetings/policy";

export function MeetingDealLink({ track, dealId }: { track: MeetingTrack; dealId: string }) {
  if (!meetingPolicy().enabled) return null;
  return <div className="mb-4"><Link href={`/meetings/${track}/${dealId}`} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">미팅 기록 · 녹음 파일과 회의록</Link></div>;
}

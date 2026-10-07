import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { MeetingWorkspace } from "@/components/meetings/meeting-workspace";
import { meetingPolicy, TRACKS, MeetingError } from "@/lib/meetings/policy";
import { meetingScope } from "@/lib/meetings/service";
import { resolveStorageMode } from "@/lib/storage-configuration";
import { z } from "zod";

export const dynamic = "force-dynamic";
export default async function MeetingsPage({ params, searchParams }: { params: { track: string; dealId: string }; searchParams: { meeting?: string; version?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const parsed = z.enum(TRACKS).safeParse(params.track);
  if (!parsed.success) notFound();
  const track = parsed.data, policy = meetingPolicy();
  if (!policy.enabled || !policy.configured) return <AppLayout title="미팅 기록"><div className="space-y-4 p-6"><h1 className="text-2xl font-semibold">미팅 기록</h1><p className="text-muted-foreground">녹음 파일을 회의록과 투자 검토 자료로 정리하는 기능을 준비 중입니다.</p><Link href={track === "vc" ? `/deals/${params.dealId}` : `/ma-deals/${params.dealId}`} className="text-sm underline">딜로 돌아가기</Link></div></AppLayout>;
  let scope;
  try { scope = await meetingScope(session.user.id, track, params.dealId); }
  catch (error) { if (error instanceof MeetingError && error.status === 404) notFound(); throw error; }
  let canWrite = true;
  try { await meetingScope(session.user.id, track, params.dealId, true); }
  catch (error) { if (error instanceof MeetingError && [402, 404].includes(error.status)) canWrite = false; else throw error; }
  let canDelete = true;
  try { await meetingScope(session.user.id, track, params.dealId, true, false); }
  catch (error) { if (error instanceof MeetingError && error.status === 404) canDelete = false; else throw error; }
  const rawMode = resolveStorageMode(process.env);
  const mode = rawMode === "vercel-blob" ? "vercel-blob" : rawMode === "s3" ? "s3" : "local";
  const uploadReady = !!process.env.MEETING_OPENAI_API_KEY && !!process.env.MEETING_FFPROBE_PATH
    && (rawMode === "vercel-blob" ? process.env.BLOB_STORE_ACCESS === "private" : rawMode === "local" && process.env.NODE_ENV !== "production");
  const linkedMeeting = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).safeParse(searchParams.meeting);
  const linkedVersion = z.coerce.number().int().nonnegative().safeParse(searchParams.version);
  return <AppLayout title={`${scope.companyName} · 미팅 기록`}><div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div className="space-y-2"><Link className="text-sm text-muted-foreground underline" href={track === "vc" ? `/deals/${params.dealId}` : `/ma-deals/${params.dealId}`}>딜로 돌아가기</Link><h1 className="text-2xl font-semibold">{scope.companyName} 미팅 기록</h1><p className="text-sm text-muted-foreground">녹음 내용을 검토하고, 투자 판단에 필요한 주장과 보완 자료를 정리하세요.</p></div>
    {!uploadReady && <p className="rounded-lg border p-4 text-sm">녹음 처리 환경을 준비 중입니다. 기존 회의 기록은 조회할 수 있습니다.</p>}
    <MeetingWorkspace track={track} dealId={params.dealId} canWrite={canWrite} canUpload={canWrite && uploadReady} canDelete={canDelete} mode={mode} maxMinutes={policy.maxMinutes} monthlyMinutes={policy.monthlyMinutes} initialMeetingId={linkedMeeting.success ? linkedMeeting.data : undefined} referenceVersion={linkedVersion.success ? linkedVersion.data : undefined} />
  </div></AppLayout>;
}

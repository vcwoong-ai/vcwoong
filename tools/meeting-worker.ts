import { prisma } from "../src/lib/prisma";
import { processMeeting, maintainMeetings } from "../src/lib/meetings/worker";
import { meetingPolicy } from "../src/lib/meetings/policy";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const policy = meetingPolicy();
    console.log(JSON.stringify({ enabled: policy.enabled, limitsConfigured: policy.configured,
      providerConfigured: !!process.env.MEETING_OPENAI_API_KEY, probeConfigured: !!process.env.MEETING_FFPROBE_PATH }));
    console.log("설정 존재만 확인했습니다. DB와 유료 API를 호출하지 않았습니다.");
    return;
  }
  if (args.length !== 1 || !["--run-once", "--watch"].includes(args[0])) throw new Error("usage");
  if (!meetingPolicy().enabled || !meetingPolicy().configured || !process.env.MEETING_OPENAI_API_KEY || !process.env.MEETING_FFPROBE_PATH) throw new Error("configuration");
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    do {
      await maintainMeetings();
      const meeting = await prisma.meeting.findFirst({ where: { status: "QUEUED", deletedAt: null, providerStartedAt: null },
        orderBy: { createdAt: "asc" }, select: { id: true } });
      if (meeting) console.log(await processMeeting(meeting.id));
      else if (args[0] === "--run-once") console.log("NO_QUEUED_MEETING");
      if (args[0] === "--run-once" || stopping) break;
      await new Promise(resolve => setTimeout(resolve, meeting ? 1000 : 5000));
    } while (!stopping);
  } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
main().catch(() => { console.error("회의 작업 실행을 확인하지 못했습니다. 설정과 작업 상태를 확인해주세요."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProgress } from "@/lib/generation-progress";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { SECTION_META } from "@/types";

/**
 * Server-Sent Events endpoint for report generation progress.
 * Streams progress updates until generation completes or times out (5 min).
 *
 * 진행 상태 저장소는 프로세스 메모리라, 값이 없으면 DB 상태로 종료 여부를 확인한다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const reportId = params.id;
  const { teamId } = await getUserTeamContext(session.user.id);

  const owned = await prisma.report.findFirst({
    where: { id: reportId, ...reportReadWhere(session.user.id, teamId) },
    select: { id: true },
  });
  if (!owned) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller may already be closed
        }
      };

      // Poll every 400ms, max 5 minutes
      const maxAttempts = 750;
      // 서버리스/개발 환경에서는 라우트마다 모듈 인스턴스가 달라 메모리 진행
      // 상태가 비어 있을 수 있다. 이때는 DB 상태를 주기적으로 확인한다.
      const dbCheckEvery = 5; // 약 2초
      let attempts = 0;
      let finished = false;

      while (attempts < maxAttempts) {
        const progress = getProgress(reportId);

        if (progress) {
          send(progress);
          if (progress.status === "completed" || progress.status === "error") {
            finished = true;
            break;
          }
        } else if (attempts > 5 && attempts % dbCheckEvery === 0) {
          const current = await prisma.report.findUnique({
            where: { id: reportId },
            select: { status: true, _count: { select: { sections: true } } },
          });

          if (!current) {
            send({
              status: "error",
              completed: 0,
              total: 0,
              error: "보고서를 찾을 수 없습니다.",
            });
            finished = true;
            break;
          }

          if (current.status !== "GENERATING") {
            // 섹션이 저장되고 상태가 바뀌었으면 실제 완료
            send({
              status: current._count.sections > 0 ? "completed" : "error",
              completed: current._count.sections,
              total: current._count.sections,
              ...(current._count.sections === 0
                ? { error: "생성된 섹션이 없습니다. 다시 시도해 주세요." }
                : {}),
            });
            finished = true;
            break;
          }

          // 아직 생성 중 — 하트비트만 보내고 계속 기다린다.
          // total을 0으로 보내면 클라이언트가 진행 바를 아예 숨겨서
          // 멈춘 것처럼 보이므로, 전체 섹션 수를 넣어 진행 중임을 보여준다.
          send({
            status: "generating",
            completed: current._count.sections,
            total: SECTION_META.length,
            currentSection: "AI 분석 진행 중",
          });
        }

        await new Promise((r) => setTimeout(r, 400));
        attempts++;
      }

      if (!finished) {
        send({
          status: "error",
          completed: 0,
          total: 0,
          error: "생성 시간이 초과되었습니다. 보고서 상태를 확인해 주세요.",
        });
      }

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

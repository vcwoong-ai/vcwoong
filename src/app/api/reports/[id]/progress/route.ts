import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProgress } from "@/lib/generation-progress";

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

  const owned = await prisma.report.findFirst({
    where: { id: reportId, deal: { userId: session.user.id } },
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
      let attempts = 0;

      while (attempts < maxAttempts) {
        const progress = getProgress(reportId);

        if (progress) {
          send(progress);
          if (progress.status === "completed" || progress.status === "error") {
            break;
          }
        } else if (attempts > 10) {
          // 메모리에 진행 상태가 없으면 DB 상태로 판정 (다중 인스턴스/재시작 대비)
          const current = await prisma.report.findUnique({
            where: { id: reportId },
            select: { status: true, _count: { select: { sections: true } } },
          });

          if (!current || current.status === "GENERATING") {
            send({
              status: "error",
              completed: 0,
              total: 0,
              error:
                "생성 진행 상태를 확인할 수 없습니다. 잠시 후 새로고침해 주세요.",
            });
          } else {
            send({
              status: "completed",
              completed: current._count.sections,
              total: current._count.sections,
            });
          }
          break;
        }

        await new Promise((r) => setTimeout(r, 400));
        attempts++;
      }

      if (attempts >= maxAttempts) {
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

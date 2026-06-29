import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProgress } from "@/lib/generation-progress";

/**
 * Server-Sent Events endpoint for report generation progress.
 * Streams progress updates until generation completes or times out (5 min).
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
          // No progress found after initial grace period — report may have
          // already completed before the SSE connection was established.
          send({ status: "completed", completed: 0, total: 0 });
          break;
        }

        await new Promise((r) => setTimeout(r, 400));
        attempts++;
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

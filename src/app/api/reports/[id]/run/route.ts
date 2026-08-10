import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus } from "@prisma/client";
import {
  generateSectionsAsync,
  STALE_GENERATION_MS,
} from "@/lib/report-generation";
import { checkQuota } from "@/lib/quotas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

/**
 * mode:
 *  - "resume"(기본): 이미 만들어진 섹션은 그대로 두고 남은 섹션만 이어서 생성.
 *    타임아웃 후 "다시 시도"가 이 경로다.
 *  - "restart": 기존 섹션을 지우고 처음부터 다시 생성. "재생성" 버튼용.
 *    이 구분이 없으면 완성된 보고서에서 재생성을 눌러도 전 섹션이
 *    "기존 섹션 재사용"으로 건너뛰어져 아무것도 바뀌지 않는다.
 */
const runSchema = z.object({
  mode: z.enum(["resume", "restart"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 본문이 없거나 JSON이 아니면 기본값(resume)으로 둔다 — 재시도 호출은
  // 본문 없이 POST만 보내기 때문에 이걸로 실패하면 안 된다.
  let mode: "resume" | "restart" = "resume";
  try {
    const parsed = runSchema.safeParse(await request.json());
    if (parsed.success && parsed.data.mode) mode = parsed.data.mode;
  } catch {
    // 본문 없음 — resume 유지
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      ...reportWriteWhere(session.user.id, teamId, role),
    },
    include: {
      deal: {
        include: {
          documents: { select: { name: true, parsedText: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
  }

  // 함수가 실행시간 제한으로 강제 종료되면 상태가 GENERATING에 멈출 수 있다.
  // 일정 시간이 지나도 안 끝났으면 멈춘 것으로 보고 재시도를 허용한다.
  const isStale =
    report.status === ReportStatus.GENERATING &&
    Date.now() - report.updatedAt.getTime() > STALE_GENERATION_MS;

  if (report.status === ReportStatus.GENERATING && !isStale) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  if (report.deal.documents.length === 0) {
    return NextResponse.json(
      { error: "딜에 업로드된 문서가 없습니다. 먼저 IR 자료를 업로드해 주세요." },
      { status: 400 }
    );
  }

  // 월 한도와 별개로 단시간 폭주를 막는다 (생성 1건 = AI 호출 10회).
  const rate = await checkRateLimit(
    `report-gen:${session.user.id}`,
    RATE_LIMITS.reportGeneration.limit,
    RATE_LIMITS.reportGeneration.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "보고서 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const quota = await checkQuota(session.user.id, "report");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  // 동시 요청이 둘 다 통과하지 않도록 조건부 업데이트로 락을 건다.
  // stale(멈춘) GENERATING 상태도 재시도 대상에 포함한다.
  const claimed = await prisma.report.updateMany({
    where: {
      id: report.id,
      OR: [
        { status: { not: ReportStatus.GENERATING } },
        {
          status: ReportStatus.GENERATING,
          updatedAt: { lt: new Date(Date.now() - STALE_GENERATION_MS) },
        },
      ],
    },
    data: { status: ReportStatus.GENERATING },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  // 재생성이면 기존 섹션을 비운다. 락을 잡은 뒤에 지워야 동시 요청이
  // 남의 섹션을 지우는 일이 없다.
  if (mode === "restart") {
    const removed = await prisma.reportSection.deleteMany({
      where: { reportId: report.id },
    });
    console.log(
      `[Report] report=${report.id} 재생성 — 기존 섹션 ${removed.count}개 삭제`
    );
  }

  // 응답을 먼저 보낸 뒤에도 Vercel이 함수를 바로 얼리지 않도록 생성 작업의
  // 수명을 연장한다. waitUntil 없이 fire-and-forget으로 두면 서버리스
  // 인스턴스가 응답 직후 정지되면서 생성이 중간에 끊길 수 있다.
  waitUntil(
    generateSectionsAsync(
      report.id,
      report.deal,
      report.agentType,
      undefined,
      session.user.id
    ).catch((err) => console.error("generateSectionsAsync failed:", err))
  );

  return NextResponse.json({ data: { id: report.id, status: "GENERATING" } });
}

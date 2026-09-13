import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus } from "@prisma/client";
import {
  generateSectionsAsync,
  claimPendingGeneration,
  STALE_GENERATION_MS,
} from "@/lib/report-generation";
import { checkQuota } from "@/lib/quotas";
import {
  checkRateLimit,
  RATE_LIMITS,
  isAutoResumeExemptFromRateLimit,
} from "@/lib/rate-limit";
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
 *
 * trigger:
 *  - "user"(기본): 사람이 버튼을 눌러 명시적으로 보낸 요청 — report-gen
 *    rate limit을 그대로 적용한다.
 *  - "auto": 브라우저가 체크포인트(PENDING)를 감지하고 사용자 조작 없이
 *    스스로 이어서 호출한 것(report-wizard.tsx/report-page-client.tsx의
 *    폴링 auto-resume) — rate limit에서 제외한다(isAutoResumeExemptFromRateLimit
 *    참고). mode="restart"와 함께 오면(있을 수 없는 조합이지만) 항상
 *    카운트되도록 fail-safe한다.
 */
const runSchema = z.object({
  mode: z.enum(["resume", "restart"]).optional(),
  trigger: z.enum(["user", "auto"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 본문이 없거나 JSON이 아니면 기본값(resume/user)으로 둔다 — 사용자가
  // 명시적으로 누르는 호출은 본문 없이 POST만 보내는 경우가 많기 때문에
  // 이걸로 실패하면 안 된다. trigger 기본값이 "user"라는 점이 중요하다 —
  // 알 수 없거나 누락된 값은 항상 rate limit을 적용하는 쪽(fail-safe)으로
  // 떨어진다.
  let mode: "resume" | "restart" = "resume";
  let trigger: "user" | "auto" = "user";
  try {
    const parsed = runSchema.safeParse(await request.json());
    if (parsed.success) {
      if (parsed.data.mode) mode = parsed.data.mode;
      if (parsed.data.trigger) trigger = parsed.data.trigger;
    }
  } catch {
    // 본문 없음 — resume/user 유지
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
  // 단, 브라우저가 사용자 조작 없이 스스로 거는 체크포인트 자동 재개
  // (trigger="auto")는 이 카운터에서 제외한다 — 한 번의 생성이 여러
  // invocation으로 나뉘는 게 정상 구조라, 포함시키면 사용자가 실제로는
  // 1번만 생성 요청했는데도 자동 재개 횟수만큼 카운터가 올라 금방 429가
  // 난다(isAutoResumeExemptFromRateLimit 참고).
  if (!isAutoResumeExemptFromRateLimit(mode, trigger)) {
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
  }

  const quota = await checkQuota(session.user.id, "report");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  // 동시 요청이 둘 다 통과하지 않도록 조건부 업데이트로 락을 건다.
  // stale(멈춘) GENERATING 상태도 재시도 대상에 포함한다 — cron
  // (/api/cron/resume-generations)도 같은 함수로 동일하게 선점하므로,
  // 브라우저와 cron이 같은 순간 재개를 시도해도 한쪽만 성공한다.
  const claimedOk = await claimPendingGeneration(report.id);
  if (!claimedOk) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  // 재생성이면 기존 섹션을 비운다. 락을 잡은 뒤에 지워야 동시 요청이
  // 남의 섹션을 지우는 일이 없다. autoResumeCount도 리셋 — 사용자가
  // 명시적으로 다시 시작한 것이라 이전 실패 이력을 지운다.
  if (mode === "restart") {
    const removed = await prisma.reportSection.deleteMany({
      where: { reportId: report.id },
    });
    await prisma.report.update({
      where: { id: report.id },
      data: { autoResumeCount: 0 },
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

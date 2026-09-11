import { NextRequest, NextResponse } from "next/server";
import { ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SECTION_META } from "@/types";
import { secureCompare } from "@/lib/secure-compare";
import {
  generateSectionsAsync,
  claimPendingGeneration,
  selectResumableCandidates,
  STALE_GENERATION_MS,
  MAX_AUTO_RESUME_ATTEMPTS,
} from "@/lib/report-generation";

/**
 * checkpoint(PENDING) 또는 멈춘 GENERATING 상태의 보고서를 브라우저 없이
 * 서버 스스로 이어서 생성한다.
 *
 * report-generation.ts는 시간 예산(GENERATION_BUDGET_MS) 소진 시 완성된
 * 섹션까지 저장하고 스스로 멈춘다(checkpoint) — 원래 이 checkpoint를
 * 다음 invocation으로 이어주는 건 브라우저(report-wizard.tsx /
 * report-page-client.tsx의 폴링)뿐이었다. 탭을 닫거나 새로고침하면 그
 * 트리거가 사라져 보고서가 PENDING에 영영 멈춰 있었다 — 이 cron이 브라우저
 * 없이도 항상 이어지도록 하는 안전망이다. 브라우저 폴링은 그대로 두되
 * (탭이 열려 있으면 즉시 재개돼 더 빠름), 더 이상 "반드시 있어야 하는"
 * 존재가 아니라 "있으면 더 빠른" 가속 경로가 된다.
 *
 * Vercel Cron이 매 tick마다 호출한다(vercel.json의 crons, 매 1분).
 * Authorization: Bearer ${CRON_SECRET} 헤더로 Vercel Cron이 보낸 요청인지
 * 확인한다(https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 */
export const maxDuration = 240;

/**
 * cron 자신의 실행시간 상한(240s)보다 짧게 스스로 멈춘다 — 여러 보고서를
 * 순차로 재개하다 cron 함수 자체가 강제 종료되면, 마지막으로 처리하던
 * 보고서가 자기 checkpoint 로직도 못 거치고 GENERATING에 걸릴 수 있다.
 * generateSectionsAsync 한 번이 최악 195초까지 걸릴 수 있어(report-generation.ts
 * 참고) 40초 여유를 둔다 — 사실상 tick당 보고서 1개를 처리하는 게 보통이고,
 * 그보다 훨씬 빨리 끝나는 보고서가 있을 때만 같은 tick에서 다음 걸 더 본다.
 */
const CRON_BUDGET_MS = 200_000;

/** 한 번의 조회로 이 개수만큼 후보를 본다 — 필터링(섹션 수·시도 횟수) 후 남는 수가 이보다 적을 수 있다 */
const CANDIDATE_QUERY_LIMIT = 30;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return secureCompare(auth, `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const invocationDeadline = Date.now() + CRON_BUDGET_MS;
  const totalSections = SECTION_META.length;
  const staleBefore = new Date(Date.now() - STALE_GENERATION_MS);

  // PENDING(정상 checkpoint 또는 진짜 실패 — 둘 다 이하 필터에서 한 번 더
  // 걸러짐) + 오래 갱신 없는 GENERATING(함수가 checkpoint도 못 거치고 죽은
  // 경우)을 둘 다 후보로 본다. claimPendingGeneration이 두 경우 모두
  // 원자적으로 선점 가능하도록 이미 맞춰져 있다.
  const raw = await prisma.report.findMany({
    where: {
      OR: [
        { status: ReportStatus.PENDING },
        { status: ReportStatus.GENERATING, updatedAt: { lt: staleBefore } },
      ],
    },
    select: {
      id: true,
      dealId: true,
      agentType: true,
      autoResumeCount: true,
      _count: { select: { sections: true } },
    },
    orderBy: { updatedAt: "asc" }, // 오래 기다린 것부터
    take: CANDIDATE_QUERY_LIMIT,
  });

  const resumable = selectResumableCandidates(
    raw.map((r) => ({
      id: r.id,
      completedSections: r._count.sections,
      autoResumeCount: r.autoResumeCount,
    })),
    { totalSections, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  const byId = new Map(raw.map((r) => [r.id, r]));

  const results: Array<{ reportId: string; outcome: string }> = [];

  for (const candidate of resumable) {
    if (Date.now() >= invocationDeadline) {
      results.push({ reportId: candidate.id, outcome: "skipped_budget" });
      continue; // 다음 tick(1분 후)에 이어서 본다
    }

    const claimedOk = await claimPendingGeneration(candidate.id);
    if (!claimedOk) {
      // 브라우저(또는 다른 cron tick)가 먼저 선점했다 — 중복 생성 아님.
      results.push({ reportId: candidate.id, outcome: "already_claimed" });
      continue;
    }

    const meta = byId.get(candidate.id)!;
    const deal = await prisma.deal.findUnique({
      where: { id: meta.dealId },
      select: {
        id: true,
        companyName: true,
        sector: true,
        investRound: true,
        investAmount: true,
        valuation: true,
        userId: true,
        documents: { select: { name: true, parsedText: true } },
      },
    });
    if (!deal) {
      // 정상 상황에서 발생하지 않는다(FK cascade) — 방어적으로만 처리.
      results.push({ reportId: candidate.id, outcome: "deal_not_found" });
      continue;
    }

    await prisma.report.update({
      where: { id: candidate.id },
      data: { autoResumeCount: { increment: 1 } },
    });

    console.log(
      `[Cron] report=${candidate.id} 자동 재개 시도 ${candidate.autoResumeCount + 1}/${MAX_AUTO_RESUME_ATTEMPTS} ` +
        `(완료 ${candidate.completedSections}/${totalSections})`
    );

    // 브라우저가 없는 trigger라 waitUntil로 응답을 먼저 보낼 이유가 없다
    // — cron 호출 자체가 사용자를 기다리게 하지 않으므로, 완료(또는
    // checkpoint)까지 이 요청 안에서 직접 기다린다.
    await generateSectionsAsync(
      candidate.id,
      deal,
      byId.get(candidate.id)!.agentType,
      undefined,
      deal.userId
    ).catch((err) =>
      console.error(`[Cron] report=${candidate.id} 재개 실패:`, err)
    );
    results.push({ reportId: candidate.id, outcome: "resumed" });
  }

  return NextResponse.json({
    data: { candidates: raw.length, processed: results.length, results },
  });
}

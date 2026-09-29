import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { loadMaDealIcContext } from "@/lib/pe/pe-ma-deal-context";
import { buildMaDealDashboard } from "@/lib/pe/ma-deal-dashboard";
import { buildPEICDecision } from "@/lib/pe/pe-ic-decision";
import { buildPEICMemoMarkdown } from "@/lib/pe/pe-ic-memo";
import { generateMarkdownDOCX } from "@/lib/docx-export";
import { generateMarkdownPPTX } from "@/lib/pptx-export";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";

/**
 * PE IC Memo export(PR #108) — READ-ONLY. 새 계산을 하지 않는다.
 *
 * `loadMaDealIcContext()`(page.tsx와 동일한 서버 로더) →
 * `buildMaDealDashboard()`(readiness/QoE/LBO/재무 조립, ma-deal-detail-
 * client.tsx가 클라이언트에서 쓰는 것과 정확히 같은 함수) →
 * `buildPEICDecision()`(pe-ic-decision.ts) → `buildPEICMemoMarkdown()`
 * (pe-ic-memo.ts) 순서로 IC 화면과 완전히 동일한 결정 패키지를 만든 뒤,
 * `generateMarkdownDOCX()`/`generateMarkdownPPTX()`(docx-export.ts/
 * pptx-export.ts, LP 리포트 등에서 이미 쓰는 범용 마크다운 변환기 — VC
 * 전용 exporter를 복제하지 않음)로 파일만 만든다.
 *
 * VC의 `report-export-common.ts`/`vc-decision-memo.ts`는 전혀 참조하지
 * 않는다(§1 "PE는 별도 도메인").
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const result = await loadMaDealIcContext(session.user.id, teamId, params.id);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });
  }

  const { maDeal, dashboardPeriods, ddCase } = result.data;
  const dashboard = buildMaDealDashboard(dashboardPeriods, ddCase);
  const decision = buildPEICDecision({
    dealId: maDeal.id,
    readiness: dashboard.decisionReadiness,
    financialQuality: dashboard.financialQuality,
    qoeSummary: dashboard.qoeSummary,
    lboEntryEbitda: dashboard.lboEntryEbitda,
    dartStatus: dashboard.dartStatus,
    ddCase,
    // LBO 가정은 세션 로컬 client state일 뿐 서버에 없다 — 지어내지 않는다.
    lboAssumptionKeysProvided: undefined,
  });

  const markdown = buildPEICMemoMarkdown(decision, {
    companyName: maDeal.companyName,
    name: maDeal.name,
    dealTypeLabel: MA_DEAL_TYPE_LABEL[maDeal.dealType],
    statusLabel: MA_DEAL_STATUS_LABEL[maDeal.status],
  });

  const format = request.nextUrl.searchParams.get("format") === "pptx" ? "pptx" : "docx";
  const title = `${maDeal.companyName} IC Memo`;

  const buffer =
    format === "pptx"
      ? await generateMarkdownPPTX({ title, subtitle: maDeal.name, markdown })
      : await generateMarkdownDOCX({ title, subtitle: maDeal.name, markdown });

  const filename = `${maDeal.companyName}_IC_Memo_${new Date().toISOString().slice(0, 10)}.${format}`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        format === "pptx"
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

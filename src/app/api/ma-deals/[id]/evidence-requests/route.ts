import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import { loadMaDealIcContext } from "@/lib/pe/pe-ma-deal-context";
import { buildMaDealDashboard } from "@/lib/pe/ma-deal-dashboard";
import { buildICQuestions } from "@/lib/pe/pe-ic-questions";
import { buildPEThesisItems } from "@/lib/pe/pe-ic-thesis";
import { createPEEvidenceRequest, listPEEvidenceRequests, type PEDDActor } from "@/lib/pe/pe-evidence-request-repository";
import { toPEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import { PE_IC_QUESTION_PRIORITIES } from "@/lib/pe/pe-ic-decision-types";
import { z } from "zod";

async function withLinkedDocumentNames(rows: { linkedDocumentId: string | null }[]) {
  const ids = Array.from(new Set(rows.map((r) => r.linkedDocumentId).filter((id): id is string => id !== null)));
  if (ids.length === 0) return new Map<string, string>();
  const docs = await prisma.mADocument.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(docs.map((d) => [d.id, d.name]));
}

const createSchema = z.object({
  reviewItemSourceId: z.string().min(1),
  title: z.string().min(1),
  requestedDocument: z.string().optional(),
  requestedFact: z.string().optional(),
  reason: z.string().min(1),
});

/**
 * PE Evidence Request(PR #109). GET은 이 딜의 요청 목록만 반환한다(다른
 * 딜 데이터 없음 — ddCaseId로 스코프된 repository 조회). POST는 review
 * item(=ICQuestion.code)이 **지금 이 딜의 서버측 재계산**에 실제로 존재할
 * 때만 요청 생성을 허용한다 — 클라이언트가 보낸 reviewItemSourceId를
 * 그대로 신뢰하지 않는다(§Step16 "IC question from Deal A cannot create a
 * request for Deal B" 방어의 핵심).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };
  const result = await loadMaDealIcContext(session.user.id, teamId, params.id);
  if (result.status === "not_found") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });
  if (!result.data.ddCase) return NextResponse.json({ data: [] });

  const ddCaseRow = await prisma.pEDDCase.findUnique({ where: { maDealId: params.id }, select: { id: true } });
  if (!ddCaseRow) return NextResponse.json({ data: [] });

  const rows = await listPEEvidenceRequests(actor, ddCaseRow.id);
  if (rows.status !== "ok") return NextResponse.json({ data: [] });
  const nameById = await withLinkedDocumentNames(rows.data);
  const data = rows.data.map((r) => toPEEvidenceRequestView(r, r.linkedDocumentId ? nameById.get(r.linkedDocumentId) : null));
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };
  const result = await loadMaDealIcContext(session.user.id, teamId, params.id);
  if (result.status === "not_found") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다", issues: parsed.error.issues }, { status: 400 });
  }

  const ddCaseRow = await prisma.pEDDCase.findUnique({ where: { maDealId: params.id }, select: { id: true } });
  if (!ddCaseRow) {
    return NextResponse.json({ error: "이 딜에는 아직 DD case가 없어 근거 요청을 만들 수 없습니다" }, { status: 400 });
  }

  // 서버에서 직접 재계산한 현재 open questions에 이 reviewItemSourceId가
  // 실제로 있는지 확인한다 — 클라이언트가 보낸 값을 그대로 신뢰하지 않는다.
  const dashboard = buildMaDealDashboard(result.data.dashboardPeriods, result.data.ddCase);
  const thesisItems = buildPEThesisItems(result.data.ddCase, dashboard.decisionReadiness);
  const currentQuestions = buildICQuestions(dashboard.decisionReadiness, result.data.ddCase, thesisItems);
  const matched = currentQuestions.find((q) => q.code === parsed.data.reviewItemSourceId);
  if (!matched) {
    return NextResponse.json(
      { error: "이 review item은 현재 이 딜에서 확인되지 않습니다(이미 해소됐거나 다른 딜의 항목일 수 있습니다)" },
      { status: 400 }
    );
  }
  if (!PE_IC_QUESTION_PRIORITIES.includes(matched.priority)) {
    return NextResponse.json({ error: "우선순위 값이 유효하지 않습니다" }, { status: 400 });
  }

  const created = await createPEEvidenceRequest(actor, ddCaseRow.id, {
    reviewItemSourceType: matched.sourceType,
    reviewItemSourceId: matched.code,
    title: parsed.data.title,
    requestedDocument: parsed.data.requestedDocument,
    requestedFact: parsed.data.requestedFact,
    reason: parsed.data.reason,
    priority: matched.priority,
  });

  if (created.status === "not_found") return NextResponse.json({ error: "쓰기 권한이 없습니다" }, { status: 404 });
  if (created.status === "invalid") return NextResponse.json({ error: "입력값이 올바르지 않습니다", issues: created.issues }, { status: 400 });
  return NextResponse.json({ data: toPEEvidenceRequestView(created.data) }, { status: 201 });
}

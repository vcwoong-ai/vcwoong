import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { getPEDDCaseForDeal, listPEEvidence, listPEDDFindings, type PEDDActor } from "@/lib/pe/pe-dd-repository";

// PE Data Room(PR #106) — 딜의 MADocument 목록 + PR #105가 이미 영속화한
// PEEvidence/PEDDFinding을 한 번에 내려준다(READ-ONLY, 새 evidence/finding을
// 만들지 않음). getPEDDCaseForDeal()/listPEEvidence()/listPEDDFindings()는
// pe-dd-repository.ts(PR #105, 수정 없음)를 그대로 재사용한다 — 그 함수들이
// 이미 maDealReadWhere()/maDealWriteWhere()로 딜 소유권을 검증하므로 이중으로
// 안전하다(문서 자체도 아래에서 별도로 maDealReadWhere 검증을 거친다).
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealReadWhere(session.user.id, teamId) },
  });
  if (!maDeal) {
    return NextResponse.json(
      { error: "PE 딜을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // parsedText(문서 하나당 최대 50만자, document-parser.ts 주석 참고)는
  // 이 화면(Data Room 목록/문서 상세 다이얼로그) 어디에서도 쓰지 않는다
  // (pe-data-room-view-model.ts의 DataRoomDocumentRow에 애초에 그 필드가
  // 없음) — select로 명시해 필요 없는 대용량 컬럼을 매번 통째로 내려받지
  // 않는다(PR #112, §29 "entire document content loading" 방지. VC 쪽
  // deals/[id]/page.tsx가 이미 같은 이유로 parsedText를 피하는 것과 동일한
  // 관례).
  const documents = await prisma.mADocument.findMany({
    where: { maDealId: params.id },
    select: { id: true, name: true, type: true, size: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const ddCaseResult = await getPEDDCaseForDeal(actor, params.id);
  const ddCase = ddCaseResult.status === "ok" ? ddCaseResult.data : null;

  const evidenceResult = ddCase ? await listPEEvidence(actor, ddCase.id) : null;
  const findingsResult = ddCase ? await listPEDDFindings(actor, ddCase.id) : null;

  return NextResponse.json({
    data: {
      documents,
      evidence: evidenceResult?.status === "ok" ? evidenceResult.data : [],
      findings: findingsResult?.status === "ok" ? findingsResult.data : [],
    },
  });
}

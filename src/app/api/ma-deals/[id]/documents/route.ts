import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere, maDealWriteWhere } from "@/lib/pe/ma-team-access";
import { uploadFile } from "@/lib/storage";
import { parseDocument } from "@/lib/document-parser";
import { createPrismaPEUploadRepository, PEUploadError, PEUploadService, readPEUploadForm, peDocumentParseSummary } from "@/lib/pe/pe-document-upload";
import { randomUUID } from "node:crypto";
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

  if (request.nextUrl.searchParams.has("uploadId")) {
    try {
      const data = await uploadService().lookup({ userId: session.user.id, dealId: params.id,
        uploadId: request.nextUrl.searchParams.get("uploadId") ?? "" });
      return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof PEUploadError ? error.message : "업로드 상태를 조회하지 못했습니다." },
        { status: error instanceof PEUploadError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  // parsedText(문서 하나당 최대 50만자, document-parser.ts 주석 참고)는
  // 이 화면(Data Room 목록/문서 상세 다이얼로그) 어디에서도 쓰지 않는다
  // (pe-data-room-view-model.ts의 DataRoomDocumentRow에 애초에 그 필드가
  // 없음) — select로 명시해 필요 없는 대용량 컬럼을 매번 통째로 내려받지
  // 않는다(PR #112, §29 "entire document content loading" 방지. VC 쪽
  // deals/[id]/page.tsx가 이미 같은 이유로 parsedText를 피하는 것과 동일한
  // 관례).
  const documents = await prisma.mADocument.findMany({
    where: { maDealId: params.id, url: { not: "" } },
    select: { id: true, maDealId: true, name: true, type: true, size: true, mimeType: true, createdAt: true, url: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });

  const ddCaseResult = await getPEDDCaseForDeal(actor, params.id);
  const ddCase = ddCaseResult.status === "ok" ? ddCaseResult.data : null;

  const evidenceResult = ddCase ? await listPEEvidence(actor, ddCase.id) : null;
  const findingsResult = ddCase ? await listPEDDFindings(actor, ddCase.id) : null;

  return NextResponse.json({
    data: {
      documents: documents.map(({ url, metadata, maDealId, ...document }) => ({
        ...document,
        ...peDocumentParseSummary({ ...document, maDealId, url, metadata }, new Date()),
      })),
      evidence: evidenceResult?.status === "ok" ? evidenceResult.data : [],
      findings: findingsResult?.status === "ok" ? findingsResult.data : [],
    },
  }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" } });
}

export const maxDuration = 60;
function uploadService() {
  return new PEUploadService({ repository: createPrismaPEUploadRepository(prisma), upload: uploadFile,
    parse: parseDocument, now: () => new Date(), newToken: randomUUID });
}
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers });
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "업로드 요청 출처를 확인해 주세요." }, { status: 403, headers });
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(params.id)) return NextResponse.json({ error: "업로드 대상을 확인해 주세요." }, { status: 400, headers });
    const { teamId, role } = await getUserTeamContext(session.user.id);
    const deal = await prisma.mADeal.findFirst({ where: { id: params.id, ...maDealWriteWhere(session.user.id, teamId, role) }, select: { id: true } });
    if (!deal) return NextResponse.json({ error: "자료를 업로드할 PE 딜을 찾을 수 없거나 편집 권한이 없습니다." }, { status: 404, headers });
    // Authorize before buffering multipart bytes or reserving a storage write.
    const input = await readPEUploadForm(request);
    const result = await uploadService().submit({ ...input, userId: session.user.id, dealId: params.id });
    return NextResponse.json({ data: result.data }, { status: result.status, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PEUploadError ? error.message : "자료 업로드 상태를 확인하지 못했습니다. 작업 상태를 조회해 주세요." },
      { status: error instanceof PEUploadError ? error.status : 503, headers });
  }
}

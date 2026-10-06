import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/private-response-headers";
import { getUserTeamContext } from "@/lib/team-access";
import { loadPECommitteePackForDeal } from "@/lib/pe/pe-committee-pack-loader";
import { buildPECommitteePackMarkdown } from "@/lib/pe/pe-committee-pack-memo";
import { generateMarkdownDOCX } from "@/lib/docx-export";
import { generateMarkdownPPTX } from "@/lib/pptx-export";
import type { PEDDActor } from "@/lib/pe/pe-evidence-request-repository";

export const dynamic = "force-dynamic";

/**
 * PE Committee Pack export(PR #110) — READ-ONLY. 화면("위원회 자료" 탭)과
 * 정확히 같은 `buildPECommitteePack()`(pe-committee-pack-loader.ts를 통해
 * 서버에서 동일 시퀀스로 호출) 결과를 마크다운으로 바꿔 파일만 만든다.
 * IC Memo export route와 같은 패턴(§Step17)이지만 별도 파일 —
 * 두 export가 서로 다른 문서 목적(상세 분석 vs 위원회 요약)을 갖기 때문에
 * 파일을 합치지 않는다(pe-committee-pack-memo.ts 주석 참고).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const { teamId, role } = await getUserTeamContext(session.user.id);
    const actor: PEDDActor = { userId: session.user.id, teamId, role };

    const result = await loadPECommitteePackForDeal(actor, params.id);
    if (result.status === "not_found") {
      return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const { maDeal, pack } = result.data;
    const markdown = buildPECommitteePackMarkdown(pack);

    const format = request.nextUrl.searchParams.get("format") === "pptx" ? "pptx" : "docx";
    const title = `${maDeal.companyName} IC Committee Pack`;

    const buffer =
      format === "pptx"
        ? await generateMarkdownPPTX({ title, subtitle: maDeal.name, markdown })
        : await generateMarkdownDOCX({ title, subtitle: maDeal.name, markdown });

    const filename = `${maDeal.companyName}_Committee_Pack_${new Date().toISOString().slice(0, 10)}.${format}`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "Content-Type":
          format === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "내보내기 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500, headers: PRIVATE_RESPONSE_HEADERS });
  }
}

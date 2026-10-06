import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/private-response-headers";
import { prisma } from "@/lib/prisma";
import { generateMarkdownDOCX } from "@/lib/docx-export";
import { generateMarkdownPPTX } from "@/lib/pptx-export";
import { getUserTeamContext, lpReportReadWhere } from "@/lib/team-access";

/** LP 리포트를 DOCX 또는 PPTX로 내려받는다 (?format=pptx) */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const format = new URL(request.url).searchParams.get("format") ?? "docx";
    const { teamId } = await getUserTeamContext(session.user.id);
    const report = await prisma.lpReport.findFirst({
      where: { id: params.id, ...lpReportReadWhere(session.user.id, teamId) },
      include: { fund: { select: { name: true } } },
    });

    if (!report) {
      return NextResponse.json({ error: "리포트를 찾을 수 없습니다" }, { status: 404, headers: PRIVATE_RESPONSE_HEADERS });
    }

    if (format === "pptx") {
      const buffer = await generateMarkdownPPTX({
        title: report.title,
        subtitle: `${report.fund.name} · ${report.period}`,
        markdown: report.content,
      });
      const filename = `${report.fund.name}_${report.period}_LP리포트.pptx`;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-Export-Mode": "pptx-generated",
        },
      });
    }

    const buffer = await generateMarkdownDOCX({
      title: report.title,
      subtitle: `${report.fund.name} · ${report.period}`,
      markdown: report.content,
    });

    const filename = `${report.fund.name}_${report.period}_LP리포트.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    console.error("[Export] LP export failed");
    return NextResponse.json({ error: "리포트 내보내기 중 오류가 발생했습니다" }, { status: 500, headers: PRIVATE_RESPONSE_HEADERS });
  }
}

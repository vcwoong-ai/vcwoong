import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMarkdownDOCX } from "@/lib/docx-export";
import { getUserTeamContext, lpReportReadWhere } from "@/lib/team-access";

/** LP 리포트를 DOCX로 내려받는다 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const report = await prisma.lpReport.findFirst({
    where: { id: params.id, ...lpReportReadWhere(session.user.id, teamId) },
    include: { fund: { select: { name: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "리포트를 찾을 수 없습니다" }, { status: 404 });
  }

  const buffer = await generateMarkdownDOCX({
    title: report.title,
    subtitle: `${report.fund.name} · ${report.period}`,
    markdown: report.content,
  });

  const filename = `${report.fund.name}_${report.period}_LP리포트.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

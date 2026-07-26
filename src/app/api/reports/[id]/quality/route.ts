import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateReport } from "@/lib/report-quality";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await prisma.report.findFirst({
    where: { id: params.id, deal: { userId: session.user.id } },
    include: {
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary = evaluateReport(
    report.sections.map((s) => ({
      sectionKey: s.sectionKey,
      content: s.content,
    }))
  );

  return NextResponse.json({ data: summary });
}

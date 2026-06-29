import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ReportStatus } from "@prisma/client";

const STATUS_DISPLAY: Record<
  ReportStatus,
  { label: string; className: string }
> = {
  PENDING:    { label: "대기",          className: "bg-gray-100 text-gray-600" },
  GENERATING: { label: "생성 중",       className: "bg-amber-100 text-amber-700" },
  DRAFT:      { label: "초안",          className: "bg-blue-100 text-blue-700" },
  REVIEW:     { label: "검토 중",       className: "bg-purple-100 text-purple-700" },
  FINAL:      { label: "최종",          className: "bg-green-100 text-green-700" },
  EXPORTED:   { label: "내보내기 완료", className: "bg-green-100 text-green-700" },
};

const AGENT_LABEL: Record<string, string> = {
  GENERAL:       "General",
  BIO:           "Dr. Cell",
  IT:            "Code",
  DEEPTECH:      "Neuron",
  MANUFACTURING: "Maker",
  CONTENT:       "Story",
  FINTECH:       "Vault",
};

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session.user.id } },
    include: {
      deal: { select: { id: true, companyName: true, sector: true } },
      sections: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalFinal = reports.filter(
    (r) => r.status === ReportStatus.FINAL || r.status === ReportStatus.EXPORTED
  ).length;

  return (
    <AppLayout title="보고서">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">보고서</h1>
            <p className="text-gray-500 mt-1">
              AI가 생성한 투자심의보고서 목록입니다.
            </p>
          </div>
          <div className="flex gap-3 text-sm text-gray-500">
            <span>
              전체 <strong className="text-gray-900">{reports.length}</strong>건
            </span>
            <span>·</span>
            <span>
              최종 <strong className="text-green-700">{totalFinal}</strong>건
            </span>
          </div>
        </div>

        {/* Report list */}
        {reports.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">생성된 보고서가 없습니다</p>
            <p className="text-sm mt-1">
              딜 상세 페이지에서 AI 보고서를 생성해보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const status = STATUS_DISPLAY[report.status] ?? {
                label: report.status,
                className: "bg-gray-100 text-gray-600",
              };
              const approvedCount = report.sections.filter(
                (s) => s.status === "APPROVED"
              ).length;

              return (
                <Card key={report.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 truncate">
                              {report.deal.companyName}
                            </p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${status.className}`}
                            >
                              {status.label}
                            </span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {AGENT_LABEL[report.agentType] ?? report.agentType}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            {new Date(report.createdAt).toLocaleDateString("ko-KR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                            <span>·</span>
                            <span>
                              {approvedCount}/{report.sections.length}섹션 승인
                            </span>
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/reports/${report.id}`}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium flex-shrink-0"
                      >
                        열기
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

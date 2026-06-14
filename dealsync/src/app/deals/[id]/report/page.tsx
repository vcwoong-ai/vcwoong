import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Printer, RefreshCw } from "lucide-react";
import { ReportContent } from "@/components/reports/report-content";
import { GenerateReportButton } from "@/components/deals/generate-report-button";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session) redirect("/auth/signin");

  const deal = await prisma.deal.findFirst({
    where: { id, userId: session.user.id },
    include: { report: true },
  });

  if (!deal) notFound();
  if (!deal.report) redirect(`/deals/${id}`);

  const ratingColors: Record<string, string> = {
    S: "bg-purple-100 text-purple-700 border-purple-200",
    A: "bg-blue-100 text-blue-700 border-blue-200",
    B: "bg-green-100 text-green-700 border-green-200",
    C: "bg-yellow-100 text-yellow-700 border-yellow-200",
    D: "bg-red-100 text-red-700 border-red-200",
  };

  const recommendationColors: Record<string, string> = {
    "적극 추천": "bg-green-100 text-green-700",
    추천: "bg-blue-100 text-blue-700",
    "검토 필요": "bg-yellow-100 text-yellow-700",
    보류: "bg-orange-100 text-orange-700",
    부적합: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div className="flex items-center gap-3">
          <Link href={`/deals/${id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">투자심사보고서</h1>
            <p className="text-gray-500 text-sm">
              {deal.companyName} · {formatDate(deal.report.generatedAt)} 생성
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <GenerateReportButton dealId={deal.id} />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            인쇄/PDF
          </Button>
        </div>
      </div>

      {/* Report Summary Bar */}
      <div className="mb-6 p-4 bg-white border border-gray-100 rounded-xl flex flex-wrap items-center gap-4 no-print">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">등급</span>
          {deal.report.rating && (
            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full border ${ratingColors[deal.report.rating] ?? "bg-gray-100 text-gray-700"}`}>
              {deal.report.rating}
            </span>
          )}
        </div>
        {deal.report.recommendation && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">투자의견</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${recommendationColors[deal.report.recommendation] ?? "bg-gray-100 text-gray-700"}`}>
              {deal.report.recommendation}
            </span>
          </div>
        )}
        <div className="flex-1" />
        <div className="text-xs text-gray-400">
          <FileText className="w-3.5 h-3.5 inline mr-1" />
          AI 생성 초안 — 최종 결정은 심사위원회 검토 필요
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <ReportContent content={deal.report.content} />
      </div>
    </div>
  );
}

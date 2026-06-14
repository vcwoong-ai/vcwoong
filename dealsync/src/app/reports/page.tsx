import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, TrendingUp, Plus } from "lucide-react";

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session!.user.id } },
    include: { deal: true },
    orderBy: { generatedAt: "desc" },
  });

  const ratingColors: Record<string, string> = {
    S: "bg-purple-100 text-purple-700",
    A: "bg-blue-100 text-blue-700",
    B: "bg-green-100 text-green-700",
    C: "bg-yellow-100 text-yellow-700",
    D: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">투자심사보고서</h1>
          <p className="text-gray-500 mt-1 text-sm">총 {reports.length}건의 보고서</p>
        </div>
        <Link href="/deals/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            새 딜 추가
          </Button>
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">보고서가 없습니다</h3>
          <p className="text-gray-500 text-sm mb-6">
            딜을 등록하고 AI로 투자심사보고서를 생성하세요.
          </p>
          <Link href="/deals/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              딜 추가하기
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">기업명</div>
            <div className="col-span-2">섹터</div>
            <div className="col-span-2">등급</div>
            <div className="col-span-2">투자의견</div>
            <div className="col-span-2">생성일</div>
          </div>
          <div className="divide-y divide-gray-50">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/deals/${report.dealId}/report`}
                className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group items-center"
              >
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm group-hover:text-blue-700 transition-colors truncate">
                      {report.deal.companyName}
                    </div>
                    <div className="text-xs text-gray-400">{report.deal.stage}</div>
                  </div>
                </div>
                <div className="col-span-2 text-sm text-gray-700">{report.deal.sector}</div>
                <div className="col-span-2">
                  {report.rating && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ratingColors[report.rating] ?? "bg-gray-100 text-gray-600"}`}>
                      {report.rating}등급
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-gray-700">{report.recommendation ?? "-"}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{formatDate(report.generatedAt)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

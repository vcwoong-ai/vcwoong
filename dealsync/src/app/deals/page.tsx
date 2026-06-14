import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, DEAL_STATUSES, SECTORS, STAGES } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Plus,
  TrendingUp,
  FileText,
  ChevronRight,
  Search,
} from "lucide-react";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sector?: string; q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  const where: Record<string, unknown> = { userId: session!.user.id };
  if (params.status) where.status = params.status;
  if (params.sector) where.sector = params.sector;
  if (params.q) {
    where.companyName = { contains: params.q };
  }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { report: { select: { id: true } } },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">딜 파이프라인</h1>
          <p className="text-gray-500 mt-1 text-sm">총 {deals.length}건의 딜</p>
        </div>
        <Link href="/deals/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            새 딜 추가
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {[
            { label: "전체", value: "" },
            ...Object.entries(DEAL_STATUSES).map(([k, v]) => ({
              label: v.label,
              value: k,
            })),
          ].map((filter) => (
            <Link
              key={filter.value}
              href={`/deals${filter.value ? `?status=${filter.value}` : ""}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                params.status === filter.value ||
                (!params.status && !filter.value)
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Deal List */}
      {deals.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {params.status ? "해당 상태의 딜이 없습니다" : "첫 딜을 추가해보세요"}
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            새로운 투자 검토 건을 등록하고 AI로 보고서를 생성하세요.
          </p>
          <Link href="/deals/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              새 딜 추가
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">기업명</div>
            <div className="col-span-2">섹터 / 단계</div>
            <div className="col-span-2">투자금액</div>
            <div className="col-span-2">상태</div>
            <div className="col-span-1">보고서</div>
            <div className="col-span-1">날짜</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-gray-50">
            {deals.map((deal) => {
              const statusInfo = DEAL_STATUSES[deal.status as keyof typeof DEAL_STATUSES] ?? DEAL_STATUSES.draft;
              return (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors group items-center"
                >
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-blue-700 transition-colors truncate">
                        {deal.companyName}
                      </div>
                      {deal.companyNameKo && (
                        <div className="text-xs text-gray-400 truncate">{deal.companyNameKo}</div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-gray-700">{deal.sector}</div>
                    <div className="text-xs text-gray-400">{deal.stage}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-gray-900">
                      {deal.investmentAmount
                        ? formatCurrency(deal.investmentAmount, deal.investmentCurrency)
                        : "-"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="col-span-1">
                    {deal.report ? (
                      <FileText className="w-4 h-4 text-purple-500" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                  <div className="col-span-1 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {formatDate(deal.updatedAt)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

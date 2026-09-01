import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ArrowRight } from "lucide-react";
import Link from "next/link";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { SECTOR_LABEL } from "@/lib/deal-labels";

export default async function NewReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      documents: { select: { id: true } },
      reports: { select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <AppLayout title="보고서 생성">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 보고서 생성</h1>
          <p className="text-gray-500 mt-1">
            딜을 선택하면 AI 보고서 생성 마법사가 시작됩니다.
          </p>
        </div>

        {deals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/empty-reports-new.svg"
                alt=""
                className="w-56 mx-auto opacity-90"
              />
              <p className="text-gray-600">등록된 딜이 없습니다.</p>
              <CreateDealDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => {
              const hasDocs = deal.documents.length > 0;
              const latestReport = deal.reports[0];

              return (
                <Card key={deal.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{deal.companyName}</p>
                          <Badge variant="outline" className="text-xs">
                            {SECTOR_LABEL[deal.sector] ?? deal.sector}
                          </Badge>
                          {!hasDocs && (
                            <Badge variant="secondary" className="text-xs text-amber-700 bg-amber-50">
                              IR 자료 필요
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{deal.name}</p>
                        {latestReport && (
                          <p className="text-xs text-gray-400 mt-1">
                            최근 보고서: {latestReport.status}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {!hasDocs && (
                          <Link href={`/deals/${deal.id}`}>
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-50">
                              <Upload className="w-3.5 h-3.5" />
                              자료 업로드
                            </span>
                          </Link>
                        )}
                        <Link href={`/deals/${deal.id}?wizard=1`}>
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-white bg-blue-600 rounded-lg px-4 py-2 hover:bg-blue-700">
                            {hasDocs ? "보고서 생성" : "딜 열기"}
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </Link>
                      </div>
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

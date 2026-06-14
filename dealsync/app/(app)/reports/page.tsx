import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session.user.id } },
    include: {
      deal: {
        select: { companyName: true, sector: true, stage: true, status: true },
      },
    },
    orderBy: { generatedAt: "desc" },
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="보고서"
        subtitle="생성된 투자심의보고서를 관리합니다"
      />
      <div className="flex-1 overflow-auto p-6">
        {reports.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-muted-foreground">생성된 보고서가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {reports.map((report) => (
              <Link key={report.id} href={`/deals/${report.dealId}/report`}>
                <Card className="border border-border hover:border-[#1B4FD8]/40 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-[#1B4FD8]" />
                      </div>
                      <Badge
                        variant={report.status === "FINAL" ? "default" : "secondary"}
                        className={`text-xs ${report.status === "FINAL" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}`}
                      >
                        {report.status === "FINAL" ? "최종" : "초안"}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-[#1B4FD8] transition-colors">
                      {report.deal.companyName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 mb-3">
                      {report.deal.sector && (
                        <span className="text-xs text-muted-foreground">
                          {report.deal.sector}
                        </span>
                      )}
                      {report.deal.stage && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {report.deal.stage}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(report.generatedAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:text-[#1B4FD8] transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

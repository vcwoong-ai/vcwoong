import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Plus, ArrowRight } from "lucide-react";

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기", className: "bg-gray-100 text-gray-600" },
  GENERATING: { label: "생성 중", className: "bg-amber-100 text-amber-700" },
  DRAFT: { label: "초안", className: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "검토 중", className: "bg-purple-100 text-purple-700" },
  FINAL: { label: "최종", className: "bg-green-100 text-green-700" },
  EXPORTED: { label: "내보내기", className: "bg-green-100 text-green-700" },
};

const SECTOR_LABEL: Record<string, string> = {
  BIO: "바이오", IT: "IT/SaaS", DEEPTECH: "AI/딥테크",
  GENERAL: "제조", CONSUMER: "콘텐츠", FINTECH: "핀테크", CLIMATE: "기후",
};

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session.user.id } },
    include: {
      deal: { select: { companyName: true, sector: true } },
      sections: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppLayout title="보고서">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">보고서</h1>
            <p className="text-sm text-gray-500 mt-1">AI가 생성한 투자심사보고서 목록</p>
          </div>
          <Link href="/deals">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              새 보고서
            </Button>
          </Link>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">아직 생성된 보고서가 없습니다.</p>
            <Link href="/deals">
              <Button variant="outline">딜에서 보고서 생성하기</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(reports as any[]).map((report) => {
              const status = STATUS_DISPLAY[report.status] ?? { label: report.status, className: "bg-gray-100 text-gray-600" };
              return (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{report.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {report.deal.companyName} · {SECTOR_LABEL[report.deal.sector] ?? report.deal.sector}
                        {report.sections?.length > 0 && ` · ${report.sections.length}개 섹션`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

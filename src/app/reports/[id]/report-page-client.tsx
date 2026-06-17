"use client";

import { useState } from "react";
import Link from "next/link";
import { ReportEditor } from "@/components/reports/report-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";

interface ReportSection {
  id: string;
  sectionKey: string;
  title: string;
  content: string;
  order: number;
  status: "DRAFT" | "REVIEWED" | "APPROVED";
  feedback: string | null;
}

interface Report {
  id: string;
  title: string;
  status: string;
  agentType: string;
  generatedAt: string | null;
  deal: {
    id: string;
    companyName: string;
    sector: string;
  };
  sections: ReportSection[];
}

const STATUS_DISPLAY: Record<
  string,
  { label: string; className: string }
> = {
  PENDING: { label: "대기", className: "bg-gray-100 text-gray-600" },
  GENERATING: { label: "AI 생성 중...", className: "bg-amber-100 text-amber-700" },
  DRAFT: { label: "초안", className: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "검토 중", className: "bg-purple-100 text-purple-700" },
  FINAL: { label: "최종", className: "bg-green-100 text-green-700" },
  EXPORTED: { label: "내보내기 완료", className: "bg-green-100 text-green-700" },
};

export function ReportPageClient({ report }: { report: Report }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusDisplay = STATUS_DISPLAY[report.status] ?? {
    label: report.status,
    className: "bg-gray-100 text-gray-600",
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/reports/${report.id}/export`, {
        method: "POST",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "내보내기 실패");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? decodeURIComponent(
            contentDisposition.split("filename*=UTF-8''")[1] ??
              "투자심의보고서.docx"
          )
        : `${report.deal.companyName}_투자심의보고서.docx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "내보내기 실패");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  if (report.status === "GENERATING") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/deals/${report.deal.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              딜로 돌아가기
            </Button>
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-24 space-y-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">
              AI가 보고서를 작성하고 있습니다
            </h2>
            <p className="text-gray-500 mt-2">
              {report.deal.companyName}의 투자심의보고서를 생성하는 중입니다.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              10개 섹션을 순차적으로 작성합니다. 잠시 기다려주세요.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            새로고침
          </Button>
        </div>
      </div>
    );
  }

  if (report.status === "PENDING") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/deals/${report.deal.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              딜로 돌아가기
            </Button>
          </Link>
        </div>
        <div className="text-center py-16 text-gray-500">
          <p>보고서 생성 대기 중입니다.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            새로고침
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/deals/${report.deal.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              딜로 돌아가기
            </Button>
          </Link>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusDisplay.className}`}
          >
            {statusDisplay.label}
          </span>
          <Badge variant="outline" className="text-xs">
            {report.agentType} Agent
          </Badge>
        </div>
        {report.generatedAt && (
          <p className="text-xs text-gray-400">
            생성일:{" "}
            {new Date(report.generatedAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <ReportEditor
        reportId={report.id}
        sections={report.sections}
        dealName={`${report.deal.companyName} 투자심의보고서`}
        onExport={handleExport}
        isExporting={isExporting}
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ReportEditor } from "@/components/reports/report-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";

function RunReportButton({ reportId }: { reportId: string }) {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/run`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "분석 시작 실패");
      }
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "분석 시작 중 오류가 발생했습니다");
      setIsRunning(false);
    }
  };

  return (
    <Button onClick={handleRun} disabled={isRunning} size="lg" className="gap-2">
      {isRunning ? (
        <><Loader2 className="w-5 h-5 animate-spin" /> AI 분석 중...</>
      ) : (
        <><Sparkles className="w-5 h-5" /> AI 보고서 생성 시작</>
      )}
    </Button>
  );
}

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
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Auto-refresh while generating
  useEffect(() => {
    if (report.status !== "GENERATING") return;
    const interval = setInterval(() => window.location.reload(), 5000);
    return () => clearInterval(interval);
  }, [report.status]);

  const handleFinalize = async () => {
    setIsFinalizing(true);
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINAL", approveAllSections: true }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "완성 처리 실패");
      }
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "완성 처리 중 오류가 발생했습니다");
      setIsFinalizing(false);
    }
  };

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
              10개 섹션을 순차적으로 작성합니다. 5초마다 자동으로 확인합니다.
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
            지금 확인
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
        <div className="flex flex-col items-center justify-center py-24 space-y-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
            🤖
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">AI 분석 준비 완료</h2>
            <p className="text-gray-500 mt-2">
              {report.deal.companyName}의 투자심사보고서를 AI로 자동 생성합니다.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              업로드된 문서를 분석하여 10개 섹션의 보고서를 작성합니다. (약 1~3분 소요)
            </p>
          </div>
          <RunReportButton reportId={report.id} />
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
        reportStatus={report.status}
        onFinalize={handleFinalize}
        isFinalizing={isFinalizing}
      />
    </div>
  );
}

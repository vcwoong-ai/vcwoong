"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ReportEditor } from "@/components/reports/report-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

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

interface GenerationProgress {
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
  error?: string;
}

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기", className: "bg-gray-100 text-gray-600" },
  GENERATING: { label: "AI 생성 중...", className: "bg-amber-100 text-amber-700" },
  DRAFT: { label: "초안", className: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "검토 중", className: "bg-purple-100 text-purple-700" },
  FINAL: { label: "최종", className: "bg-green-100 text-green-700" },
  EXPORTED: { label: "보내기 완료", className: "bg-green-100 text-green-700" },
};

function GeneratingView({
  report,
  onComplete,
}: {
  report: Report;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/reports/${report.id}/progress`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data: GenerationProgress = JSON.parse(event.data);
      setProgress(data);
      if (data.status === "completed") {
        es.close();
        setTimeout(onComplete, 500);
      }
      if (data.status === "error") {
        es.close();
      }
    };

    es.onerror = () => es.close();

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [report.id, onComplete]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

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
      <div className="flex flex-col items-center justify-center py-16 space-y-6 max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
        <div className="text-center w-full">
          <h2 className="text-xl font-bold text-gray-900">
            AI가 보고서를 작성하고 있습니다
          </h2>
          <p className="text-gray-500 mt-2">{report.deal.companyName}</p>
        </div>
        {progress && progress.total > 0 && (
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{progress.currentSection}</span>
              <span className="text-gray-400">
                {progress.completed}/{progress.total}
              </span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        )}
        {progress?.status === "error" && (
          <p className="text-sm text-red-600">{progress.error ?? "생성 중 오류가 발생했습니다"}</p>
        )}
      </div>
    </div>
  );
}

export function ReportPageClient({ report }: { report: Report }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState(report.status);

  const handleReload = useCallback(() => window.location.reload(), []);

  const handleStartGeneration = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const response = await fetch(`/api/reports/${report.id}/run`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "생성 시작 실패");
      }
      setPageStatus("GENERATING");
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "오류가 발생했습니다");
    } finally {
      setIsStarting(false);
    }
  };

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

  const statusDisplay = STATUS_DISPLAY[pageStatus] ?? {
    label: pageStatus,
    className: "bg-gray-100 text-gray-600",
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/reports/${report.id}/export`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "보내기 실패");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? decodeURIComponent(contentDisposition.split("filename*=UTF-8''")[1] ?? "투자심의보고서.docx")
        : `${report.deal.companyName}_투자심의보고서.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "보내기 실패");
    } finally {
      setIsExporting(false);
    }
  };

  if (pageStatus === "GENERATING") {
    return <GeneratingView report={report} onComplete={handleReload} />;
  }

  if (pageStatus === "PENDING") {
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
        <div className="text-center py-16 space-y-4">
          <p className="text-gray-600">보고서 생성 대기 중입니다.</p>
          <p className="text-sm text-gray-400">
            IR 자료가 업로드되어 있으면 AI 보고서 생성을 시작할 수 있습니다.
          </p>
          <Button onClick={handleStartGeneration} disabled={isStarting}>
            {isStarting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            AI 보고서 생성 시작
          </Button>
          {startError && <p className="text-sm text-red-600">{startError}</p>}
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
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusDisplay.className}`}>
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
        reportStatus={pageStatus}
        onFinalize={handleFinalize}
        isFinalizing={isFinalizing}
      />
    </div>
  );
}

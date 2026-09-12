"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ReportEditor } from "@/components/reports/report-editor";
import { ReportQualityPanel } from "@/components/reports/report-quality-panel";
import { ReportEvidencePanel } from "@/components/reports/report-evidence-panel";
import { ReportDeepDivePanel } from "@/components/reports/report-deep-dive-panel";
import { IcQuestionsPanel } from "@/components/reports/ic-questions-panel";
import { IcReviewPanel } from "@/components/reports/ic-review-panel";
import { decideResumeAction } from "@/components/reports/report-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { formatKoreanDateTime } from "@/lib/utils";
import { safeReadJson } from "@/lib/safe-fetch";
import { SECTION_META } from "@/types";
import {
  runBatchImprove,
  type WeakSectionTarget,
  type BatchProgress,
} from "@/lib/improve-weak-orchestration";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

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
  /** DB 원본 Report.status — decideResumeAction의 checkpoint 판정에 쓰인다 */
  reportStatus?: string;
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
  const [streamDropped, setStreamDropped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // 일시적인 네트워크 오류로 곧장 실패 화면을 띄우지 않는다.
    let consecutiveErrors = 0;
    // report-generation.ts는 예산 소진이든 AI 호출 실패든(완성 섹션이
    // 0개여도) 항상 완성된 섹션까지 저장하고 스스로 멈춘다(정상 checkpoint,
    // Report.status=PENDING) — /status는 이 상태를 실제 오류와 구분하지
    // 않고 그대로 "error"로 내려주지만, reportStatus 필드로 PENDING인지는
    // 알 수 있다. 마법사(report-wizard.tsx)의 폴링 루프는 decideResumeAction으로
    // 이 둘을 구분해 checkpoint면 자동으로 /run을 다시 호출하는데, 마법사
    // 다이얼로그를 닫고 이 보고서 상세 페이지로 넘어오면(또는 GENERATING
    // 중 새로고침하면) 이 폴링 루프만 남고 그 auto-resume 로직이 없어서,
    // 사실상 정상 진행 중인 생성이 "생성 상태를 확인할 수 없습니다"로
    // 멈춰 보이는 문제가 있었다 — 같은 로직을 여기도 적용한다.
    let autoResumeCount = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/reports/${report.id}/status`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const { data } = (await res.json()) as { data: GenerationProgress };
        if (cancelled) return;

        consecutiveErrors = 0;

        const action = decideResumeAction(data, { autoResumeCount });

        if (action === "completed") {
          setProgress(data);
          setTimeout(onComplete, 500);
          return;
        }

        if (action === "auto-resume") {
          autoResumeCount += 1;
          setProgress({
            ...data,
            status: "generating",
            currentSection: "다음 섹션 이어서 생성 중...",
          });
          const resumeRes = await fetch(`/api/reports/${report.id}/run`, {
            method: "POST",
          }).catch(() => null);
          // 409 = 다른 요청이 이미 재개 중 — 실패로 보지 않고 계속 폴링한다.
          if (!resumeRes || (!resumeRes.ok && resumeRes.status !== 409)) {
            setProgress(data);
            return;
          }
        } else if (action === "error") {
          setProgress(data);
          return;
        } else {
          setProgress(data);
        }
      } catch {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) {
          setStreamDropped(true);
          return;
        }
      }
      timer = setTimeout(poll, 3000);
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [report.id, onComplete]);

  const stuck = streamDropped || progress?.status === "error";

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
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center ${
            stuck ? "bg-red-50" : "bg-blue-50"
          }`}
        >
          {stuck ? (
            <Sparkles className="w-10 h-10 text-red-400" />
          ) : (
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          )}
        </div>
        <div className="text-center w-full">
          <h2 className="text-xl font-bold text-gray-900">
            {stuck
              ? "생성 상태를 확인할 수 없습니다"
              : "AI가 보고서를 작성하고 있습니다"}
          </h2>
          <p className="text-gray-500 mt-2">{report.deal.companyName}</p>
        </div>
        {progress && progress.total > 0 && !stuck && (
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
        {stuck && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">
              {progress?.error ??
                "진행 상태 연결이 끊겼습니다. 상태를 다시 확인해 주세요."}
            </p>
            <Button variant="outline" size="sm" onClick={onComplete}>
              상태 새로고침
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportPageClient({
  report,
  canEdit = true,
  nimConfigured = false,
}: {
  report: Report;
  canEdit?: boolean;
  nimConfigured?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isExporting, setIsExporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState(report.status);

  // 다른 보고서로 이동해도 컴포넌트가 재사용될 수 있어 서버 상태와 다시 맞춘다
  useEffect(() => {
    setPageStatus(report.status);
  }, [report.id, report.status]);
  const [qualityRefreshKey, setQualityRefreshKey] = useState(0);
  const [improveRequest, setImproveRequest] = useState<{
    sectionKey: string;
    qualityIssues: string[];
    token: number;
  } | null>(null);
  const [batchImproving, setBatchImproving] = useState(false);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

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

  // 시간 예산 소진으로 스스로 멈춘 checkpoint(정상 상태)는 status가
  // PENDING으로 저장된다 — 이 페이지를 새로고침하거나 나중에 다시
  // 열었을 때(마법사 다이얼로그 밖) 진행 중이던 생성이 "대기 중"인 새
  // 보고서처럼 보여 사용자가 수동으로 버튼을 눌러야만 이어졌다. 이미
  // 만들어진 섹션이 있으면(=checkpoint) 사용자 조작 없이 바로 이어서
  // 생성을 요청한다 — 완전히 새 보고서(섹션 0개)는 그대로 수동 시작을 둔다.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (
      pageStatus === "PENDING" &&
      report.sections.length > 0 &&
      !autoResumedRef.current
    ) {
      autoResumedRef.current = true;
      handleStartGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, pageStatus]);

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: "보고서를 재생성할까요?",
      description: "기존 섹션 내용이 모두 덮어씌워집니다.",
      confirmLabel: "재생성",
      destructive: true,
    });
    if (!ok) return;
    setIsRegenerating(true);
    try {
      // mode를 명시하지 않으면 서버가 "이어서 생성"으로 처리해, 이미 완성된
      // 보고서에서는 전 섹션이 재사용되면서 아무것도 바뀌지 않는다.
      const response = await fetch(`/api/reports/${report.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "restart" }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "재생성 실패");
      }
      setPageStatus("GENERATING");
    } catch (error) {
      toast.error("재생성 실패", {
        description: error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setIsRegenerating(false);
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
      toast.error("완성 처리 실패", {
        description: error instanceof Error ? error.message : "다시 시도해 주세요",
      });
      setIsFinalizing(false);
    }
  };

  /**
   * 약한 섹션 일괄 개선 — 섹션마다 별도 요청으로 순차 호출한다.
   *
   * 대상 목록은 improve-weak GET(AI 호출 없음)으로 받고, 실제 재생성은
   * 이미 있는 단일 섹션 라우트(sections/regenerate, AI 호출 정확히 1회)를
   * 대상 수만큼 반복 호출한다. 한 HTTP 요청 안에서 여러 섹션을 순차로
   * AI 재생성하던 예전 구조가 Vercel 함수 실행시간 상한을 넘겨 죽으면서
   * "Unexpected end of JSON input"을 노출했던 문제를, 구조 자체를
   * 요청당-섹션-1개로 바꿔서 없앤다.
   *
   * 섹션 하나가 실패해도 이미 완료된 섹션은 DB에 그대로 남는다(각 섹션이
   * sections/regenerate 안에서 즉시 저장됨) — 그 뒤 섹션 호출만 멈추고
   * 부분 성공 상태를 그대로 보여준다.
   */
  const handleBatchImprove = async () => {
    const ok = await confirm({
      title: "약한 섹션을 일괄 개선할까요?",
      description:
        "품질 70점 미만 섹션(최대 3개)을 지적된 이슈를 반영해 순서대로 다시 생성합니다.",
      confirmLabel: "개선 실행",
    });
    if (!ok) return;

    setBatchImproving(true);
    setBatchNote(null);
    setBatchProgress(null);

    try {
      const planRes = await fetch(
        `/api/reports/${report.id}/improve-weak?maxSections=3&scoreThreshold=70`
      );
      const plan = await safeReadJson<{
        data: { targets: WeakSectionTarget[]; beforeScore: number };
      }>(planRes);
      if (!plan.ok) {
        toast.error("일괄 개선 실패", { description: plan.message });
        return;
      }

      const { targets, beforeScore } = plan.data.data;
      if (targets.length === 0) {
        setBatchNote("모든 섹션이 70점 이상입니다.");
        return;
      }

      const { improved, stoppedEarly, stopMessage } = await runBatchImprove(
        targets,
        async (target) => {
          const res = await fetch(
            `/api/reports/${report.id}/sections/regenerate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sectionKey: target.sectionKey,
                qualityIssues: [...target.issues, ...target.warnings].slice(0, 12),
              }),
            }
          );
          const parsed = await safeReadJson<{ data: { quality?: { score: number } } }>(res);
          if (!parsed.ok) return { ok: false, message: parsed.message };
          // 완료된 섹션은 이미 DB에 저장돼 있으니, 전체가 끝나기 전이라도
          // 품질 패널을 바로 갱신해도 안전하다.
          setQualityRefreshKey((k) => k + 1);
          return { ok: true, afterScore: parsed.data.data.quality?.score ?? 0 };
        },
        setBatchProgress
      );

      let afterScoreLabel = "";
      if (improved.length > 0) {
        const qualityRes = await fetch(`/api/reports/${report.id}/quality`);
        const quality = await safeReadJson<{ data: { overallScore: number } }>(qualityRes);
        if (quality.ok) {
          afterScoreLabel = ` (${beforeScore} → ${quality.data.data.overallScore}점)`;
        }
      }

      if (stoppedEarly) {
        setBatchNote(
          `${improved.length}/${targets.length}개 섹션까지 개선 후 중단됨${afterScoreLabel} — 완료된 섹션은 저장되어 있습니다.`
        );
        toast.error("일부만 개선되었습니다", { description: stopMessage ?? undefined });
      } else {
        setBatchNote(`개선 ${improved.length}개${afterScoreLabel}`);
        setTimeout(() => router.refresh(), 1500);
      }
    } catch (e) {
      toast.error("일괄 개선 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setBatchImproving(false);
      setBatchProgress(null);
    }
  };

  const statusDisplay = STATUS_DISPLAY[pageStatus] ?? {
    label: pageStatus,
    className: "bg-gray-100 text-gray-600",
  };

  const handleExport = async (format: "docx" | "pptx" = "docx") => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/reports/${report.id}/export/${format}`,
        { method: "POST" }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "보내기 실패");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const defaultName =
        format === "pptx"
          ? `${report.deal.companyName}_투자심의보고서.pptx`
          : `${report.deal.companyName}_투자심의보고서.docx`;
      const filename = contentDisposition
        ? decodeURIComponent(contentDisposition.split("filename*=UTF-8''")[1] ?? defaultName)
        : defaultName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("내보내기 실패", {
        description: error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (pageStatus === "GENERATING") {
    return <GeneratingView report={report} onComplete={handleReload} />;
  }

  if (pageStatus === "PENDING") {
    // 섹션이 이미 있으면 "새 보고서 대기 중"이 아니라 시간 예산 소진으로
    // 스스로 멈춘 checkpoint다 — 위 useEffect가 자동으로 이어서 생성을
    // 요청하는 동안 잠깐 보이는 화면이라 문구도 그에 맞게 다르게 보여준다.
    const hasPartialProgress = report.sections.length > 0;
    const totalSections = SECTION_META.length;
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
          <p className="text-gray-600">
            {hasPartialProgress
              ? `${report.sections.length}/${totalSections} 섹션까지 생성됐습니다. 자동으로 이어서 생성합니다.`
              : "보고서 생성 대기 중입니다."}
          </p>
          <p className="text-sm text-gray-400">
            {hasPartialProgress
              ? "잠시만 기다려 주세요 — 자동으로 이어지지 않으면 아래 버튼을 눌러 주세요."
              : "IR 자료가 업로드되어 있으면 AI 보고서 생성을 시작할 수 있습니다."}
          </p>
          <Button onClick={handleStartGeneration} disabled={isStarting}>
            {isStarting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {hasPartialProgress ? "이어서 생성" : "AI 보고서 생성 시작"}
          </Button>
          {startError && <p className="text-sm text-red-600">{startError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            생성일: {formatKoreanDateTime(report.generatedAt)}
          </p>
        )}
      </div>

      {report.sections.length > 0 && (
        <IcReviewPanel reportId={report.id} dealId={report.deal.id} canEdit={canEdit} />
      )}

      {report.sections.length > 0 && (
        <ReportQualityPanel
          reportId={report.id}
          refreshKey={qualityRefreshKey}
          batchImproving={batchImproving}
          improvingSectionKey={improveRequest?.sectionKey ?? null}
          onImproveSection={
            canEdit
              ? (sectionKey, qualityIssues) =>
                  setImproveRequest({
                    sectionKey,
                    qualityIssues,
                    token: Date.now(),
                  })
              : undefined
          }
          onBatchImprove={canEdit ? handleBatchImprove : undefined}
        />
      )}

      {report.sections.length > 0 && (
        <ReportEvidencePanel
          reportId={report.id}
          refreshKey={qualityRefreshKey}
          canEdit={canEdit}
        />
      )}

      {report.sections.length > 0 && (
        <ReportDeepDivePanel reportId={report.id} canEdit={canEdit} />
      )}

      {report.sections.length > 0 && (
        <IcQuestionsPanel reportId={report.id} canEdit={canEdit} />
      )}

      {batchImproving && batchProgress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          약한 섹션 일괄 개선 중 — {batchProgress.done}/{batchProgress.total}
          {batchProgress.currentTitle ? ` ${batchProgress.currentTitle}` : ""}
        </div>
      )}

      {!batchImproving && batchNote && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {batchNote}
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          조회 전용 — 섹션 편집·재생성·승인은 파트너·관리자 또는 딜 소유자만 가능합니다.
          내보내기(DOCX/PPTX/PDF)는 가능합니다.
        </div>
      )}

      <ReportEditor
        reportId={report.id}
        sections={report.sections}
        dealName={`${report.deal.companyName} 투자심의보고서`}
        onExport={() => handleExport("docx")}
        onExportPptx={() => handleExport("pptx")}
        isExporting={isExporting}
        reportStatus={pageStatus}
        onFinalize={canEdit ? handleFinalize : undefined}
        isFinalizing={isFinalizing}
        onRegenerate={canEdit ? handleRegenerate : undefined}
        isRegenerating={isRegenerating}
        readOnly={!canEdit}
        onSectionRegenerated={() =>
          setQualityRefreshKey((k) => k + 1)
        }
        improveRequest={canEdit ? improveRequest : null}
        onImproveHandled={() => setImproveRequest(null)}
        nimConfigured={nimConfigured}
      />
    </div>
  );
}

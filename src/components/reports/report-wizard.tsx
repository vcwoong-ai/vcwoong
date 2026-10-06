"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Loader2,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  LayoutTemplate,
  Brain,
} from "lucide-react";
import { AgentType, DealSector, ReportStatus } from "@prisma/client";
import { SECTION_META } from "@/types";
import { AGENT_META } from "@/agents/agent-meta";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  status: string;
  fileType: string;
}

interface WizardProps {
  deal: {
    id: string;
    companyName: string;
    sector: DealSector;
    documents: Array<{ id: string }>;
  };
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
}

const SECTOR_AGENT_MAP: Partial<Record<DealSector, AgentType>> = {
  BIO: AgentType.BIO,
  IT: AgentType.IT,
  DEEPTECH: AgentType.DEEPTECH,
  MANUFACTURING: AgentType.MANUFACTURING,
  CONTENT: AgentType.CONTENT,
  FINTECH: AgentType.FINTECH,
  CLIMATE: AgentType.GENERAL,
  CONSUMER: AgentType.GENERAL,
};

interface GenerationProgress {
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
  /**
   * DB에 저장된 원본 Report.status(PENDING/GENERATING/DRAFT/...). status="error"와
   * 별개로 내려오는 값 — decideResumeAction이 "재개 가능한 checkpoint"와
   * "진짜 오류"를 구분하는 핵심 신호다(아래 decideResumeAction 주석 참고).
   */
  reportStatus?: string;
}

export function isValidReportId(value: unknown): value is string {
  return typeof value === "string" && (/^c[a-z0-9]{24}$/.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

export function isGenerationProgress(value: unknown): value is GenerationProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as GenerationProgress;
  return ["generating", "completed", "error"].includes(progress.status) &&
    Number.isInteger(progress.completed) && Number.isInteger(progress.total) &&
    progress.total === SECTION_META.length && progress.completed >= 0 && progress.completed <= progress.total &&
    typeof progress.currentSection === "string" &&
    (progress.status !== "completed" || (progress.completed === progress.total &&
      progress.reportStatus !== "PENDING" && progress.reportStatus !== "GENERATING")) &&
    (progress.reportStatus === undefined || Object.values(ReportStatus).includes(progress.reportStatus as ReportStatus));
}

function generationResponseMessage(status: number) {
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인한 뒤 딜의 보고서 목록을 확인하세요.";
  if (status === 403) return "보고서를 생성하거나 재개할 권한이 없습니다. 딜의 접근 권한을 확인하세요.";
  if (status === 404) return "딜 또는 보고서를 찾지 못했습니다. 딜 목록에서 현재 상태를 확인하세요.";
  if (status === 409) return "이미 진행 중인 보고서 작업이 있습니다. 딜의 보고서 목록에서 진행 상태를 확인하세요.";
  if (status === 429) return "생성 한도에 도달했거나 요청이 많습니다. 사용량과 기존 보고서를 확인하세요.";
  if (status === 503) return "AI 보고서 생성 서비스가 준비되지 않았습니다. 서비스 관리자에게 문의해 주세요.";
  return "생성 요청 결과를 확인하지 못했습니다. 새로 생성하기 전에 딜의 보고서 목록을 확인하세요.";
}

// report-generation.ts는 함수 실행시간 상한(GENERATION_BUDGET_MS) 소진 시
// 완성된 섹션까지 저장하고 스스로 멈춘다(정상 checkpoint, 실제 오류 아님) —
// 총 섹션 수(10개)보다 넉넉한 상한을 둬서 섹션 하나가 여러 checkpoint를
// 거쳐도(느린 모델 등) 자동 재개가 막히지 않게 하되, 무한 루프는 방지한다.
export const MAX_AUTO_RESUMES = 20;

export type ResumePollAction =
  | "completed"
  | "auto-resume"
  | "continue-generating"
  | "error";

/**
 * 폴링 결과 하나를 받아 다음 행동을 결정하는 순수 함수(네트워크 호출 없음) —
 * tools/test-report-wizard-resume.ts에서 checkpoint/실제 오류/무한 루프
 * 방지 시나리오를 컴포넌트 렌더링 없이 검증할 수 있도록 분리했다.
 *
 * status="error"는 report-generation.ts가 시간 예산 소진(정상 checkpoint)이든
 * AI 호출이 끝내 실패했든(section=0 포함) 구분 없이 그대로 내려준다 — 실제
 * 구분은 reportStatus로 한다. report-generation.ts는 이 두 경우 전부에서
 * (그리고 completed가 0이든 아니든) 항상 Report.status를 PENDING으로
 * 되돌린다(checkpoint_saved=true, resume_expected=true — 코드 주석 참고).
 * 즉 reportStatus==="PENDING"이라는 것 자체가 "서버가 재개 가능하다고 판단한
 * checkpoint"라는 명시적 신호이지, completed 수로 다시 추측할 대상이 아니다.
 *
 * 예전엔 completed>0을 요구했다 — 그래서 "첫 섹션에서 AI가 타임아웃"(completed
 * 여전히 0)나면 checkpoint가 아니라 곧장 실제 오류로 처리되어, 뒤에서
 * cron(/api/cron/resume-generations)이 정상적으로 재시도해 결국 완료로
 * 이어지고 있었는데도 브라우저 화면만 "생성 중 오류"로 멈췄다(2026-09-12
 * 실측: report=cmtycq7ne... — 3번의 cron tick 동안 0/10에서 실패하다 4번째
 * tick에서 1~3/10까지 정상 진행). reportStatus 기준으로 바꾸면 completed가
 * 0이든 아니든 서버가 재개 대상으로 본 checkpoint를 그대로 신뢰한다.
 *
 * 무한 루프 방지는 진행 여부(madeProgress) 대신 재개 횟수 상한
 * (autoResumeCount, MAX_AUTO_RESUMES)만으로 건다 — "재개할 때마다 completed가
 * 반드시 늘어야 한다"는 조건은, 지금처럼 첫 섹션 자체가 여러 번 연속
 * 타임아웃 났다가 나중에 성공하는(=completed가 몇 번의 재개 동안 0에
 * 머무를 수 있는) 정상적인 흐름까지 "정체"로 오판해 너무 일찍 포기하게
 * 만든다. 상한(20/cron은 DB의 MAX_AUTO_RESUME_ATTEMPTS=30) 안에서는 진행이
 * 없어도 계속 재시도하는 편이 낫다 — 어차피 상한이 진짜 무한 재시도를 막는다.
 */
export function decideResumeAction(
  prog: GenerationProgress,
  state: { autoResumeCount: number; maxAutoResumes?: number }
): ResumePollAction {
  if (prog.status === "completed") return "completed";
  if (prog.status !== "error") return "continue-generating";

  const isResumableCheckpoint =
    prog.total > 0 && prog.completed < prog.total && prog.reportStatus === "PENDING";
  const withinLimit = state.autoResumeCount < (state.maxAutoResumes ?? MAX_AUTO_RESUMES);

  return isResumableCheckpoint && withinLimit ? "auto-resume" : "error";
}

export function ReportWizard({ deal, open, onClose, canEdit = true }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: 에이전트 선택, 2: 양식 선택, 3: 생성
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(
    SECTOR_AGENT_MAP[deal.sector] ?? AgentType.GENERAL
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const templateControllerRef = useRef<AbortController | null>(null);
  const templateEpochRef = useRef(0);
  const sectorControllerRef = useRef<AbortController | null>(null);
  const sectorEpochRef = useRef(0);
  const sessionEpochRef = useRef(0);
  const generationPendingRef = useRef(false);
  const cancelAuxiliaryRequests = useCallback(() => {
    sessionEpochRef.current++;
    generationPendingRef.current = false;
    templateEpochRef.current++;
    sectorEpochRef.current++;
    templateControllerRef.current?.abort();
    sectorControllerRef.current?.abort();
    templateControllerRef.current = null;
    sectorControllerRef.current = null;
  }, []);
  const [detectedSector, setDetectedSector] = useState<{ sector: string; label: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  // 마법사가 닫히면 진행 중인 폴링 루프를 멈춘다.
  const pollAbortRef = useRef(false);

  const loadTemplates = useCallback(async () => {
    templateControllerRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++templateEpochRef.current;
    templateControllerRef.current = controller;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const response = await fetch("/api/templates", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Templates unavailable");
      const { data } = await response.json();
      if (controller.signal.aborted || epoch !== templateEpochRef.current) return;
      if (!Array.isArray(data) || !data.every(t => t && typeof t.id === "string" && typeof t.name === "string" &&
        typeof t.status === "string" && typeof t.fileType === "string")) throw new Error("Templates unavailable");
      setTemplates(data.filter((template: Template) => template.status === "READY"));
    } catch {
      if (!controller.signal.aborted && epoch === templateEpochRef.current)
        setTemplatesError("양식 목록을 불러오지 못했습니다. 다시 조회하거나 기본 양식을 선택해 주세요.");
    } finally {
      if (!controller.signal.aborted && epoch === templateEpochRef.current) {
        templateControllerRef.current = null;
        setTemplatesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      pollAbortRef.current = false;
      setStep(1);
      setProgress(null);
      setReportId(null);
      setGenerating(false);
      setGenError(null);
      setDetectedSector(null);
      setSectorError(null);
      setDetecting(false);
      loadTemplates();
    }
    return () => {
      pollAbortRef.current = true;
      cancelAuxiliaryRequests();
    };
  }, [open, deal.id, loadTemplates, cancelAuxiliaryRequests]);

  const detectSector = async () => {
    if (!canEdit || !deal.documents.length || sectorControllerRef.current) return;
    const controller = new AbortController();
    const epoch = ++sectorEpochRef.current;
    sectorControllerRef.current = controller;
    setDetecting(true);
    setSectorError(null);
    setDetectedSector(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/detect-sector`, { method: "POST", signal: controller.signal });
      if (!res.ok) throw new Error("Sector unavailable");
      const { data } = await res.json();
      if (controller.signal.aborted || epoch !== sectorEpochRef.current) return;
      if (data && typeof data.sector === "string" && Object.values(DealSector).includes(data.sector as DealSector) && typeof data.label === "string") {
        setDetectedSector(data);
        const agentType = SECTOR_AGENT_MAP[data.sector as DealSector] ?? AgentType.GENERAL;
        setSelectedAgent(agentType);
      } else throw new Error("Sector unavailable");
    } catch {
      if (!controller.signal.aborted && epoch === sectorEpochRef.current)
        setSectorError("섹터를 자동 감지하지 못했습니다. 분석할 에이전트를 직접 선택해 주세요.");
    } finally {
      if (!controller.signal.aborted && epoch === sectorEpochRef.current) {
        sectorControllerRef.current = null;
        setDetecting(false);
      }
    }
  };

  const startGeneration = async () => {
    if (generating || generationPendingRef.current || !canEdit) return;
    if (selectedTemplateId && (templatesLoading || templatesError || !templates.some(template => template.id === selectedTemplateId))) {
      setGenError("선택한 양식을 확인하지 못했습니다. 양식 목록을 다시 조회하거나 기본 양식을 선택하세요.");
      return;
    }
    const sessionEpoch = sessionEpochRef.current;
    const isCurrentSession = () => !pollAbortRef.current && sessionEpoch === sessionEpochRef.current;
    if (!isCurrentSession()) return;
    generationPendingRef.current = true;
    setGenerating(true);
    setGenError(null);
    setStep(3);

    try {
      const res = await fetch(`/api/deals/${deal.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: selectedAgent,
          ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
        }),
      });
      if (!isCurrentSession()) return;
      if (!res.ok) {
        setGenError(generationResponseMessage(res.status));
        return;
      }

      const { data } = await res.json();
      if (!isCurrentSession()) return;
      const id: unknown = data?.id;
      if (!isValidReportId(id)) {
        setGenError(generationResponseMessage(0));
        return;
      }
      setReportId(id);

      // 진행 상태 폴링 — SSE는 서버리스에서 장시간 연결이 쉽게 끊겨,
      // 매 요청이 즉시 끝나는 폴링이 훨씬 안정적이다.
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let consecutiveErrors = 0;
      let finalStatus: GenerationProgress["status"] | "dropped" = "generating";
      // Vercel 함수 실행시간 상한 때문에 report-generation.ts가 예산
      // (GENERATION_BUDGET_MS) 소진이든 AI 호출 실패든 "실패"로 끝나지
      // 않고 스스로 멈추며 status="error"로 보고한다(완성된 섹션 수가
      // 0이어도 마찬가지 — report-wizard.tsx의 decideResumeAction 주석
      // 참고). 이 경우를 진짜 오류와 구분해 자동으로 /run을 다시 호출해
      // 이어서 생성한다. 무한 루프 방지는 재개 횟수 상한(MAX_AUTO_RESUMES)만
      // 사용한다.
      let autoResumeCount = 0;

      while (isCurrentSession()) {
        try {
          const statusRes = await fetch(`/api/reports/${id}/status`, {
            cache: "no-store",
          });
          if (!isCurrentSession()) return;
          if ([401, 403, 404].includes(statusRes.status)) {
            setGenError(generationResponseMessage(statusRes.status));
            return;
          }
          if (!statusRes.ok) throw new Error("Status unavailable");
          const { data: prog } = (await statusRes.json()) as {
            data: GenerationProgress;
          };
          if (!isCurrentSession()) return;
          if (!isGenerationProgress(prog)) throw new Error("Status unavailable");
          consecutiveErrors = 0;

          const action = decideResumeAction(prog, { autoResumeCount });

          if (action === "completed") {
            setProgress(prog);
            finalStatus = "completed";
            break;
          }

          if (action === "auto-resume") {
            autoResumeCount += 1;
            // 오류로 보이지 않도록 "생성 중"으로 표시한 채 이어서 생성을 요청한다.
            setProgress({ ...prog, status: "generating", currentSection: "다음 섹션 이어서 생성 중..." });
            const resumeRes = await fetch(`/api/reports/${id}/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // 사용자 조작 없이 스스로 이어서 호출하는 것임을 서버에 알려
              // report-gen rate limit에서 제외되게 한다(run/route.ts의
              // isAutoResumeExemptFromRateLimit 참고).
              body: JSON.stringify({ trigger: "auto" }),
            }).catch(() => null);
            if (!isCurrentSession()) return;
            // 409 = 다른 요청이 이미 재개 중 — 실패로 보지 않고 계속 폴링한다.
            if (!resumeRes || (!resumeRes.ok && resumeRes.status !== 409)) {
              setProgress(prog);
              setGenError(generationResponseMessage(resumeRes?.status ?? 0));
              return;
            }
          } else if (action === "error") {
            setProgress(prog);
            finalStatus = "error";
            break;
          } else {
            setProgress(prog);
          }
        } catch {
          if (!isCurrentSession()) return;
          // 일시적 오류로 곧장 실패 처리하지 않는다.
          consecutiveErrors += 1;
          if (consecutiveErrors >= 5) {
            finalStatus = "dropped";
            break;
          }
        }
        await sleep(3000);
      }

      if (finalStatus !== "completed") {
        if (!isCurrentSession()) return;
        setGenError(
          finalStatus === "error"
            ? "생성 중 오류가 발생했습니다. 보고서 페이지에서 상태를 확인하세요."
            : "진행 상태를 확인하지 못했습니다. 보고서 페이지에서 확인하세요."
        );
      }
    } catch {
      if (!isCurrentSession()) return;
      setGenError(generationResponseMessage(0));
    } finally {
      if (isCurrentSession()) {
        generationPendingRef.current = false;
        setGenerating(false);
      }
    }
  };

  const goToReport = () => {
    if (reportId) router.push(`/reports/${reportId}`);
    onClose();
    router.refresh();
  };

  const isDone = progress?.status === "completed";
  const progressPct = progress?.total ? (progress.completed / progress.total) * 100 : 0;
  const selectedAgentMeta = AGENT_META.find((a) => a.id === selectedAgent);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        // 생성 중에는 닫히지 않지만, 완료/오류 상태에서는 항상 닫을 수 있어야 한다
        if (!generating || isDone || genError) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            AI 보고서 생성
          </DialogTitle>
        </DialogHeader>

        {/* 진행 단계 표시 */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                step === s ? "bg-primary text-white" :
                step > s ? "bg-green-500 text-white" :
                "bg-gray-100 text-gray-400"
              )}>
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              <span className={cn("text-xs", step >= s ? "text-gray-700" : "text-gray-400")}>
                {s === 1 ? "에이전트" : s === 2 ? "양식" : "생성"}
              </span>
              {s < 3 && <div className={cn("w-8 h-0.5", step > s ? "bg-green-400" : "bg-gray-200")} />}
            </div>
          ))}
        </div>

        {/* Step 1: 에이전트 선택 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">분석할 AI 에이전트를 선택하세요</p>
              {deal.documents.length > 0 && (
                <Button variant="outline" size="sm" onClick={detectSector} disabled={detecting || !canEdit}>
                  {detecting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  자동 감지
                </Button>
              )}
            </div>

            {!canEdit && <p className="text-sm text-muted-foreground">보고서 생성과 자동 감지는 딜 소유자 또는 편집 권한이 있는 팀원만 가능합니다.</p>}
            {sectorError && <p role="alert" data-testid="wizard-sector-error" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{sectorError}</p>}

            {detectedSector && (
              <div className="text-xs text-primary bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="font-medium">감지된 섹터: {detectedSector.label}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {AGENT_META.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-colors",
                    selectedAgent === agent.id
                      ? "border-primary bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${agent.dot}`} />
                    <span className="text-sm font-semibold">{agent.name}</span>
                    {selectedAgent === agent.id && (
                      <Badge className="ml-auto text-xs py-0">선택</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-tight">{agent.desc.slice(0, 40)}...</p>
                </button>
              ))}
            </div>

            <Button onClick={() => setStep(2)} className="w-full">
              다음 <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2: 양식 선택 */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">출력 양식을 선택하세요 (선택 사항)</p>
            {templatesLoading && <p role="status" className="text-sm text-muted-foreground">양식 목록을 불러오는 중입니다.</p>}
            {templatesError && <div role="alert" data-testid="wizard-template-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{templatesError}</p>
              <Button variant="outline" size="sm" onClick={loadTemplates} disabled={templatesLoading}>양식 목록 다시 조회</Button>
            </div>}

            <div className="space-y-2">
              <button
                onClick={() => setSelectedTemplateId("")}
                className={cn(
                  "w-full p-3 rounded-lg border-2 text-left transition-colors",
                  !selectedTemplateId ? "border-primary bg-blue-50" : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">기본 {BRAND.name} 양식</p>
                    <p className="text-xs text-gray-500">표준 10섹션 투자심의위원회 보고서</p>
                  </div>
                  {!selectedTemplateId && <Badge className="ml-auto">선택됨</Badge>}
                </div>
              </button>

              {templates.length > 0 && templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={cn(
                    "w-full p-3 rounded-lg border-2 text-left transition-colors",
                    selectedTemplateId === t.id ? "border-primary bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.fileType} 양식</p>
                    </div>
                    {selectedTemplateId === t.id && <Badge className="ml-auto">선택됨</Badge>}
                  </div>
                </button>
              ))}

              {!templatesLoading && !templatesError && templates.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400 border border-dashed rounded-lg">
                  등록된 양식 없음 — <a href="/templates" className="text-primary underline">양식 관리</a>에서 추가
                </div>
              )}
            </div>

            {/* 요약 */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">에이전트</span>
                <span className="font-medium">{selectedAgentMeta?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">양식</span>
                <span className="font-medium">
                  {selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId)?.name : "기본"}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-1" /> 이전
              </Button>
              <Button
                onClick={startGeneration}
                disabled={generating || !canEdit || (!!selectedTemplateId && (templatesLoading || !!templatesError || !templates.some(template => template.id === selectedTemplateId)))}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-1" />
                )}
                생성 시작
              </Button>
            </div>
          </div>
        )}

        {step === 2 && genError && (
          <p className="text-sm text-red-600">{genError}</p>
        )}

        {/* Step 3: 생성 중 */}
        {step === 3 && (
          <div className="space-y-6 py-2">
            {genError ? (
              <div className="space-y-4 text-center">
                <p role="alert" data-testid="wizard-generation-error" className="text-sm text-red-600">{genError}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                     onClick={() => {
                       router.push(`/deals/${deal.id}`);
                       onClose();
                     }}
                  >
                    딜 보고서 목록 확인
                  </Button>
                  {reportId && (
                    <Button className="flex-1" onClick={goToReport}>
                      보고서 열기 <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            ) : !isDone ? (
              <>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{selectedAgentMeta?.name} 에이전트 작업 중</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {progress?.currentSection ?? "분석 준비 중..."}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>진행률</span>
                    <span>{progress?.completed ?? 0} / {progress?.total ?? 10} 섹션</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                </div>

                <p className="text-xs text-center text-gray-400">
                  {selectedAgent === AgentType.BIO
                    ? "PubMed·ClinicalTrials·FDA 실시간 데이터 조회 포함 시 최대 10분 소요"
                    : "AI 분석에 최대 몇 분 정도 소요될 수 있습니다"}
                </p>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-9 h-9 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900">보고서 생성 완료!</h3>
                  <p className="text-sm text-gray-500 mt-1">10개 섹션이 성공적으로 작성됐습니다.</p>
                </div>
                <Button onClick={goToReport} className="w-full bg-green-600 hover:bg-green-700">
                  보고서 열기 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

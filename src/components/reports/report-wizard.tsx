"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AgentType, DealSector } from "@prisma/client";
import { AGENT_META } from "@/agents";
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
}

const SECTOR_AGENT_MAP: Partial<Record<DealSector, AgentType>> = {
  BIO: AgentType.BIO,
  IT: AgentType.IT,
  DEEPTECH: AgentType.DEEPTECH,
  MANUFACTURING: AgentType.MANUFACTURING,
  CONTENT: AgentType.CONTENT,
  FINTECH: AgentType.FINTECH,
};

interface GenerationProgress {
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
}

export function ReportWizard({ deal, open, onClose }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: 에이전트 선택, 2: 양식 선택, 3: 생성
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(
    SECTOR_AGENT_MAP[deal.sector] ?? AgentType.GENERAL
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detectedSector, setDetectedSector] = useState<{ sector: string; label: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setProgress(null);
      setReportId(null);
      setGenerating(false);
      fetch("/api/templates")
        .then((r) => r.json())
        .then((d) => setTemplates((d.data ?? []).filter((t: Template) => t.status === "READY")))
        .catch(() => {});
    }
    return () => eventSourceRef.current?.close();
  }, [open]);

  const detectSector = async () => {
    if (!deal.documents.length) return;
    setDetecting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/detect-sector`, { method: "POST" });
      const { data } = await res.json();
      if (data?.sector) {
        setDetectedSector(data);
        const agentType = SECTOR_AGENT_MAP[data.sector as DealSector] ?? AgentType.GENERAL;
        setSelectedAgent(agentType);
      }
    } catch { /* ignore */ } finally {
      setDetecting(false);
    }
  };

  const startGeneration = async () => {
    setGenerating(true);
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
      if (!res.ok) throw new Error("보고서 생성 요청 실패");

      const { data } = await res.json();
      const id = data?.id as string;
      setReportId(id);

      // SSE 구독
      const es = new EventSource(`/api/reports/${id}/progress`);
      eventSourceRef.current = es;

      await new Promise<void>((resolve) => {
        es.onmessage = (event) => {
          try {
            const prog: GenerationProgress = JSON.parse(event.data);
            setProgress(prog);
            if (prog.status === "completed" || prog.status === "error") {
              es.close();
              resolve();
            }
          } catch { /* ignore */ }
        };
        es.onerror = () => { es.close(); resolve(); };
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
      setGenerating(false);
      setStep(2);
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
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onClose(); else if (o === false && isDone) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            AI 보고서 생성
          </DialogTitle>
        </DialogHeader>

        {/* 진행 단계 표시 */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                step === s ? "bg-blue-600 text-white" :
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
                <Button variant="outline" size="sm" onClick={detectSector} disabled={detecting}>
                  {detecting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  자동 감지
                </Button>
              )}
            </div>

            {detectedSector && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
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
                      ? "border-blue-500 bg-blue-50"
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

            <div className="space-y-2">
              <button
                onClick={() => setSelectedTemplateId("")}
                className={cn(
                  "w-full p-3 rounded-lg border-2 text-left transition-colors",
                  !selectedTemplateId ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">기본 DealSync 양식</p>
                    <p className="text-xs text-gray-500">표준 10섹션 IC 보고서</p>
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
                    selectedTemplateId === t.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.fileType} 양식</p>
                    </div>
                    {selectedTemplateId === t.id && <Badge className="ml-auto">선택됨</Badge>}
                  </div>
                </button>
              ))}

              {templates.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400 border border-dashed rounded-lg">
                  등록된 양식 없음 — <a href="/templates" className="text-blue-500 underline">양식 관리</a>에서 추가
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
              <Button onClick={startGeneration} className="flex-1 bg-blue-600 hover:bg-blue-700">
                <Zap className="w-4 h-4 mr-1" /> 생성 시작
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 생성 중 */}
        {step === 3 && (
          <div className="space-y-6 py-2">
            {!isDone ? (
              <>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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
                  PubMed·ClinicalTrials·FDA 실시간 데이터 조회 포함 시 최대 10분 소요
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

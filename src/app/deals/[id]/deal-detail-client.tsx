"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileUploader } from "@/components/upload/file-uploader";
import {
  FileText,
  Upload,
  Zap,
  Loader2,
  ExternalLink,
  File,
  Calendar,
  Sparkles,
  LayoutTemplate,
  Trash2,
  Gauge,
  Landmark,
} from "lucide-react";
import { EditDealDialog } from "@/components/deals/edit-deal-dialog";
import { TeamShareToggle } from "@/components/team/team-share-toggle";
import { ReportWizard } from "@/components/reports/report-wizard";
import { DealReviewOverview } from "@/components/deals/deal-review-overview";
import { DealScoreRadar } from "@/components/deals/deal-score-radar";
import { DealDartPanel } from "@/components/deals/deal-dart-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { AgentType, DealSector, DealStage } from "@prisma/client";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";

interface DealWithRelations {
  id: string;
  userId: string;
  teamId: string | null;
  name: string;
  companyName: string;
  sector: DealSector;
  stage: DealStage;
  investRound: string | null;
  investAmount: number | null;
  valuation: number | null;
  description: string | null;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    mimeType: string;
    createdAt: string;
    parsedText: string | null;
    metadata: { warning?: string } | null;
  }>;
  reports: Array<{
    id: string;
    title: string;
    agentType: AgentType;
    status: string;
    createdAt: string;
    sections: Array<{
      id: string;
      title: string;
      order: number;
      status: string;
    }>;
  }>;
}

const SECTOR_AGENT_MAP: Record<DealSector, AgentType> = {
  BIO: AgentType.BIO,
  IT: AgentType.IT,
  FINTECH: AgentType.FINTECH,
  DEEPTECH: AgentType.DEEPTECH,
  MANUFACTURING: AgentType.MANUFACTURING,
  CONTENT: AgentType.CONTENT,
  CONSUMER: AgentType.GENERAL,
  GENERAL: AgentType.GENERAL,
  CLIMATE: AgentType.GENERAL,
};

const AGENT_INFO: Record<AgentType, { name: string; desc: string; color: string }> = {
  [AgentType.BIO]: {
    name: "Dr. Cell",
    desc: "바이오/헬스케어 특화 — rNPV 모델링 포함",
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  [AgentType.IT]: {
    name: "Code",
    desc: "IT/SaaS 특화 — ARR, LTV/CAC 분석 포함",
    color: "text-primary bg-blue-50 border-blue-200",
  },
  [AgentType.DEEPTECH]: {
    name: "Neuron",
    desc: "AI/딥테크 특화 — TRL, GPU 유닛 이코노믹스",
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
  },
  [AgentType.MANUFACTURING]: {
    name: "Maker",
    desc: "제조/하드웨어 특화 — BOM, Capex, 공급망",
    color: "text-orange-700 bg-orange-50 border-orange-200",
  },
  [AgentType.CONTENT]: {
    name: "Story",
    desc: "콘텐츠/엔터 특화 — IP 가치, 팬덤 경제",
    color: "text-pink-700 bg-pink-50 border-pink-200",
  },
  [AgentType.FINTECH]: {
    name: "Vault",
    desc: "핀테크/금융 특화 — TPV, 규제, 신용 리스크",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  [AgentType.GENERAL]: {
    name: "General",
    desc: "범용 투자 분석 — 기후/소비재는 Climate·Consumer 특화",
    color: "text-gray-700 bg-gray-50 border-gray-200",
  },
};

/** Radix Select는 빈 문자열 value를 허용하지 않아 센티널 값을 쓴다 */
const DEFAULT_TEMPLATE_VALUE = "__default__";

function recommendedAgentLabel(sector: DealSector, agentType: AgentType): string {
  if (sector === DealSector.CLIMATE) return "Climate";
  if (sector === DealSector.CONSUMER) return "Consumer";
  return AGENT_INFO[agentType].name;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  GENERATING: "생성 중",
  DRAFT: "초안",
  REVIEW: "검토 중",
  FINAL: "최종",
  EXPORTED: "내보내기",
};

interface GenerationProgress {
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
}

interface TemplateOption {
  id: string;
  name: string;
  status: string;
  fileType: string;
}

export function DealDetailClient({
  deal,
  demoMode = false,
  currentUserId,
  userTeamId,
  canUseTeam = false,
  canEdit = true,
  userRole = "ANALYST",
  meetingEnabled = false,
}: {
  deal: DealWithRelations;
  demoMode?: boolean;
  currentUserId: string;
  userTeamId: string | null;
  canUseTeam?: boolean;
  canEdit?: boolean;
  userRole?: string;
  meetingEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");
  const toast = useToast();
  const confirm = useConfirm();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [detectingsector, setDetectingSector] = useState(false);
  const [detectedSector, setDetectedSector] = useState<{ sector: string; reason: string } | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const templateControllerRef = useRef<AbortController | null>(null);
  const templateEpochRef = useRef(0);
  const sectorControllerRef = useRef<AbortController | null>(null);
  const sectorEpochRef = useRef(0);
  const cancelAuxiliaryRequests = useCallback(() => {
    templateEpochRef.current++;
    sectorEpochRef.current++;
    templateControllerRef.current?.abort();
    sectorControllerRef.current?.abort();
    templateControllerRef.current = null;
    sectorControllerRef.current = null;
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    DEFAULT_TEMPLATE_VALUE
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [deletingDeal, setDeletingDeal] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [monitoredReportId, setMonitoredReportId] = useState<string | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const pollEpochRef = useRef(0);
  const cancelStatusPolling = useCallback(() => {
    pollEpochRef.current++;
    pollControllerRef.current?.abort();
    pollControllerRef.current = null;
  }, []);

  // 사용 가능한 템플릿 로드
  const loadTemplates = useCallback(async () => {
    templateControllerRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++templateEpochRef.current;
    templateControllerRef.current = controller;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await fetch("/api/templates", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Templates unavailable");
      const { data } = await res.json();
      if (controller.signal.aborted || epoch !== templateEpochRef.current) return;
      if (!Array.isArray(data) || !data.every(t => t && typeof t.id === "string" && typeof t.name === "string" &&
        typeof t.status === "string" && typeof t.fileType === "string")) throw new Error("Templates unavailable");
      setTemplates(data.filter((t: TemplateOption) => t.status === "READY"));
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
    loadTemplates();
    setGenerating(false);
    setProgress(null);
    setStatusError(null);
    setMonitoredReportId(null);
    setDetectedSector(null);
    setSectorError(null);
    setDetectingSector(false);
    return () => { cancelStatusPolling(); cancelAuxiliaryRequests(); };
  }, [loadTemplates, deal.id, cancelStatusPolling, cancelAuxiliaryRequests]);

  // ?wizard=1로 들어오면 보고서 마법사를 자동으로 연다.
  // searchParams를 의존성에 넣되 "한 번 처리하면 끝"으로 잠근다 — 안 그러면
  // 사용자가 마법사를 닫아도 URL에 파라미터가 남아 있는 한 리렌더 때마다
  // 다시 열려서 닫을 수 없게 된다.
  const wizardParamConsumed = useRef(false);
  useEffect(() => {
    if (wizardParamConsumed.current) return;
    if (searchParams.get("wizard") === "1") {
      wizardParamConsumed.current = true;
      setWizardOpen(true);
    }
  }, [searchParams]);

  const recommendedAgent = SECTOR_AGENT_MAP[deal.sector] ?? AgentType.GENERAL;
  const agentInfo = AGENT_INFO[recommendedAgent];
  const agentDisplayName = recommendedAgentLabel(deal.sector, recommendedAgent);

  const loadFixture = async () => {
    setLoadingFixture(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/load-fixture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "픽스처 로드 실패");
      }
      router.refresh();
    } catch (error) {
      toast.error("픽스처 로드 실패", {
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setLoadingFixture(false);
    }
  };

  const deleteDocument = async (docId: string, docName: string) => {
    const ok = await confirm({
      title: "문서를 삭제할까요?",
      description: `"${docName}"이(가) 삭제됩니다.`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setDeletingDocId(docId);
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "삭제 실패");
      }
      toast.success("문서를 삭제했습니다");
      router.refresh();
    } catch (error) {
      toast.error("문서 삭제 실패", {
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setDeletingDocId(null);
    }
  };

  const deleteDeal = async () => {
    const ok = await confirm({
      title: `"${deal.companyName}" 딜을 삭제할까요?`,
      description:
        "업로드한 문서·보고서·투자매력도 점수가 모두 함께 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "영구 삭제",
      destructive: true,
    });
    if (!ok) return;
    setDeletingDeal(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "삭제 실패");
      }
      toast.success("딜을 삭제했습니다");
      router.push("/deals");
    } catch (error) {
      toast.error("딜 삭제 실패", {
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요",
      });
      setDeletingDeal(false);
    }
  };

  const pollReportStatus = async (reportId: string, controller: AbortController, epoch: number) => {
    const isCurrent = () => !controller.signal.aborted && epoch === pollEpochRef.current;
    let consecutiveErrors = 0;
    while (isCurrent()) {
      try {
        const response = await fetch(`/api/reports/${reportId}/status`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 401 || response.status === 403) {
          setStatusError(response.status === 401
            ? "로그인이 만료되어 진행 상태를 확인하지 못했습니다. 다시 로그인한 뒤 보고서를 확인하세요."
            : "이 보고서의 진행 상태를 조회할 권한이 없습니다.");
          return;
        }
        if (!response.ok) throw new Error("Status unavailable");
        const { data } = await response.json() as { data?: GenerationProgress };
        if (!isCurrent()) return;
        if (!data || !["generating", "completed", "error"].includes(data.status) ||
            !Number.isFinite(data.completed) || !Number.isFinite(data.total)) throw new Error("Status unavailable");
        consecutiveErrors = 0;
        setProgress(data);
        if (data.status === "completed") { router.refresh(); return; }
        if (data.status === "error") {
          setStatusError("생성이 중단되었거나 확인할 내용이 있습니다. 보고서에서 저장된 내용과 진행 상태를 확인하세요.");
          router.refresh();
          return;
        }
      } catch {
        if (!isCurrent()) return;
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          setStatusError("진행 상태 조회가 중단되었습니다. 생성 결과는 아직 확인하지 못했습니다. 다시 조회하거나 보고서를 열어 확인하세요.");
          return;
        }
      }
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, 3000);
        controller.signal.addEventListener("abort", finish, { once: true });
        if (controller.signal.aborted) finish();
      });
    }
  };

  const retryReportStatus = async () => {
    if (!monitoredReportId || pollControllerRef.current) return;
    const controller = new AbortController();
    const epoch = ++pollEpochRef.current;
    pollControllerRef.current = controller;
    setStatusError(null);
    setGenerating(true);
    try { await pollReportStatus(monitoredReportId, controller, epoch); }
    finally {
      if (!controller.signal.aborted && epoch === pollEpochRef.current) {
        pollControllerRef.current = null;
        setGenerating(false);
        setProgress(null);
      }
    }
  };

  const generateReport = async () => {
    if (pollControllerRef.current) return;
    if (selectedTemplateId !== DEFAULT_TEMPLATE_VALUE && selectedTemplateId &&
        (templatesLoading || templatesError || !templates.some(template => template.id === selectedTemplateId))) {
      setStatusError("선택한 양식을 확인하지 못했습니다. 양식 목록을 다시 조회하거나 기본 양식을 선택하세요.");
      return;
    }
    const controller = new AbortController();
    const epoch = ++pollEpochRef.current;
    pollControllerRef.current = controller;
    setGenerating(true);
    setProgress(null);
    setStatusError(null);
    setMonitoredReportId(null);
    try {
      const response = await fetch(`/api/deals/${deal.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          agentType: recommendedAgent,
          ...(selectedTemplateId && selectedTemplateId !== DEFAULT_TEMPLATE_VALUE
            ? { templateId: selectedTemplateId }
            : {}),
        }),
      });

      if (!response.ok) {
        if (controller.signal.aborted || epoch !== pollEpochRef.current) return;
        setStatusError(response.status === 401
          ? "로그인이 만료되었습니다. 다시 로그인한 뒤 보고서 목록을 확인하세요."
          : response.status === 403 ? "보고서를 생성할 권한이 없습니다."
          : response.status === 429 ? "보고서 생성 한도에 도달했거나 요청이 많습니다. 사용량과 기존 보고서를 확인하세요."
          : "생성 요청을 완료하지 못했습니다. 새로 요청하기 전에 보고서 목록에서 진행 중인 작업을 확인하세요.");
        router.refresh();
        return;
      }

      const { data: created } = await response.json();
      if (controller.signal.aborted || epoch !== pollEpochRef.current) return;
      const reportId: string | undefined = created?.id;
      if (typeof reportId !== "string" || !reportId) {
        setStatusError("생성 요청 결과를 확인하지 못했습니다. 새로 생성하기 전에 딜의 보고서 목록을 확인하세요.");
        router.refresh();
        return;
      }
      setMonitoredReportId(reportId);
      await pollReportStatus(reportId, controller, epoch);
    } catch {
      if (controller.signal.aborted || epoch !== pollEpochRef.current) return;
      setStatusError("생성 요청 결과를 확인하지 못했습니다. 새로 생성하기 전에 딜의 보고서 목록을 확인하세요.");
      router.refresh();
    } finally {
      if (!controller.signal.aborted && epoch === pollEpochRef.current) {
        pollControllerRef.current = null;
        setGenerating(false);
        setProgress(null);
      }
    }
  };

  const detectSector = async () => {
    if (!deal.documents.length || sectorControllerRef.current) return;
    const controller = new AbortController();
    const epoch = ++sectorEpochRef.current;
    sectorControllerRef.current = controller;
    setDetectingSector(true);
    setDetectedSector(null);
    setSectorError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/detect-sector`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("섹터 감지 실패");
      const data = await res.json();
      if (controller.signal.aborted || epoch !== sectorEpochRef.current) return;
      if (!data.data || typeof data.data.sector !== "string" || !Object.values(DealSector).includes(data.data.sector as DealSector) ||
          typeof data.data.reason !== "string") throw new Error("Sector unavailable");
      setDetectedSector(data.data);
    } catch {
      if (!controller.signal.aborted && epoch === sectorEpochRef.current)
        setSectorError("섹터를 자동 감지하지 못했습니다. 기존 섹터로 진행하거나 딜 편집에서 직접 선택하세요.");
    } finally {
      if (!controller.signal.aborted && epoch === sectorEpochRef.current) {
        sectorControllerRef.current = null;
        setDetectingSector(false);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6">
      <ReportWizard
        deal={deal}
        canEdit={canEdit}
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); router.refresh(); }}
      />
      {demoMode && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>생성 서비스 확인 필요</strong> — 실제 AI 연결이 확인되지 않았습니다.
            운영 환경에서는 생성이 제한되며, 개발 환경의 샘플은 실제 투자 분석이 아닙니다.
            서비스 관리자에게 연결 상태를 확인해 주세요.
          </span>
        </div>
      )}

      {/* Deal header — 모바일에서는 제목과 액션 버튼을 세로로 쌓는다.
          가로로 두면 좁은 화면에서 제목 영역이 눌려 글자가 세로로 깨진다. */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline">{SECTOR_LABEL[deal.sector]}</Badge>
            <Badge variant="secondary">{STAGE_LABEL[deal.stage]}</Badge>
            {deal.teamId && (
              <Badge variant="secondary" className="gap-1">
                팀 공유
              </Badge>
            )}
            {!canEdit && (
              <Badge variant="outline" className="text-amber-700 border-amber-300">
                조회 전용 ({userRole === "ANALYST" ? "심사역" : userRole})
              </Badge>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
            {deal.companyName}
          </h1>
          <p className="text-gray-500 break-words">{deal.name}</p>
          {deal.description && (
            <p className="text-sm text-gray-600 mt-2 max-w-2xl">{deal.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center xl:flex-shrink-0">
          <TeamShareToggle
            type="deal"
            resourceId={deal.id}
            teamId={userTeamId}
            shared={Boolean(deal.teamId)}
            isOwner={deal.userId === currentUserId}
            canUseTeam={canUseTeam}
          />
          {canEdit && <EditDealDialog deal={deal} />}
          {deal.userId === currentUserId && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={deleteDeal}
              disabled={deletingDeal}
              title="딜 삭제 (문서·보고서 전부 함께 삭제됨)"
            >
              {deletingDeal ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              삭제
            </Button>
          )}
          {canEdit && deal.documents.length > 0 && (
            <>
              {/* 템플릿 선택 */}
              {templates.length > 0 && (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full sm:w-44 text-sm h-9">
                    <LayoutTemplate className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
                    <SelectValue placeholder="양식 선택 (선택)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TEMPLATE_VALUE}>기본 양식</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={detectSector}
                disabled={detectingsector || generating}
                title="업로드된 문서에서 섹터 자동 감지"
              >
                {detectingsector ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                섹터 감지
              </Button>
              <Button
                onClick={() => setWizardOpen(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <Zap className="w-4 h-4 mr-2" />
                AI 보고서 생성
              </Button>
            </>
          )}
          {!canEdit && (
            <p className="text-xs text-gray-500">
              편집·생성은 파트너·관리자 또는 딜 소유자만 가능합니다.
            </p>
          )}
        </div>
      </div>

      {/* Sector detection result */}
      {templatesLoading && <p role="status" className="text-sm text-muted-foreground">양식 목록을 불러오는 중입니다.</p>}
      {templatesError && <div role="alert" data-testid="detail-template-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p>{templatesError}</p>
        <Button variant="outline" size="sm" onClick={loadTemplates} disabled={templatesLoading}>양식 목록 다시 조회</Button>
      </div>}
      {sectorError && <p role="alert" data-testid="detail-sector-error" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{sectorError}</p>}
      {detectedSector && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>섹터 감지 결과: {detectedSector.sector}</strong>{" "}
            — {detectedSector.reason}
          </span>
        </div>
      )}

      {/* Generation progress bar */}
      {statusError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3"
          role="alert" data-testid="report-status-error">
          <p>{statusError}</p>
          <div className="flex flex-wrap items-center gap-3">
            {monitoredReportId && <>
              <Button variant="outline" size="sm" onClick={retryReportStatus} disabled={generating}>진행 상태 다시 확인</Button>
              <Link className="underline" href={`/reports/${monitoredReportId}`}>보고서 열기</Link>
            </>}
            {!monitoredReportId && <Button variant="outline" size="sm" onClick={() => router.refresh()}>보고서 목록 새로고침</Button>}
          </div>
        </div>
      )}
      {generating && progress && (
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 font-medium">
              AI 보고서 생성 중: <span className="text-primary">{progress.currentSection}</span>
            </span>
            <span className="text-gray-400">
              {progress.completed} / {progress.total}
            </span>
          </div>
          <Progress
            value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}
            className="h-2"
          />
        </div>
      )}

      {/* Investment details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "투자 라운드", value: deal.investRound },
          {
            label: "투자 금액",
            value: deal.investAmount
              ? `${deal.investAmount.toLocaleString()}억원`
              : null,
          },
          {
            label: "Post 밸류에이션",
            value: deal.valuation
              ? `${deal.valuation.toLocaleString()}억원`
              : null,
          },
          {
            label: "추천 에이전트",
            value: agentDisplayName,
          },
        ].map((item) =>
          item.value ? (
            <Card key={item.label}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="font-semibold text-gray-900 mt-0.5">
                  {item.value}
                </p>
              </CardContent>
            </Card>
          ) : null
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* 탭 3개가 좁은 화면 폭을 넘기므로 가로 스크롤을 허용한다 */}
        <TabsList className="w-full overflow-x-auto justify-start">
          <TabsTrigger value="overview">통합 검토</TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            문서 ({deal.documents.length})
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            보고서 ({deal.reports.length})
          </TabsTrigger>
          <TabsTrigger value="agent" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            AI 에이전트
          </TabsTrigger>
          <TabsTrigger value="score" className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            투자 매력도
          </TabsTrigger>
          <TabsTrigger value="dart" className="flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" />
            전자공시
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DealReviewOverview
            key={deal.id}
            dealId={deal.id}
            report={deal.reports.find(report => report.sections.length > 0 && !["PENDING", "GENERATING"].includes(report.status)) ?? null}
            documentCount={deal.documents.length}
            warningCount={deal.documents.filter(document => Boolean(document.metadata?.warning ?? ((document.parsedText?.length ?? 0) < 300))).length}
            meetingEnabled={meetingEnabled}
            generating={generating || deal.reports.some(report => report.status === "GENERATING")}
            onNavigate={setActiveTab}
          />
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">문서 업로드</CardTitle>
              {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadFixture}
                disabled={loadingFixture}
                title="섹터에 맞는 골든 IR 샘플을 문서로 로드"
              >
                {loadingFixture ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                )}
                골든 IR 로드
              </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {canEdit ? (
                <>
              <p className="text-xs text-gray-500">
                연습용: 딜 섹터에 맞는 골든 IR 마크다운을 문서에 추가합니다.
              </p>
              <FileUploader
                key={deal.id}
                dealId={deal.id}
                onUploadComplete={() => {
                  router.refresh();
                }}
              />
                </>
              ) : (
                <p className="text-xs text-amber-700">
                  조회 전용 — 문서 업로드·골든 IR 로드는 편집 권한이 필요합니다.
                </p>
              )}
            </CardContent>
          </Card>

          {deal.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  업로드된 문서 ({deal.documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deal.documents.map((doc) => {
                    const chars = doc.parsedText?.length ?? 0;
                    // metadata.warning은 업로드 시점(신규)에 계산돼 저장되지만,
                    // 그 이전에 업로드된 문서는 저장된 값이 없으므로 실제 글자
                    // 수를 기준으로도 다시 판단해 항상 정확한 상태를 보여준다.
                    const warning =
                      doc.metadata?.warning ??
                      (chars < 300
                        ? `추출된 텍스트가 매우 적습니다 (${chars}자). AI가 내용을 충분히 인식하지 못할 수 있습니다.`
                        : undefined);
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50"
                      >
                        <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {doc.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.size)} ·{" "}
                            {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                            <span
                              className={cn(
                                "ml-2",
                                warning ? "text-amber-600" : "text-green-600"
                              )}
                            >
                              {warning ? "⚠" : "✓"} {chars.toLocaleString()}자 추출
                            </span>
                          </p>
                          {warning && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                              {warning}
                            </p>
                          )}
                        </div>
                        <a href={`/api/documents/${doc.id}/download`} className="text-xs text-primary underline" aria-label={`${doc.name} 원본 다운로드`}>원본 다운로드</a>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 text-gray-400 hover:text-red-600"
                            title="문서 삭제"
                            disabled={deletingDocId === doc.id}
                            onClick={() => deleteDocument(doc.id, doc.name)}
                          >
                            {deletingDocId === doc.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reports tab */}
        <TabsContent value="reports" className="space-y-4">
          {deal.reports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/illustrations/empty-deal-reports.svg"
                  alt=""
                  className="w-56 mx-auto mb-4 opacity-90"
                />
                <p className="text-gray-500">아직 생성된 보고서가 없습니다.</p>
                <p className="text-sm text-gray-400 mt-1">
                  문서를 업로드한 후 AI 보고서를 생성해보세요.
                </p>
                {deal.documents.length > 0 && (
                  <Button
                    className="mt-4 bg-primary hover:bg-primary/90"
                    onClick={generateReport}
                    disabled={generating}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    AI 보고서 생성
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {deal.reports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {report.title}
                          </p>
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded font-medium",
                              report.status === "FINAL" ||
                                report.status === "EXPORTED"
                                ? "bg-green-50 text-green-700"
                                : report.status === "GENERATING"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-gray-50 text-gray-600"
                            )}
                          >
                            {STATUS_LABEL[report.status] ?? report.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                          <span className="mx-1">·</span>
                          {report.sections.length}개 섹션
                        </p>
                      </div>
                      <Link href={`/reports/${report.id}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          보고서 열기
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* AI Agent tab */}
        <TabsContent value="agent">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI 에이전트 정보</CardTitle>
              <p className="text-sm text-gray-500 font-normal">
                이 딜 추천: {agentDisplayName} — {agentInfo.desc}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(AGENT_INFO).map(([type, info]) => (
                <div
                  key={type}
                  className={cn(
                    "p-4 rounded-lg border",
                    type === recommendedAgent
                      ? info.color
                      : "bg-gray-50 border-gray-200 text-gray-500"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Zap
                      className={cn(
                        "w-4 h-4",
                        type === recommendedAgent
                          ? ""
                          : "opacity-40"
                      )}
                    />
                    <span className="font-semibold">{info.name}</span>
                    {type === recommendedAgent && (
                      <Badge className="ml-auto text-xs">추천</Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1 opacity-80">{info.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 투자 매력도 점수 tab */}
        <TabsContent value="score">
          <DealScoreRadar dealId={deal.id} canEdit={canEdit} />
        </TabsContent>

        {/* DART 전자공시 tab */}
        <TabsContent value="dart">
          <DealDartPanel dealId={deal.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

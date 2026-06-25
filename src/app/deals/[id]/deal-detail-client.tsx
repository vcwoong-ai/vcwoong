"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/upload/file-uploader";
import {
  FileText,
  Upload,
  Zap,
  Loader2,
  ExternalLink,
  File,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentType, DealSector, DealStage } from "@prisma/client";

interface DealWithRelations {
  id: string;
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
  }>;
  reports: Array<{
    id: string;
    title: string;
    agentType: AgentType;
    status: string;
    createdAt: string;
    sections: Array<{ id: string; title: string; order: number; status: string }>;
  }>;
}

const SECTOR_AGENT_MAP: Record<DealSector, AgentType> = {
  BIO: AgentType.BIO,
  IT: AgentType.IT,
  FINTECH: AgentType.IT,
  GENERAL: AgentType.GENERAL,
  CONSUMER: AgentType.GENERAL,
  DEEPTECH: AgentType.GENERAL,
  CLIMATE: AgentType.GENERAL,
};

const SECTOR_LABEL: Record<DealSector, string> = {
  BIO: "바이오", IT: "IT", FINTECH: "핀테크", GENERAL: "일반",
  CONSUMER: "소비재", DEEPTECH: "딥테크", CLIMATE: "기후",
};

const STAGE_LABEL: Record<DealStage, string> = {
  SCREENING: "스크리닝", DEEP_DIVE: "딥다이브", IC_PREP: "IC 준비",
  IC_REVIEW: "IC 심의", CLOSED: "투자 완료", REJECTED: "거절",
};

const REPORT_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "대기",    color: "text-gray-400" },
  GENERATING:{ label: "생성 중", color: "text-amber-600" },
  DRAFT:     { label: "초안",    color: "text-blue-600" },
  REVIEW:    { label: "검토 중", color: "text-purple-600" },
  FINAL:     { label: "최종",    color: "text-emerald-600" },
  EXPORTED:  { label: "완료",    color: "text-emerald-600" },
};

export function DealDetailClient({
  deal,
  demoMode = false,
}: {
  deal: DealWithRelations;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"docs" | "reports">("docs");

  const recommendedAgent = SECTOR_AGENT_MAP[deal.sector] ?? AgentType.GENERAL;

  const generateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType: recommendedAgent }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "보고서 생성 실패");
      }
      const { data: created } = await response.json();
      if (created?.id) {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const res = await fetch(`/api/deals/${deal.id}/reports`);
          if (!res.ok) continue;
          const { data: reports } = await res.json();
          const current = reports?.find((rep: { id: string }) => rep.id === created.id);
          if (current && current.status !== "GENERATING") break;
        }
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "보고서 생성 중 오류가 발생했습니다");
    } finally {
      setGenerating(false);
    }
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="max-w-3xl space-y-6">
      {demoMode && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>데모 모드 — <code>.env.local</code>에 API 키 설정 시 실제 AI 생성으로 전환됩니다.</span>
        </div>
      )}

      {/* Deal header */}
      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {SECTOR_LABEL[deal.sector]}
              </span>
              <span className="text-xs font-medium text-gray-500">
                {STAGE_LABEL[deal.stage]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{deal.companyName}</h1>
            {deal.description && (
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{deal.description}</p>
            )}
          </div>
          <Button
            onClick={generateReport}
            disabled={generating || deal.documents.length === 0}
            className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            size="sm"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 mr-1.5" />
            )}
            {generating ? "생성 중..." : "AI 보고서 생성"}
          </Button>
        </div>

        {/* Key metrics strip */}
        {(deal.investRound || deal.investAmount || deal.valuation) && (
          <div className="flex items-center gap-5 mt-4 pt-4 border-t border-gray-50">
            {deal.investRound && (
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">라운드</p>
                <p className="text-sm font-semibold text-gray-800">{deal.investRound}</p>
              </div>
            )}
            {deal.investAmount && (
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">투자금액</p>
                <p className="text-sm font-semibold text-gray-800">{deal.investAmount.toLocaleString()}억원</p>
              </div>
            )}
            {deal.valuation && (
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Post 밸류</p>
                <p className="text-sm font-semibold text-gray-800">{deal.valuation.toLocaleString()}억원</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-gray-100 mb-4">
          {[
            { key: "docs" as const, label: "문서", icon: Upload, count: deal.documents.length },
            { key: "reports" as const, label: "보고서", icon: FileText, count: deal.reports.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                activeTab === tab.key ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === "docs" && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-700 mb-3">파일 업로드</p>
              <FileUploader
                key={uploadKey}
                dealId={deal.id}
                onUploadComplete={() => { setUploadKey((k) => k + 1); router.refresh(); }}
              />
            </div>

            {deal.documents.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {deal.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                      <File className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                          {doc.parsedText && <span className="ml-2 text-emerald-600">텍스트 추출됨</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-3">
            {deal.reports.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl py-12 text-center">
                <FileText className="w-10 h-10 mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-500">생성된 보고서가 없습니다</p>
                {deal.documents.length > 0 && (
                  <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={generateReport} disabled={generating}>
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    AI 보고서 생성
                  </Button>
                )}
              </div>
            ) : (
              deal.reports.map((report) => {
                const st = REPORT_STATUS[report.status] ?? { label: report.status, color: "text-gray-500" };
                return (
                  <div key={report.id} className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{report.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(report.createdAt).toLocaleDateString("ko-KR")} · {report.sections.length}개 섹션
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs font-medium", st.color)}>{st.label}</span>
                      <Link href={`/reports/${report.id}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          열기
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

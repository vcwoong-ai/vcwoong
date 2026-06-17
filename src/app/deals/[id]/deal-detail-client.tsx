"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileUploader } from "@/components/upload/file-uploader";
import {
  FileText,
  Upload,
  Zap,
  Loader2,
  ExternalLink,
  File,
  Calendar,
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
  FINTECH: AgentType.IT,
  GENERAL: AgentType.GENERAL,
  CONSUMER: AgentType.GENERAL,
  DEEPTECH: AgentType.GENERAL,
  CLIMATE: AgentType.GENERAL,
};

const AGENT_INFO = {
  [AgentType.BIO]: {
    name: "Dr. Cell",
    desc: "바이오/헬스케어 특화 — rNPV 모델링 포함",
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  [AgentType.IT]: {
    name: "IT Agent",
    desc: "IT/SaaS 특화 — SaaS 지표 분석 포함",
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  [AgentType.GENERAL]: {
    name: "General Agent",
    desc: "범용 투자 분석 에이전트",
    color: "text-gray-700 bg-gray-50 border-gray-200",
  },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  GENERATING: "생성 중",
  DRAFT: "초안",
  REVIEW: "검토 중",
  FINAL: "최종",
  EXPORTED: "내보내기",
};

export function DealDetailClient({ deal }: { deal: DealWithRelations }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);

  const recommendedAgent = SECTOR_AGENT_MAP[deal.sector] ?? AgentType.GENERAL;
  const agentInfo = AGENT_INFO[recommendedAgent];

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

      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "보고서 생성 중 오류가 발생했습니다"
      );
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6">
      {/* Deal header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{deal.sector}</Badge>
            <Badge variant="secondary">{deal.stage}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{deal.companyName}</h1>
          <p className="text-gray-500">{deal.name}</p>
          {deal.description && (
            <p className="text-sm text-gray-600 mt-2 max-w-2xl">{deal.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {deal.documents.length > 0 && (
            <Button
              onClick={generateReport}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {generating ? "AI 보고서 생성 중..." : "AI 보고서 생성"}
            </Button>
          )}
        </div>
      </div>

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
            value: agentInfo.name,
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
      <Tabs defaultValue="documents">
        <TabsList>
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
        </TabsList>

        {/* Documents tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 업로드</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUploader
                key={uploadKey}
                dealId={deal.id}
                onUploadComplete={() => {
                  setUploadKey((k) => k + 1);
                  router.refresh();
                }}
              />
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
                  {deal.documents.map((doc) => (
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
                          {doc.parsedText && (
                            <span className="ml-2 text-green-600">
                              ✓ 텍스트 추출 완료
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
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
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">아직 생성된 보고서가 없습니다.</p>
                <p className="text-sm text-gray-400 mt-1">
                  문서를 업로드한 후 AI 보고서를 생성해보세요.
                </p>
                {deal.documents.length > 0 && (
                  <Button
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
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
      </Tabs>
    </div>
  );
}

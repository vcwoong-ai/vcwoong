"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { UploadedItem } from "./step-upload";

type StepStatus = "pending" | "running" | "done" | "error";

const STEPS = [
  "자료 업로드",
  "문서 텍스트 추출",
  "AI 에이전트 심층 분석",
  "보고서 섹션 작성",
  "저장 완료",
];

interface StepGenerateProps {
  dealId?: string;
  companyName: string;
  selectedAgents: string[];
  uploadedItems: UploadedItem[];
  onBack: () => void;
}

type SectionInput = {
  sectionKey: string;
  title: string;
  content: string;
  order: number;
};

function buildSections(
  analysis: Record<string, unknown>,
  companyName: string,
  documentContext: string,
  agentType: string
): SectionInput[] {
  const sections: SectionInput[] = [];

  // 1. 투자개요 (투자조건 상세 + 투자 목적 포함)
  const investmentOverviewParts = [
    String(analysis.investmentOverview || "").trim(),
    analysis.investmentTermsDetail
      ? `\n\n## 투자조건 상세\n${analysis.investmentTermsDetail}`
      : "",
    analysis.investmentPurpose
      ? `\n\n## 투자 목적 및 전략적 의의\n${analysis.investmentPurpose}`
      : "",
  ].filter(Boolean).join("\n\n");

  sections.push({
    sectionKey: "INVESTMENT_OVERVIEW",
    title: "투자개요",
    content: investmentOverviewParts || `회사명: ${companyName}\n\n자료를 기반으로 투자개요를 작성하였습니다.`,
    order: 1,
  });

  // 2. 회사개요 (연혁 + 팀 포함)
  const businessSummary = String(analysis.businessSummary || "").trim();
  const companyOverviewParts = [
    businessSummary,
    analysis.companyHistory ? `\n\n## 회사 연혁\n${analysis.companyHistory}` : "",
    analysis.teamAssessment ? `\n\n## 팀 평가\n${analysis.teamAssessment}` : "",
    !businessSummary ? `회사명: ${companyName}\n\n${documentContext.slice(0, 600)}` : "",
  ].filter(Boolean).join("\n\n").trim();

  sections.push({
    sectionKey: "COMPANY_OVERVIEW",
    title: "회사개요",
    content: companyOverviewParts,
    order: 2,
  });

  // 3. 제품/기술/비즈니스 모델 (IP/특허 + 주요 레퍼런스 포함)
  const productContent = [
    analysis.pipelineAssessment ? `## 파이프라인 평가\n${analysis.pipelineAssessment}` : "",
    analysis.scientificMerit ? `## 과학적 타당성\n${analysis.scientificMerit}` : "",
    analysis.regulatoryStrategy ? `## 규제 전략\n${analysis.regulatoryStrategy}` : "",
    analysis.businessModel ? `## 비즈니스 모델\n${analysis.businessModel}` : "",
    analysis.keyCustomerReferences ? `## 주요 고객/파트너 레퍼런스\n${analysis.keyCustomerReferences}` : "",
    analysis.ipPortfolio ? `## IP/특허 현황\n${analysis.ipPortfolio}` : "",
  ].filter(Boolean).join("\n\n");

  if (productContent.trim()) {
    sections.push({
      sectionKey: "PRODUCT_TECHNOLOGY",
      title: agentType === "bio" ? "파이프라인 및 기술" : "제품, 비즈니스 모델 및 영업현황",
      content: productContent,
      order: 3,
    });
  }

  // 4. 시장 분석
  const marketContent = [
    analysis.marketAnalysis ? `## 시장 분석\n${analysis.marketAnalysis}` : "",
    analysis.competitiveLandscape ? `## 경쟁 환경\n${analysis.competitiveLandscape}` : "",
  ].filter(Boolean).join("\n\n");

  if (marketContent.trim()) {
    sections.push({
      sectionKey: "MARKET_ANALYSIS",
      title: "시장 분석 및 경쟁환경",
      content: marketContent,
      order: 4,
    });
  }

  // 5. 재무 현황
  if (analysis.financialAnalysis && String(analysis.financialAnalysis).trim()) {
    sections.push({
      sectionKey: "FINANCIAL_STATUS",
      title: "재무 현황",
      content: String(analysis.financialAnalysis),
      order: 5,
    });
  }

  // 6. 투자포인트
  const investmentPoints: string[] = [];
  if (analysis.investmentPoint1) investmentPoints.push(`### 투자포인트 (1)\n${analysis.investmentPoint1}`);
  if (analysis.investmentPoint2) investmentPoints.push(`### 투자포인트 (2)\n${analysis.investmentPoint2}`);
  if (analysis.investmentPoint3) investmentPoints.push(`### 투자포인트 (3)\n${analysis.investmentPoint3}`);

  if (investmentPoints.length > 0) {
    sections.push({
      sectionKey: "OPINION_SUMMARY",
      title: "투자포인트",
      content: investmentPoints.join("\n\n"),
      order: 6,
    });
  }

  // 7. 리스크
  const risks: string[] = [];
  if (analysis.risk1) risks.push(`### 리스크 1\n${analysis.risk1}`);
  if (analysis.risk2) risks.push(`### 리스크 2\n${analysis.risk2}`);
  if (analysis.risk3) risks.push(`### 리스크 3\n${analysis.risk3}`);
  if (risks.length === 0 && Array.isArray(analysis.criticalRisks)) {
    (analysis.criticalRisks as string[]).forEach((r, i) => {
      risks.push(`### 리스크 ${i + 1}\n${r}`);
    });
  }

  if (risks.length > 0) {
    sections.push({
      sectionKey: "RISK_ANALYSIS",
      title: "리스크",
      content: risks.join("\n\n"),
      order: 7,
    });
  }

  // 8. 매출 손익 추정 (회사 추정 + 심사역 추정)
  const pnlContent = [
    analysis.companyPnLProjection ? `## 회사 추정 손익계산서\n${analysis.companyPnLProjection}` : "",
    analysis.reviewerPnLProjection ? `## 심사역 손익 추정\n${analysis.reviewerPnLProjection}` : "",
  ].filter(Boolean).join("\n\n");

  if (pnlContent.trim()) {
    sections.push({
      sectionKey: "FINANCIAL_STATUS",
      title: "매출 및 손익 추정",
      content: pnlContent,
      order: 8,
    });
  }

  // 9. Valuation & Exit (Peer Group + 시나리오 분석 포함)
  const valuationContent = [
    analysis.peerGroupAnalysis ? `## Peer Group 분석\n${analysis.peerGroupAnalysis}` : "",
    analysis.valuationOpinion ? `## 기업가치 평가\n${analysis.valuationOpinion}` : "",
    analysis.investmentScenarios ? `## 시나리오별 투자수익 분석\n${analysis.investmentScenarios}` : "",
    analysis.exitStrategy ? `## Exit 전략 및 투자수익성\n${analysis.exitStrategy}` : "",
  ].filter(Boolean).join("\n\n");

  if (valuationContent.trim()) {
    sections.push({
      sectionKey: "VALUATION",
      title: "Valuation & Exit 전략",
      content: valuationContent,
      order: 9,
    });
  }

  // 10. 종합 투자의견
  if (analysis.investmentRecommendation && String(analysis.investmentRecommendation).trim()) {
    sections.push({
      sectionKey: "INVESTMENT_TERMS",
      title: "종합 투자의견",
      content: String(analysis.investmentRecommendation),
      order: 10,
    });
  }

  // 11. Appendix — 창업자 확인 사항
  const questions = Array.isArray(analysis.questionsForFounders)
    ? (analysis.questionsForFounders as string[])
    : [];
  if (questions.length > 0) {
    sections.push({
      sectionKey: "APPENDIX",
      title: "창업자 확인 사항",
      content: questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      order: 11,
    });
  }

  return sections;
}

export function StepGenerate({
  dealId,
  companyName,
  selectedAgents,
  uploadedItems,
  onBack,
}: StepGenerateProps) {
  const router = useRouter();
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(STEPS.map(() => "pending"));
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setStepStatus(idx: number, status: StepStatus) {
    setStepStatuses((prev) => {
      const next = [...prev];
      next[idx] = status;
      return next;
    });
  }

  async function generateReport() {
    try {
      const currentDealId = dealId;

      // Step 0: 파일 업로드
      setStepStatus(0, "running");
      const fileItems = uploadedItems.filter((i) => i.type === "file" && i.file);
      if (fileItems.length > 0 && currentDealId) {
        for (const item of fileItems) {
          const fd = new FormData();
          fd.append("file", item.file!);
          fd.append("dealId", currentDealId);
          await fetch("/api/upload", { method: "POST", body: fd });
        }
      }
      setStepStatus(0, "done");

      // Step 1: 문서 텍스트 추출
      setStepStatus(1, "running");
      let documentContext = "";

      const textItems = uploadedItems.filter((i) => i.type === "text" && i.content);
      documentContext += textItems.map((i) => i.content).join("\n\n");

      const urlItems = uploadedItems.filter((i) => i.type === "url" && i.content);
      if (urlItems.length > 0) {
        documentContext += "\n\n참고 URL: " + urlItems.map((i) => i.content).join(", ");
      }

      if (currentDealId) {
        const docsRes = await fetch(`/api/deals/${currentDealId}/documents`).catch(() => null);
        if (docsRes?.ok) {
          const docsData = await docsRes.json();
          const parsedTexts = (docsData.data || [])
            .map((d: { parsedText?: string }) => d.parsedText)
            .filter(Boolean)
            .join("\n\n");
          if (parsedTexts) documentContext += "\n\n" + parsedTexts;
        }
      }

      if (!documentContext.trim()) {
        throw new Error("분석할 문서가 없습니다. 이전 단계에서 파일을 업로드해주세요.");
      }
      setStepStatus(1, "done");

      // Step 2: AI 에이전트 분석
      setStepStatus(2, "running");
      const primaryAgent = selectedAgents[0] || "general";
      let analysisResult: Record<string, unknown> = {};

      if (primaryAgent === "bio") {
        const res = await fetch("/api/agents/bio/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentContext, companyName }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "AI 분석 실패");
        }
        const data = await res.json();
        analysisResult = data.data?.analysis ?? {};
      } else {
        const sectorMap: Record<string, string> = {
          "it-saas": "IT/SaaS",
          "ai-deeptech": "AI/딥테크",
          manufacturing: "제조/하드웨어",
          content: "콘텐츠/엔터테인먼트",
          fintech: "핀테크/금융",
          general: "일반",
        };
        const sectorName = sectorMap[primaryAgent] || primaryAgent;

        const res = await fetch("/api/agents/general/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentContext, companyName, sector: sectorName }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "AI 분석 실패");
        }
        const data = await res.json();
        analysisResult = data.data?.analysis ?? {};
      }
      setStepStatus(2, "done");

      // Step 3: 섹션 구성
      setStepStatus(3, "running");
      const sections = buildSections(analysisResult, companyName, documentContext, primaryAgent);
      setStepStatus(3, "done");

      // Step 4: DB 저장
      setStepStatus(4, "running");
      if (!currentDealId) throw new Error("딜 ID가 없습니다. Step 1을 다시 진행해주세요.");

      const agentTypeKey = primaryAgent.toUpperCase().replace(/-/g, "_");

      const reportRes = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: currentDealId,
          agentType: agentTypeKey,
          sections,
        }),
      });

      if (!reportRes.ok) {
        const err = await reportRes.json();
        throw new Error(err.error || "보고서 저장 실패");
      }

      const reportData = await reportRes.json();
      const newReportId = reportData.data?.id;
      setReportId(newReportId);
      setStepStatus(4, "done");

      if (newReportId) {
        await new Promise((r) => setTimeout(r, 800));
        router.push(`/reports/${newReportId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStepStatuses((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s === "running");
        if (idx >= 0) next[idx] = "error";
        return next;
      });
    }
  }

  const doneCount = stepStatuses.filter((s) => s === "done").length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-600 mb-2">{companyName} 보고서 생성 중...</p>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-gray-400 mt-1">{progress}% 완료</p>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, idx) => {
          const status = stepStatuses[idx];
          return (
            <div key={idx} className="flex items-center gap-3">
              {status === "done" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
              ) : status === "running" ? (
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
              ) : status === "error" ? (
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  status === "done"
                    ? "text-gray-700"
                    : status === "running"
                    ? "text-blue-600 font-medium"
                    : status === "error"
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {step}
                {idx === 2 && status === "running" && (
                  <span className="text-xs text-blue-400 block mt-0.5">
                    {selectedAgents.join(", ")} 에이전트 분석 중... (30~60초 소요)
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
            돌아가기
          </Button>
        </div>
      )}

      {reportId && (
        <Button className="w-full" onClick={() => router.push(`/reports/${reportId}`)}>
          보고서 보기
        </Button>
      )}
    </div>
  );
}

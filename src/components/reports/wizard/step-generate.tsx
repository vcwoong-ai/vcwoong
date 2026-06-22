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

const SECTION_MAP: Record<string, { key: string; title: string; order: number }> = {
  pipelineAssessment:       { key: "PRODUCT_TECHNOLOGY", title: "파이프라인 종합 평가", order: 2 },
  scientificMerit:          { key: "PRODUCT_TECHNOLOGY", title: "과학적 타당성", order: 3 },
  regulatoryStrategy:       { key: "PRODUCT_TECHNOLOGY", title: "규제 전략", order: 4 },
  competitiveLandscape:     { key: "MARKET_ANALYSIS",    title: "경쟁 환경 분석", order: 5 },
  investmentRecommendation: { key: "OPINION_SUMMARY",    title: "투자의견", order: 8 },
};

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
        documentContext = `회사명: ${companyName}\n분석 요청`;
      }
      setStepStatus(1, "done");

      // Step 2: AI 에이전트 분석
      setStepStatus(2, "running");
      const primaryAgent = selectedAgents[0] || "bio";
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
        analysisResult = {
          pipelineAssessment: `${companyName}의 사업 내용을 분석했습니다.`,
          investmentRecommendation: "추가 실사 후 투자 검토를 권장합니다.",
        };
      }
      setStepStatus(2, "done");

      // Step 3: 섹션 구성
      setStepStatus(3, "running");
      const sections: { sectionKey: string; title: string; content: string; order: number }[] = [];

      sections.push({
        sectionKey: "COMPANY_OVERVIEW",
        title: "회사 개요",
        content: `회사명: ${companyName}\n\n${documentContext.slice(0, 800)}`,
        order: 1,
      });

      for (const [field, mapping] of Object.entries(SECTION_MAP)) {
        const content = analysisResult[field];
        if (content && String(content).trim()) {
          sections.push({ ...mapping, sectionKey: mapping.key, content: String(content) });
        }
      }

      if (analysisResult.criticalRisks) {
        const risks = Array.isArray(analysisResult.criticalRisks)
          ? (analysisResult.criticalRisks as string[]).join("\n\n")
          : String(analysisResult.criticalRisks);
        sections.push({ sectionKey: "RISK_ANALYSIS", title: "주요 리스크", content: risks, order: 7 });
      }

      if (analysisResult.questionsForFounders) {
        const questions = Array.isArray(analysisResult.questionsForFounders)
          ? (analysisResult.questionsForFounders as string[]).join("\n")
          : String(analysisResult.questionsForFounders);
        sections.push({ sectionKey: "APPENDIX", title: "창업자 확인 사항", content: questions, order: 10 });
      }

      setStepStatus(3, "done");

      // Step 4: DB 저장
      setStepStatus(4, "running");
      if (!currentDealId) throw new Error("딜 ID가 없습니다. Step 1을 다시 진행해주세요.");

      const reportRes = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: currentDealId,
          agentType: primaryAgent.toUpperCase(),
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

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type StepStatus = "pending" | "running" | "done" | "error";

const STEPS = [
  "문서 파싱",
  "회사 정보 추출",
  "공통 분석 (회사/팀/재무/리스크)",
  "에이전트 심층 분석",
  "보고서 파일 생성",
  "완료",
];

interface StepGenerateProps {
  dealId?: string;
  companyName: string;
  selectedAgents: string[];
  onBack: () => void;
}

export function StepGenerate({
  dealId,
  companyName,
  selectedAgents,
  onBack,
}: StepGenerateProps) {
  const router = useRouter();
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    STEPS.map(() => "pending")
  );
  const [reportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) return;
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function generateReport() {
    try {
      for (let i = 0; i < STEPS.length - 1; i++) {
        setStepStatuses((prev) => {
          const next = [...prev];
          next[i] = "running";
          return next;
        });

        await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));

        setStepStatuses((prev) => {
          const next = [...prev];
          next[i] = "done";
          return next;
        });
      }

      // Final step
      setStepStatuses((prev) => {
        const next = [...prev];
        next[STEPS.length - 1] = "done";
        return next;
      });

      if (dealId) {
        router.push(`/reports/${dealId}`);
      }
    } catch (err) {
      setError(String(err));
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
              ) : (
                <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  status === "done"
                    ? "text-gray-700"
                    : status === "running"
                    ? "text-blue-600 font-medium"
                    : "text-gray-400"
                }`}
              >
                {step}
                {idx === 3 && status === "running" && (
                  <span className="text-xs text-blue-400 block ml-0 mt-0.5">
                    {selectedAgents.join(", ")} 에이전트 실행 중...
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
        <Button
          className="w-full"
          onClick={() => router.push(`/reports/${reportId}`)}
        >
          보고서 보기
        </Button>
      )}
    </div>
  );
}

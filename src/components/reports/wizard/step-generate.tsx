"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type StepStatus = "pending" | "running" | "done" | "error";

interface ProgressStep {
  id: string;
  label: string;
  status: StepStatus;
}

const INITIAL_STEPS: ProgressStep[] = [
  { id: "parse", label: "문서 파싱", status: "pending" },
  { id: "structure", label: "회사 정보 추출", status: "pending" },
  { id: "core", label: "공통 분석 (회사/팀/재무/리스크)", status: "pending" },
  { id: "sector", label: "섹터 전문가 분석", status: "pending" },
  { id: "build", label: "보고서 파일 생성", status: "pending" },
];

const STATUS_ICON: Record<StepStatus, string> = {
  pending: "⏸",
  running: "⏳",
  done: "✅",
  error: "❌",
};

interface StepGenerateProps {
  companyName: string;
  sectors: string[];
  onPrev: () => void;
}

export function StepGenerate({ companyName, sectors, onPrev }: StepGenerateProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [isComplete, setIsComplete] = useState(false);

  const updateStep = (idx: number, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, status } : s))
    );
  };

  useEffect(() => {
    const run = async () => {
      for (let i = 0; i < INITIAL_STEPS.length; i++) {
        setCurrentIdx(i);
        updateStep(i, "running");
        // 데모: 각 단계 1~2초 지연 시뮬레이션 (실제는 SSE 또는 API 호출)
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
        updateStep(i, "done");
      }
      setIsComplete(true);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h3 className="font-semibold text-lg">{companyName} 투자심사보고서 생성 중</h3>
        <p className="text-sm text-gray-500">
          {sectors.join(", ")} 섹터 에이전트가 분석합니다
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
              i === currentIdx && !isComplete ? "bg-blue-50" : "bg-gray-50"
            }`}
          >
            <span className="text-lg w-6 text-center">{STATUS_ICON[step.status]}</span>
            <span
              className={`text-sm ${
                step.status === "done"
                  ? "text-gray-700"
                  : step.status === "running"
                  ? "text-blue-700 font-medium"
                  : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
            {step.status === "running" && (
              <span className="ml-auto text-xs text-blue-500 animate-pulse">처리 중...</span>
            )}
          </div>
        ))}
      </div>

      {isComplete ? (
        <div className="text-center space-y-3">
          <p className="text-green-600 font-medium">✅ 보고서 생성이 완료되었습니다!</p>
          <Button onClick={() => router.push("/reports")} className="w-full">
            보고서 보기
          </Button>
        </div>
      ) : (
        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev} disabled={currentIdx >= 0}>
            이전
          </Button>
        </div>
      )}
    </div>
  );
}

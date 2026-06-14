"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";

interface GenerateReportButtonProps {
  dealId: string;
  variant?: "default" | "white";
}

export function GenerateReportButton({
  dealId,
  variant = "default",
}: GenerateReportButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    toast({
      title: "AI 보고서 생성 중...",
      description: "잠시 기다려주세요. 최대 1분 정도 소요될 수 있습니다.",
    });

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "보고서 생성에 실패했습니다");
      }

      toast({
        title: "보고서가 생성되었습니다",
        description: "투자심사보고서를 확인해보세요.",
        variant: "default",
      });

      router.push(`/deals/${dealId}/report`);
      router.refresh();
    } catch (error) {
      toast({
        title: "오류가 발생했습니다",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === "white") {
    return (
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-70"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            생성 중...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            AI 보고서 생성
          </>
        )}
      </button>
    );
  }

  return (
    <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          생성 중...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          AI 보고서 생성
        </>
      )}
    </Button>
  );
}

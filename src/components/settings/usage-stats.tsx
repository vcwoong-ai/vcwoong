"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface UsageData {
  total: {
    tokens: number;
    calls: number;
    reports: number;
  };
  byAgent: Array<{ agentType: string; tokens: number; calls: number }>;
  quota?: {
    reports: { used: number; limit: number };
    templates: { used: number; limit: number };
    plan: string;
  };
}

const AGENT_LABEL: Record<string, string> = {
  GENERAL: "General",
  BIO: "Dr. Cell",
  IT: "Code",
  DEEPTECH: "Neuron",
  MANUFACTURING: "Maker",
  CONTENT: "Story",
  FINTECH: "Vault",
};

export function UsageStats() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        사용량 불러오는 중...
      </div>
    );
  }

  if (!data) return null;

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "총 토큰", value: formatTokens(data.total.tokens) },
          { label: "AI 호출", value: `${data.total.calls}회` },
          { label: "보고서", value: `${data.total.reports}건` },
        ].map((item) => (
          <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold">{item.value}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        ))}
      </div>

      {data.quota && (
        <div className="p-3 bg-blue-50 rounded-lg text-sm space-y-1">
          <p className="font-medium text-blue-900">
            이번 달 사용 한도 ({data.quota.plan} 플랜)
          </p>
          <p className="text-blue-700 text-xs">
            보고서 {data.quota.reports.used}/{data.quota.reports.limit}건 ·
            양식 {data.quota.templates.used}/{data.quota.templates.limit}건
          </p>
        </div>
      )}

      {data.byAgent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">에이전트별 사용량</p>
          {data.byAgent.map((a) => {
            const pct = data.total.tokens > 0 ? (a.tokens / data.total.tokens) * 100 : 0;
            return (
              <div key={a.agentType}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{AGENT_LABEL[a.agentType] ?? a.agentType}</span>
                  <span className="text-gray-400">{formatTokens(a.tokens)} ({a.calls}회)</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

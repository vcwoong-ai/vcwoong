"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AGENTS = [
  { id: "BIO", icon: "🧬", name: "Dr. Cell", desc: "BIO/헬스케어", color: "border-cyan-400 bg-cyan-50" },
  { id: "IT", icon: "⚡", name: "Code", desc: "IT/SaaS", color: "border-blue-400 bg-blue-50" },
  { id: "DEEPTECH", icon: "🧠", name: "Neuron", desc: "AI/딥테크", color: "border-purple-400 bg-purple-50" },
  { id: "MANUFACTURING", icon: "🔧", name: "Maker", desc: "제조/하드웨어", color: "border-orange-400 bg-orange-50" },
  { id: "CONTENT", icon: "🎬", name: "Story", desc: "콘텐츠/엔터", color: "border-pink-400 bg-pink-50" },
  { id: "FINTECH", icon: "💰", name: "Vault", desc: "핀테크/금융", color: "border-green-400 bg-green-50" },
] as const;

interface StepSectorTemplateProps {
  detectedSector?: string;
  detectedConfidence?: number;
  selectedSectors: string[];
  onSectorsChange: (sectors: string[]) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StepSectorTemplate({
  detectedSector,
  detectedConfidence,
  selectedSectors,
  onSectorsChange,
  onPrev,
  onNext,
}: StepSectorTemplateProps) {
  const toggle = (id: string) => {
    onSectorsChange(
      selectedSectors.includes(id)
        ? selectedSectors.filter((s) => s !== id)
        : [...selectedSectors, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* AI 감지 결과 */}
      {detectedSector && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="text-2xl">🤖</span>
          <div className="flex-1">
            <p className="font-medium text-blue-900">
              AI 분석 결과: <span className="text-blue-600">{detectedSector}</span> 섹터 (
              {Math.round((detectedConfidence ?? 0) * 100)}% 신뢰도)
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSectorsChange([detectedSector])}
            className="text-blue-600 border-blue-300"
          >
            추천 사용
          </Button>
        </div>
      )}

      {/* 에이전트 카드 */}
      <div>
        <p className="text-sm text-gray-500 mb-3">섹터 선택 (복수 선택 가능 — 융합 산업)</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {AGENTS.map((agent) => {
            const selected = selectedSectors.includes(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => toggle(agent.id)}
                className={cn(
                  "relative p-4 rounded-xl border-2 text-left transition-all",
                  selected ? agent.color : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                {detectedSector === agent.id && (
                  <span className="absolute top-2 right-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                    추천
                  </span>
                )}
                <div className="text-2xl mb-1">{agent.icon}</div>
                <div className="font-semibold text-sm">{agent.name}</div>
                <div className="text-xs text-gray-500">{agent.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>이전</Button>
        <Button onClick={onNext} disabled={selectedSectors.length === 0}>
          분석 시작
        </Button>
      </div>
    </div>
  );
}

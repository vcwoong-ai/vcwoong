"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const AGENTS = [
  { id: "bio", emoji: "🧬", name: "Dr. Cell", sector: "BIO/헬스케어", color: "cyan" },
  { id: "it-saas", emoji: "⚡", name: "Code", sector: "IT/SaaS", color: "blue" },
  { id: "ai-deeptech", emoji: "🧠", name: "Neuron", sector: "AI/딥테크", color: "purple" },
  { id: "manufacturing", emoji: "🔧", name: "Maker", sector: "제조/하드웨어", color: "orange" },
  { id: "content", emoji: "🎬", name: "Story", sector: "콘텐츠/엔터", color: "pink" },
  { id: "fintech", emoji: "💰", name: "Vault", sector: "핀테크/금융", color: "green" },
];

interface StepSectorTemplateProps {
  selectedAgents: string[];
  onAgentsChange: (agents: string[]) => void;
  suggestedAgent?: string;
  onBack: () => void;
  onNext: () => void;
}

export function StepSectorTemplate({
  selectedAgents,
  onAgentsChange,
  suggestedAgent,
  onBack,
  onNext,
}: StepSectorTemplateProps) {
  function toggleAgent(id: string) {
    if (selectedAgents.includes(id)) {
      onAgentsChange(selectedAgents.filter((a) => a !== id));
    } else {
      onAgentsChange([...selectedAgents, id]);
    }
  }

  return (
    <div className="space-y-6">
      {suggestedAgent && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800 font-medium">
            AI 자동 감지 결과
          </p>
          <p className="text-sm text-blue-600 mt-1">
            이 회사는{" "}
            <strong>
              {AGENTS.find((a) => a.id === suggestedAgent)?.sector}
            </strong>{" "}
            섹터로 감지되었습니다.
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={() => onAgentsChange([suggestedAgent])}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              추천 사용
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAgentsChange([])}
            >
              직접 선택
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-3 text-gray-700">
          섹터 에이전트 선택 (다중 선택 가능)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AGENTS.map((agent) => {
            const isSelected = selectedAgents.includes(agent.id);
            return (
              <Card
                key={agent.id}
                className={`cursor-pointer transition-all border-2 ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300"
                }`}
                onClick={() => toggleAgent(agent.id)}
              >
                <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                  <span className="text-2xl">{agent.emoji}</span>
                  <p className="font-semibold text-sm">{agent.name}</p>
                  <p className="text-xs text-gray-500">{agent.sector}</p>
                  {suggestedAgent === agent.id && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 mt-1">
                      추천
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          이전
        </Button>
        <Button
          className="flex-1"
          onClick={onNext}
          disabled={selectedAgents.length === 0}
        >
          분석 시작
        </Button>
      </div>
    </div>
  );
}

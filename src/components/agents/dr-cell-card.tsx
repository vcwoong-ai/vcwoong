"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface DrCellCardProps {
  onSelect?: () => void;
  selected?: boolean;
}

export function DrCellCard({ onSelect, selected }: DrCellCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all border-2 ${
        selected ? "border-cyan-500 bg-cyan-50" : "border-gray-200 hover:border-cyan-300"
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🧬</span>
          <div>
            <p className="font-bold text-lg text-cyan-600">Dr. Cell</p>
            <p className="text-sm text-gray-500">임상약리학 박사 출신 AI 심사역</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          바이오/헬스케어 전문 심사역. 임상시험 100건+ 분석 경험을 기반으로
          파이프라인 NPV, FDA 벤치마크, 경쟁 임상 분석을 수행합니다.
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-xs bg-cyan-100 text-cyan-700">
            파이프라인 NPV
          </Badge>
          <Badge variant="secondary" className="text-xs bg-cyan-100 text-cyan-700">
            FDA 벤치마크
          </Badge>
          <Badge variant="secondary" className="text-xs bg-cyan-100 text-cyan-700">
            PubMed 인용
          </Badge>
          <Badge variant="secondary" className="text-xs bg-cyan-100 text-cyan-700">
            ClinicalTrials 연동
          </Badge>
        </div>
        {onSelect && (
          <Button
            size="sm"
            className={`w-full mt-2 ${
              selected
                ? "bg-cyan-600 hover:bg-cyan-700"
                : "bg-cyan-500 hover:bg-cyan-600"
            } text-white`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {selected ? "선택됨" : "이 에이전트로 분석 시작"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

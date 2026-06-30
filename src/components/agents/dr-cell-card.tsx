"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface DrCellCardProps {
  onStartAnalysis?: () => void;
}

export function DrCellCard({ onStartAnalysis }: DrCellCardProps) {
  return (
    <Card className="border-cyan-200 bg-cyan-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🧬</span>
          <div>
            <h3 className="font-bold text-lg text-cyan-900">Dr. Cell</h3>
            <p className="text-sm text-cyan-700">임상약리학 박사 출신 AI 심사역</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 text-xs">
            파이프라인 NPV
          </Badge>
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 text-xs">
            FDA 벤치마크
          </Badge>
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 text-xs">
            PubMed 인용
          </Badge>
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 text-xs">
            ClinicalTrials 연동
          </Badge>
        </div>
        <p className="text-xs text-gray-600">
          임상시험 100건+ 분석 경험 기반으로 파이프라인 rNPV, 규제 전략,
          경쟁 환경을 분석합니다.
        </p>
        {onStartAnalysis && (
          <Button
            onClick={onStartAnalysis}
            size="sm"
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            이 에이전트로 분석 시작
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

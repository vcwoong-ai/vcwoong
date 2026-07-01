"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

interface DealSummary {
  id: string;
  name: string;
  companyName: string;
  sector: string;
  stage: string;
  investAmount: number | null;
  valuation: number | null;
  investRound: string | null;
  createdAt: string;
}

interface LPReportResult {
  executiveSummary: string;
  fundPerformanceMetrics: {
    moic: number;
    tvpi: number;
    dpi: number;
    rvpi: number;
    nav: number;
  };
  portfolioSummary: string;
  quarterlyHighlights: string;
  watchListCommentary: string;
  marketOutlook: string;
  nextQuarterFocus: string;
}

const STAGE_LABEL: Record<string, string> = {
  SCREENING: "스크리닝",
  DEEP_DIVE: "딥다이브",
  IC_PREP: "IC 준비",
  IC_REVIEW: "IC 심의",
  INVESTED: "투자완료",
  PASSED: "거절",
};

function mapDealToPortfolio(deal: DealSummary) {
  const status =
    deal.stage === "PASSED"
      ? "exited"
      : deal.stage === "SCREENING"
        ? "watch"
        : "healthy";

  return {
    name: deal.companyName,
    sector: deal.sector,
    investmentDate: deal.createdAt.slice(0, 10),
    investmentAmountKRW: deal.investAmount ?? 0,
    entryValuation: deal.valuation ?? 0,
    currentValuation: deal.valuation ?? undefined,
    ownershipPercent: 10,
    stage: STAGE_LABEL[deal.stage] ?? deal.stage,
    highlights: [`${deal.name} — ${deal.investRound ?? "라운드 미정"}`],
    risks: ["상세 리스크는 딜 상세 페이지에서 보완 필요"],
    nextMilestones: ["분기 실적 업데이트 필요"],
    status: status as "healthy" | "watch" | "concern" | "exited",
  };
}

export function LPReportClient({ deals }: { deals: DealSummary[] }) {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()} Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const [fundName, setFundName] = useState("DealSync Growth Fund I");
  const [reportingPeriod, setReportingPeriod] = useState(defaultPeriod);
  const [additionalNarrative, setAdditionalNarrative] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<LPReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const investedCapital = deals.reduce((sum, d) => sum + (d.investAmount ?? 0), 0);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/lp-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund: {
            fundName,
            vintageYear: now.getFullYear() - 1,
            totalCommitment: Math.max(investedCapital * 2, 100),
            investedCapital: investedCapital || 50,
            remainingCapital: Math.max(investedCapital, 50),
            managementFeeRate: 2,
            carryRate: 20,
            investmentPeriodEnd: `${now.getFullYear() + 2}-12-31`,
            fundTermEnd: `${now.getFullYear() + 7}-12-31`,
          },
          portfolio: deals.map(mapDealToPortfolio),
          reportingPeriod,
          currency: "KRW",
          additionalNarrative: additionalNarrative || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "LP 리포트 생성 실패");
      }

      setResult(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            분기 LP 보고서 생성
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fundName">펀드명</Label>
              <Input
                id="fundName"
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="period">보고 기간</Label>
              <Input
                id="period"
                value={reportingPeriod}
                onChange={(e) => setReportingPeriod(e.target.value)}
                placeholder="2026 Q2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="narrative">추가 코멘트 (선택)</Label>
            <Textarea
              id="narrative"
              value={additionalNarrative}
              onChange={(e) => setAdditionalNarrative(e.target.value)}
              placeholder="LP에게 전달할 특이사항, 시장 전망 등"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-gray-500">
              포트폴리오 <Badge variant="secondary">{deals.length}개 딜</Badge>
              {investedCapital > 0 && (
                <span className="ml-2">투자 집행 {investedCapital}억원</span>
              )}
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || deals.length === 0}>
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              AI LP 리포트 생성
            </Button>
          </div>

          {deals.length === 0 && (
            <p className="text-sm text-amber-600">
              활성 딜이 없습니다. 딜을 먼저 등록해 주세요.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">펀드 성과 지표</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4 text-center">
                {[
                  { label: "MOIC", value: `${result.fundPerformanceMetrics.moic.toFixed(2)}x` },
                  { label: "TVPI", value: `${result.fundPerformanceMetrics.tvpi.toFixed(2)}x` },
                  { label: "DPI", value: `${result.fundPerformanceMetrics.dpi.toFixed(2)}x` },
                  { label: "RVPI", value: `${result.fundPerformanceMetrics.rvpi.toFixed(2)}x` },
                  { label: "NAV", value: `${result.fundPerformanceMetrics.nav}억` },
                ].map((m) => (
                  <div key={m.label} className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs text-gray-500">{m.label}</div>
                    <div className="text-lg font-semibold">{m.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {[
            { title: "경영진 요약", content: result.executiveSummary },
            { title: "포트폴리오 요약", content: result.portfolioSummary },
            { title: "분기 하이라이트", content: result.quarterlyHighlights },
            { title: "Watch List", content: result.watchListCommentary },
            { title: "시장 전망", content: result.marketOutlook },
            { title: "다음 분기 포커스", content: result.nextQuarterFocus },
          ].map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Markdown content={section.content} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

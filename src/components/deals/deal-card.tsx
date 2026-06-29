"use client";

import Link from "next/link";
import { FileText, Upload, ArrowRight } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DealSector, DealStage, DealStatus } from "@prisma/client";

interface DealCardProps {
  deal: {
    id: string;
    name: string;
    companyName: string;
    sector: DealSector;
    stage: DealStage;
    status: DealStatus;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
    updatedAt: Date | string;
    documents: Array<{ id: string }>;
    reports: Array<{ id: string; status: string }>;
  };
}

const SECTOR_CONFIG: Record<
  DealSector,
  { label: string; color: string; bg: string }
> = {
  BIO:           { label: "바이오",    color: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
  IT:            { label: "IT/SaaS",  color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  DEEPTECH:      { label: "AI/딥테크",color: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200" },
  MANUFACTURING: { label: "제조",     color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  CONTENT:       { label: "콘텐츠",   color: "text-pink-700",    bg: "bg-pink-50 border-pink-200" },
  FINTECH:       { label: "핀테크",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  CONSUMER:      { label: "소비재",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  CLIMATE:       { label: "기후/ESG", color: "text-green-700",   bg: "bg-green-50 border-green-200" },
  GENERAL:       { label: "일반",     color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
};

const STAGE_CONFIG: Record<DealStage, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  SCREENING: { label: "스크리닝", variant: "outline" },
  DEEP_DIVE: { label: "딥다이브", variant: "secondary" },
  IC_PREP: { label: "IC 준비", variant: "default" },
  IC_REVIEW: { label: "IC 심의", variant: "default" },
  CLOSED: { label: "투자 완료", variant: "secondary" },
  REJECTED: { label: "거절", variant: "destructive" },
};

export function DealCard({ deal }: DealCardProps) {
  const sectorCfg = SECTOR_CONFIG[deal.sector];
  const stageCfg = STAGE_CONFIG[deal.stage];
  const hasReports = deal.reports.length > 0;
  const latestReport = deal.reports[0];

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 group">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full border",
                  sectorCfg.bg,
                  sectorCfg.color
                )}
              >
                {sectorCfg.label}
              </span>
              <Badge variant={stageCfg.variant} className="text-xs">
                {stageCfg.label}
              </Badge>
            </div>
            <h3 className="font-semibold text-gray-900 truncate">
              {deal.companyName}
            </h3>
            <p className="text-sm text-gray-500 truncate">{deal.name}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {deal.investRound && (
            <div>
              <p className="text-xs text-gray-400">라운드</p>
              <p className="text-sm font-medium">{deal.investRound}</p>
            </div>
          )}
          {deal.investAmount && (
            <div>
              <p className="text-xs text-gray-400">투자금액</p>
              <p className="text-sm font-medium">
                {deal.investAmount.toLocaleString()}억원
              </p>
            </div>
          )}
          {deal.valuation && (
            <div>
              <p className="text-xs text-gray-400">Post 밸류</p>
              <p className="text-sm font-medium">
                {deal.valuation.toLocaleString()}억원
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Upload className="w-3 h-3" />
            {deal.documents.length}개 문서
          </span>
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {deal.reports.length}개 보고서
          </span>
          {hasReports && latestReport && (
            <span
              className={cn(
                "ml-auto px-1.5 py-0.5 rounded text-xs font-medium",
                latestReport.status === "FINAL" || latestReport.status === "EXPORTED"
                  ? "bg-green-50 text-green-700"
                  : latestReport.status === "GENERATING"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-50 text-gray-600"
              )}
            >
              {latestReport.status === "GENERATING"
                ? "생성 중..."
                : latestReport.status === "FINAL"
                ? "최종 완료"
                : latestReport.status === "EXPORTED"
                ? "내보내기 완료"
                : "초안"}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <div className="flex gap-2 w-full">
          <Link href={`/deals/${deal.id}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full group-hover:border-blue-300"
            >
              상세 보기
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

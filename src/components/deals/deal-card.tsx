"use client";

import Link from "next/link";
import { FileText, Upload, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DealSector, DealStage, DealStatus } from "@prisma/client";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";

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
    teamId?: string | null;
    documents: Array<{ id: string }>;
    reports: Array<{ id: string; status: string }>;
  };
  /** 제공되면 삭제 버튼이 뜬다 — 소유자에게만 넘겨줄 것 (API도 소유자만 허용) */
  onDelete?: () => void;
  deleting?: boolean;
}

const SECTOR_CONFIG: Record<DealSector, { color: string; bg: string }> = {
  BIO:           { color: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
  IT:            { color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  DEEPTECH:      { color: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200" },
  MANUFACTURING: { color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  CONTENT:       { color: "text-pink-700",    bg: "bg-pink-50 border-pink-200" },
  FINTECH:       { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  CONSUMER:      { color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  CLIMATE:       { color: "text-green-700",   bg: "bg-green-50 border-green-200" },
  GENERAL:       { color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
};

const STAGE_VARIANT: Record<DealStage, "default" | "secondary" | "destructive" | "outline"> = {
  SCREENING: "outline",
  DEEP_DIVE: "secondary",
  IC_PREP: "default",
  IC_REVIEW: "default",
  CLOSED: "secondary",
  REJECTED: "destructive",
};

export function DealCard({ deal, onDelete, deleting }: DealCardProps) {
  const sectorCfg = SECTOR_CONFIG[deal.sector];
  const stageVariant = STAGE_VARIANT[deal.stage];
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
                {SECTOR_LABEL[deal.sector]}
              </span>
              <Badge variant={stageVariant} className="text-xs">
                {STAGE_LABEL[deal.stage]}
              </Badge>
              {deal.teamId && (
                <Badge variant="secondary" className="text-xs">
                  팀 공유
                </Badge>
              )}
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
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleting}
              title="딜 삭제"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

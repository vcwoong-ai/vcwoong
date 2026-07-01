"use client";

import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { DealSector, DealStage } from "@prisma/client";

interface DealCardProps {
  deal: {
    id: string;
    name: string;
    companyName: string;
    sector: DealSector;
    stage: DealStage;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
    updatedAt: Date | string;
    documents: Array<{ id: string }>;
    reports: Array<{ id: string; status: string }>;
  };
}

const SECTOR_CONFIG: Record<DealSector, { label: string; color: string }> = {
  BIO:      { label: "바이오",   color: "bg-purple-50 text-purple-700 border-purple-200" },
  IT:       { label: "IT",       color: "bg-blue-50 text-blue-700 border-blue-200" },
  FINTECH:  { label: "핀테크",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  GENERAL:  { label: "일반",     color: "bg-gray-50 text-gray-600 border-gray-200" },
  CONSUMER: { label: "소비재",   color: "bg-orange-50 text-orange-700 border-orange-200" },
  DEEPTECH: { label: "딥테크",   color: "bg-red-50 text-red-700 border-red-200" },
  CLIMATE:  { label: "기후",     color: "bg-green-50 text-green-700 border-green-200" },
};

const STAGE_CONFIG: Record<DealStage, { label: string; color: string }> = {
  SCREENING: { label: "스크리닝",  color: "text-gray-500" },
  DEEP_DIVE: { label: "딥다이브",  color: "text-blue-600" },
  IC_PREP:   { label: "IC 준비",   color: "text-amber-600" },
  IC_REVIEW: { label: "IC 심의",   color: "text-orange-600" },
  CLOSED:    { label: "투자 완료", color: "text-emerald-600" },
  REJECTED:  { label: "거절",      color: "text-red-500" },
};

const REPORT_STATUS_COLOR: Record<string, string> = {
  FINAL:     "bg-emerald-50 text-emerald-700",
  EXPORTED:  "bg-emerald-50 text-emerald-700",
  GENERATING:"bg-amber-50 text-amber-700",
  DRAFT:     "bg-blue-50 text-blue-700",
};

const REPORT_STATUS_LABEL: Record<string, string> = {
  PENDING:   "대기",
  GENERATING:"생성 중",
  DRAFT:     "초안",
  REVIEW:    "검토 중",
  FINAL:     "최종",
  EXPORTED:  "완료",
};

export function DealCard({ deal }: DealCardProps) {
  const sector = SECTOR_CONFIG[deal.sector];
  const stage = STAGE_CONFIG[deal.stage];
  const latestReport = deal.reports[0];

  const keyValue = deal.valuation
    ? `Post ${deal.valuation.toLocaleString()}억`
    : deal.investAmount
    ? `${deal.investAmount.toLocaleString()}억원`
    : null;

  return (
    <Link href={`/deals/${deal.id}`} className="block group">
      <div className="bg-white border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", sector.color)}>
            {sector.label}
          </span>
          {latestReport && (
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", REPORT_STATUS_COLOR[latestReport.status] ?? "bg-gray-50 text-gray-500")}>
              {REPORT_STATUS_LABEL[latestReport.status] ?? latestReport.status}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-gray-900 mb-0.5 truncate">{deal.companyName}</h3>
        <p className="text-xs text-gray-400 truncate mb-3">{deal.name}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Upload className="w-3 h-3" />
              {deal.documents.length}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {deal.reports.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {keyValue && (
              <span className="text-xs font-medium text-gray-700">{keyValue}</span>
            )}
            <span className={cn("text-xs font-medium", stage.color)}>{stage.label}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

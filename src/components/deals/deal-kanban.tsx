"use client";

import { useState } from "react";
import Link from "next/link";
import { DealStage, DealSector } from "@prisma/client";
import { FileText, Upload, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface DealForKanban {
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
}

const STAGE_COLUMNS: Array<{ key: DealStage; label: string; color: string; bg: string }> = [
  { key: DealStage.SCREENING,  label: "스크리닝",  color: "text-gray-600",   bg: "bg-gray-50 border-gray-200" },
  { key: DealStage.DEEP_DIVE,  label: "딥다이브",  color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  { key: DealStage.IC_PREP,    label: "IC 준비",   color: "text-amber-600",  bg: "bg-amber-50 border-amber-200" },
  { key: DealStage.IC_REVIEW,  label: "IC 심의",   color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { key: DealStage.CLOSED,     label: "투자 완료", color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  { key: DealStage.REJECTED,   label: "거절",      color: "text-red-500",    bg: "bg-red-50 border-red-200" },
];

const SECTOR_COLOR: Record<DealSector, string> = {
  BIO:           "bg-purple-100 text-purple-700",
  IT:            "bg-blue-100 text-blue-700",
  DEEPTECH:      "bg-cyan-100 text-cyan-700",
  MANUFACTURING: "bg-orange-100 text-orange-700",
  CONTENT:       "bg-pink-100 text-pink-700",
  FINTECH:       "bg-emerald-100 text-emerald-700",
  CONSUMER:      "bg-amber-100 text-amber-700",
  CLIMATE:       "bg-green-100 text-green-700",
  GENERAL:       "bg-gray-100 text-gray-700",
};

const SECTOR_LABEL: Record<DealSector, string> = {
  BIO: "바이오", IT: "IT/SaaS", DEEPTECH: "AI/딥테크",
  MANUFACTURING: "제조", CONTENT: "콘텐츠", FINTECH: "핀테크",
  CONSUMER: "소비재", CLIMATE: "기후", GENERAL: "일반",
};

interface DealKanbanProps {
  deals: DealForKanban[];
  onStageChange: (dealId: string, newStage: DealStage) => Promise<void>;
}

function DealMiniCard({ deal, onDragStart }: {
  deal: DealForKanban;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const latestReport = deal.reports[0];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow group"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", SECTOR_COLOR[deal.sector])}>
              {SECTOR_LABEL[deal.sector]}
            </span>
            {latestReport && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                latestReport.status === "FINAL" || latestReport.status === "EXPORTED"
                  ? "bg-green-50 text-green-600"
                  : latestReport.status === "GENERATING"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-gray-50 text-gray-500"
              )}>
                {latestReport.status === "FINAL" ? "최종" : latestReport.status === "GENERATING" ? "생성중" : "초안"}
              </span>
            )}
          </div>
          <Link href={`/deals/${deal.id}`} className="block hover:text-blue-600 transition-colors">
            <p className="font-semibold text-gray-900 text-sm truncate">{deal.companyName}</p>
            <p className="text-xs text-gray-500 truncate">{deal.name}</p>
          </Link>
          {(deal.investRound || deal.investAmount) && (
            <p className="text-xs text-gray-400 mt-1.5">
              {deal.investRound && <span>{deal.investRound}</span>}
              {deal.investAmount && <span className="ml-1">{deal.investAmount.toLocaleString()}억원</span>}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-0.5">
              <Upload className="w-3 h-3" />{deal.documents.length}
            </span>
            <span className="flex items-center gap-0.5">
              <FileText className="w-3 h-3" />{deal.reports.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DealKanban({ deals, onStageChange }: DealKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);
  const [localDeals, setLocalDeals] = useState(deals);

  const dealsByStage = STAGE_COLUMNS.reduce((acc, col) => {
    acc[col.key] = localDeals.filter((d) => d.stage === col.key);
    return acc;
  }, {} as Record<DealStage, DealForKanban[]>);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggingId(dealId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stage: DealStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDrop = async (e: React.DragEvent, newStage: DealStage) => {
    e.preventDefault();
    if (!draggingId) return;

    const deal = localDeals.find((d) => d.id === draggingId);
    if (!deal || deal.stage === newStage) {
      setDraggingId(null);
      setDragOverStage(null);
      return;
    }

    // 낙관적 업데이트
    setLocalDeals((prev) =>
      prev.map((d) => d.id === draggingId ? { ...d, stage: newStage } : d)
    );
    setDraggingId(null);
    setDragOverStage(null);

    // API 호출
    try {
      await onStageChange(draggingId, newStage);
    } catch {
      // 실패 시 롤백
      setLocalDeals((prev) =>
        prev.map((d) => d.id === draggingId ? { ...d, stage: deal.stage } : d)
      );
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
      {STAGE_COLUMNS.map((col) => {
        const colDeals = dealsByStage[col.key] ?? [];
        const isOver = dragOverStage === col.key;

        return (
          <div
            key={col.key}
            className="flex-shrink-0 w-64"
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* 컬럼 헤더 */}
            <div className={cn(
              "rounded-t-xl border-x border-t px-3 py-2.5 flex items-center justify-between",
              col.bg
            )}>
              <span className={cn("text-sm font-semibold", col.color)}>{col.label}</span>
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", col.bg, col.color)}>
                {colDeals.length}
              </span>
            </div>

            {/* 드롭 영역 */}
            <div
              className={cn(
                "border-x border-b rounded-b-xl min-h-[540px] p-2 space-y-2 transition-colors",
                isOver ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"
              )}
            >
              {colDeals.map((deal) => (
                <DealMiniCard
                  key={deal.id}
                  deal={deal}
                  onDragStart={(e) => handleDragStart(e, deal.id)}
                />
              ))}
              {colDeals.length === 0 && (
                <div className={cn(
                  "rounded-lg border-2 border-dashed p-6 text-center",
                  isOver ? "border-blue-300 bg-blue-50" : "border-gray-200"
                )}>
                  <p className="text-xs text-gray-400">딜을 여기에 드래그</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

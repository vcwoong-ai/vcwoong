"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DealStage, DealSector } from "@prisma/client";
import { FileText, Upload, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";

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
  teamId?: string | null;
  userId?: string;
  documents: Array<{ id: string }>;
  reports: Array<{ id: string; status: string }>;
}

const STAGE_COLUMNS: Array<{ key: DealStage; color: string; bg: string }> = [
  { key: DealStage.SCREENING,  color: "text-gray-600",   bg: "bg-gray-50 border-gray-200" },
  { key: DealStage.DEEP_DIVE,  color: "text-primary",   bg: "bg-blue-50 border-blue-200" },
  { key: DealStage.IC_PREP,    color: "text-amber-600",  bg: "bg-amber-50 border-amber-200" },
  { key: DealStage.IC_REVIEW,  color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { key: DealStage.CLOSED,     color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  { key: DealStage.REJECTED,   color: "text-red-500",    bg: "bg-red-50 border-red-200" },
];

const SECTOR_COLOR: Record<DealSector, string> = {
  BIO:           "bg-purple-100 text-purple-700",
  IT:            "bg-blue-100 text-primary",
  DEEPTECH:      "bg-cyan-100 text-cyan-700",
  MANUFACTURING: "bg-orange-100 text-orange-700",
  CONTENT:       "bg-pink-100 text-pink-700",
  FINTECH:       "bg-emerald-100 text-emerald-700",
  CONSUMER:      "bg-amber-100 text-amber-700",
  CLIMATE:       "bg-green-100 text-green-700",
  GENERAL:       "bg-gray-100 text-gray-700",
};

interface DealKanbanProps {
  deals: DealForKanban[];
  onStageChange: (dealId: string, newStage: DealStage) => Promise<void>;
  /** 딜별 편집 가능 여부 — false면 드래그 비활성 */
  canEditDeal?: (deal: DealForKanban) => boolean;
}

function DealMiniCard({ deal, onDragStart, canDrag, saving, onStageChange }: {
  deal: DealForKanban;
  onDragStart: (e: React.DragEvent) => void;
  canDrag: boolean;
  saving: boolean;
  onStageChange: (stage: DealStage) => void;
}) {
  const latestReport = deal.reports[0];
  return (
    <div
      draggable={canDrag && !saving}
      onDragStart={canDrag && !saving ? onDragStart : undefined}
      className={cn(
        "bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow group",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      )}
    >
      <div className="flex items-start gap-1.5">
        {canDrag && (
          <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", SECTOR_COLOR[deal.sector])}>
              {SECTOR_LABEL[deal.sector]}
            </span>
            {deal.teamId && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                팀
              </span>
            )}
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
          <Link href={`/deals/${deal.id}`} className="block hover:text-primary transition-colors">
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
          {canDrag && <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1" htmlFor={`stage-${deal.id}`}>검토 단계</label>
            <select id={`stage-${deal.id}`} aria-label={`${deal.companyName} 검토 단계`}
              className="w-full min-h-10 rounded border border-gray-200 bg-white px-2 text-sm"
              value={deal.stage} disabled={saving}
              onPointerDown={event => event.stopPropagation()}
              onDragStart={event => event.preventDefault()}
              onChange={event => onStageChange(event.target.value as DealStage)}>
              {STAGE_COLUMNS.map(column => <option key={column.key} value={column.key}>{STAGE_LABEL[column.key]}</option>)}
            </select>
          </div>}
        </div>
      </div>
    </div>
  );
}

export function DealKanban({ deals, onStageChange, canEditDeal }: DealKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);
  const [localDeals, setLocalDeals] = useState(deals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const lifecycle = useRef({ active: true, version: 0 });
  useEffect(() => {
    const current = lifecycle.current;
    current.active = true;
    current.version++;
    setLocalDeals(deals);
    return () => { current.active = false; current.version++; };
  }, [deals]);

  const dealsByStage = STAGE_COLUMNS.reduce((acc, col) => {
    acc[col.key] = localDeals.filter((d) => d.stage === col.key);
    return acc;
  }, {} as Record<DealStage, DealForKanban[]>);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    if (pending.current) { e.preventDefault(); return; }
    setDraggingId(dealId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stage: DealStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const changeStage = async (dealId: string, newStage: DealStage) => {
    const deal = localDeals.find(d => d.id === dealId);
    if (pending.current || !deal || deal.stage === newStage || !STAGE_COLUMNS.some(column => column.key === newStage)
      || (canEditDeal && !canEditDeal(deal))) return;
    pending.current = true;
    const version = lifecycle.current.version;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onStageChange(dealId, newStage);
      if (lifecycle.current.active) {
        if (version === lifecycle.current.version) setLocalDeals(previous => previous.map(item => item.id === dealId ? { ...item, stage: newStage } : item));
        setNotice("검토 단계를 저장했습니다.");
      }
    } catch {
      if (lifecycle.current.active) setError("단계 변경 결과를 확인하지 못했습니다. 목록을 새로고침해 저장된 단계를 확인한 뒤 다시 시도해주세요.");
    } finally {
      pending.current = false;
      if (lifecycle.current.active) setSaving(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, newStage: DealStage) => {
    e.preventDefault();
    const dealId = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (dealId) await changeStage(dealId, newStage);
  };

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p role="status" className="text-sm text-gray-500">{saving ? "검토 단계 저장 중..." : notice ?? "각 카드의 검토 단계 선택으로도 이동할 수 있습니다."}</p>
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
              <span className={cn("text-sm font-semibold", col.color)}>{STAGE_LABEL[col.key]}</span>
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
                  canDrag={!canEditDeal || canEditDeal(deal)}
                  saving={saving}
                  onStageChange={stage => void changeStage(deal.id, stage)}
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
    </div>
  );
}

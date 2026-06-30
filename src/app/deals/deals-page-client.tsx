"use client";

import { useState } from "react";
import { DealCard } from "@/components/deals/deal-card";
import { DealKanban } from "@/components/deals/deal-kanban";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, Kanban } from "lucide-react";
import { DealStage, DealSector } from "@prisma/client";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  name: string;
  companyName: string;
  sector: DealSector;
  stage: DealStage;
  status: "ACTIVE" | "ARCHIVED" | "ON_HOLD";
  investRound: string | null;
  investAmount: number | null;
  valuation: number | null;
  updatedAt: string;
  documents: Array<{ id: string }>;
  reports: Array<{ id: string; status: string }>;
}

export function DealsPageClient({ deals: initialDeals }: { deals: Deal[] }) {
  const [view, setView] = useState<"grid" | "kanban">("grid");
  const [search, setSearch] = useState("");

  const filtered = initialDeals.filter(
    (d) =>
      d.companyName.toLowerCase().includes(search.toLowerCase()) ||
      d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
  };

  return (
    <div className="space-y-6">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="딜 또는 기업명 검색..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 전환 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn("rounded-none h-9 px-3", view === "grid" && "bg-gray-100")}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("rounded-none h-9 px-3", view === "kanban" && "bg-gray-100")}
              onClick={() => setView("kanban")}
            >
              <Kanban className="w-4 h-4" />
            </Button>
          </div>
          <CreateDealDialog />
        </div>
      </div>

      {/* 빈 상태 */}
      {initialDeals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg font-medium text-gray-600">등록된 딜이 없습니다</p>
          <p className="text-sm mt-1">
            새 딜을 등록하여 투자심의 보고서를 자동으로 생성해보세요.
          </p>
        </div>
      ) : view === "grid" ? (
        /* 카드 그리드 뷰 */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-8">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      ) : (
        /* Kanban 뷰 */
        <div>
          <p className="text-xs text-gray-400 mb-4">
            💡 카드를 드래그해서 단계를 변경할 수 있습니다
          </p>
          <DealKanban deals={filtered} onStageChange={handleStageChange} />
        </div>
      )}
    </div>
  );
}

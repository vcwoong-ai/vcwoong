"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DealCard } from "@/components/deals/deal-card";
import { DealKanban } from "@/components/deals/deal-kanban";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, Kanban, Gauge, Trash2, X } from "lucide-react";
import { DealStage, DealSector } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

function canEditDealLocal(opts: {
  ownerUserId: string;
  resourceTeamId: string | null;
  currentUserId: string;
  currentTeamId: string | null;
  role: string;
}): boolean {
  if (opts.ownerUserId === opts.currentUserId) return true;
  if (
    opts.resourceTeamId &&
    opts.currentTeamId &&
    opts.resourceTeamId === opts.currentTeamId &&
    (opts.role === "ADMIN" || opts.role === "PARTNER")
  ) {
    return true;
  }
  return false;
}

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
  userId: string;
  teamId: string | null;
  documents: Array<{ id: string }>;
  reports: Array<{ id: string; status: string }>;
}

export function DealsPageClient({
  deals: initialDeals,
  currentUserId,
  currentTeamId,
  role,
}: {
  deals: Deal[];
  currentUserId: string;
  currentTeamId: string | null;
  role: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "kanban">("grid");
  const [search, setSearch] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 테스트로 만든 딜이 여러 개 쌓였을 때 하나씩 누르지 않고 골라서 한 번에
  // 지우기 위한 모드. "비교" 체크박스와 별개 — 동시에 켜두면 카드 위에
  // 체크박스가 두 줄로 겹쳐 헷갈리므로, 선택 삭제 모드에서는 비교 체크박스
  // 대신 삭제 체크박스만 보여준다.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const handleDeleteDeal = async (dealId: string, companyName: string) => {
    const ok = await confirm({
      title: `"${companyName}" 딜을 삭제할까요?`,
      description:
        "업로드한 문서·보고서가 모두 함께 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "영구 삭제",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(dealId);
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "삭제 실패");
      }
      toast.success("딜을 삭제했습니다");
      router.refresh();
    } catch (e) {
      toast.error("딜 삭제 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 5
        ? prev // 레이더에 5개 넘게 겹치면 못 읽으므로 상한
        : [...prev, id]
    );
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    const targets = initialDeals.filter((d) => selectedIds.includes(d.id));
    const ok = await confirm({
      title: `딜 ${targets.length}건을 삭제할까요?`,
      description:
        `${targets.map((d) => d.companyName).join(", ")}\n` +
        "업로드한 문서·보고서가 모두 함께 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "영구 삭제",
      destructive: true,
    });
    if (!ok) return;

    setBulkDeleting(true);
    const results = await Promise.allSettled(
      selectedIds.map((id) =>
        fetch(`/api/deals/${id}`, { method: "DELETE" }).then((res) => {
          if (!res.ok) throw new Error(id);
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;

    if (failed === 0) {
      toast.success(`${succeeded}건 삭제 완료`);
    } else if (succeeded === 0) {
      toast.error("삭제 실패", { description: "권한이 없거나 이미 삭제된 딜일 수 있습니다" });
    } else {
      toast.toast(`${succeeded}건 삭제, ${failed}건 실패`, {
        description: "권한이 없는 딜은 건너뛰었습니다",
      });
    }

    setBulkDeleting(false);
    exitSelectMode();
    router.refresh();
  };

  const filtered = initialDeals.filter(
    (d) =>
      d.companyName.toLowerCase().includes(search.toLowerCase()) ||
      d.name.toLowerCase().includes(search.toLowerCase())
  );

  const canEditDeal = (deal: { userId?: string; teamId?: string | null }) =>
    canEditDealLocal({
      ownerUserId: deal.userId ?? "",
      resourceTeamId: deal.teamId ?? null,
      currentUserId,
      currentTeamId,
      role,
    });

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    if (!res.ok) throw new Error("단계 변경 실패");
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
          {view === "grid" &&
            (selectMode ? (
              <Button variant="outline" size="sm" onClick={exitSelectMode}>
                <X className="w-4 h-4 mr-1.5" />
                선택 취소
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                <Trash2 className="w-4 h-4 mr-1.5" />
                선택 삭제
              </Button>
            ))}
          <CreateDealDialog />
        </div>
      </div>

      {/* 빈 상태 */}
      {initialDeals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/empty-deals.svg"
            alt=""
            className="w-56 mx-auto mb-6 opacity-90"
          />
          <p className="text-lg font-medium text-gray-600">등록된 딜이 없습니다</p>
          <p className="text-sm mt-1">
            새 딜을 등록하여 투자심의 보고서를 자동으로 생성해보세요.
          </p>
        </div>
      ) : view === "grid" ? (
        /* 카드 그리드 뷰 */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((deal) => {
            const isOwner = deal.userId === currentUserId;
            return (
              <div key={deal.id} className="relative">
                {selectMode ? (
                  isOwner && (
                    <label
                      className={cn(
                        "absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
                        "backdrop-blur border cursor-pointer transition-colors",
                        selectedIds.includes(deal.id)
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white/90 text-gray-500 border-gray-200 hover:border-red-300"
                      )}
                      title="선택 삭제에 추가"
                    >
                      <input
                        type="checkbox"
                        className="accent-white"
                        checked={selectedIds.includes(deal.id)}
                        onChange={() => toggleSelected(deal.id)}
                      />
                      선택
                    </label>
                  )
                ) : (
                  <label
                    className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-full px-2 py-1 text-xs text-gray-500 border border-gray-200 cursor-pointer hover:border-blue-300"
                    title="투자 매력도 비교에 추가"
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={compareIds.includes(deal.id)}
                      onChange={() => toggleCompare(deal.id)}
                    />
                    비교
                  </label>
                )}
                <DealCard
                  deal={deal}
                  onDelete={
                    isOwner && !selectMode
                      ? () => handleDeleteDeal(deal.id, deal.companyName)
                      : undefined
                  }
                  deleting={deletingId === deal.id}
                />
              </div>
            );
          })}
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
            {role === "ANALYST"
              ? "공유 딜은 조회만 가능합니다. 본인 소유 딜은 드래그로 단계를 변경할 수 있습니다."
              : "카드를 드래그해서 단계를 변경할 수 있습니다"}
          </p>
          <DealKanban
            deals={filtered}
            onStageChange={handleStageChange}
            canEditDeal={canEditDeal}
          />
        </div>
      )}

      {/* 일괄 삭제 바 */}
      {selectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-gray-900 text-white rounded-full px-4 py-2.5 shadow-lg">
          <span className="text-sm">{selectedIds.length}개 선택됨</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={bulkDeleting}
            onClick={handleBulkDelete}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {bulkDeleting ? "삭제 중..." : "선택 삭제"}
          </Button>
          <button
            className="text-xs text-gray-400 hover:text-white"
            onClick={exitSelectMode}
            disabled={bulkDeleting}
          >
            취소
          </button>
        </div>
      )}

      {/* 비교 선택 바 — 2개 이상 골라야 레이더 오버레이가 의미 있다 */}
      {!selectMode && compareIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-gray-900 text-white rounded-full px-4 py-2.5 shadow-lg">
          <span className="text-sm">{compareIds.length}개 선택됨</span>
          <Button
            size="sm"
            className="h-7 bg-blue-600 hover:bg-blue-500"
            disabled={compareIds.length < 2}
            onClick={() => router.push(`/deals/compare?ids=${compareIds.join(",")}`)}
          >
            <Gauge className="w-3.5 h-3.5 mr-1" />
            투자 매력도 비교
          </Button>
          <button
            className="text-xs text-gray-400 hover:text-white"
            onClick={() => setCompareIds([])}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PeDealQueue, type PeQueueSort } from "@/components/ma-deals/ma-deal-queue";
import { CreateMaDealDialog } from "@/components/ma-deals/create-ma-deal-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaDealType, MaDealStatus } from "@prisma/client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import type { MaDealListReadinessSummary } from "@/lib/pe/ma-deal-list-readiness";

interface MaDeal {
  id: string;
  name: string;
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
  updatedAt: string;
  userId: string;
  teamId: string | null;
}

export function MaDealsPageClient({
  deals: initialDeals,
  readiness: initialReadiness,
  total,
  pageSize,
  currentUserId,
}: {
  deals: MaDeal[];
  readiness: Record<string, MaDealListReadinessSummary>;
  total: number;
  pageSize: number;
  currentUserId: string;
  currentTeamId: string | null;
  role: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<PeQueueSort>("urgency");
  const [loadedDeals, setLoadedDeals] = useState<MaDeal[]>(initialDeals);
  const [readiness, setReadiness] = useState<Record<string, MaDealListReadinessSummary>>(initialReadiness);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const handleArchive = async (dealId: string, companyName: string) => {
    const ok = await confirm({
      title: `"${companyName}" 딜을 보관할까요?`,
      description: "보관된 딜은 목록에서 숨겨지며 나중에 상세 화면에서 다시 활성화할 수 있습니다.",
      confirmLabel: "보관",
    });
    if (!ok) return;
    setArchivingId(dealId);
    try {
      const res = await fetch(`/api/ma-deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "보관 실패");
      }
      toast.success("딜을 보관했습니다");
      router.refresh();
    } catch (e) {
      toast.error("딜 보관 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setArchivingId(null);
    }
  };

  const hasMore = loadedDeals.length < total;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = Math.floor(loadedDeals.length / pageSize) + 1;
      const res = await fetch(`/api/ma-deals?page=${nextPage}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error(`목록을 더 불러오지 못했습니다 (${res.status})`);
      const json = (await res.json()) as { data?: MaDeal[]; readiness?: Record<string, MaDealListReadinessSummary> };
      const next = json.data ?? [];
      setLoadedDeals((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        return [...prev, ...next.filter((d) => !seen.has(d.id))];
      });
      setReadiness((prev) => ({ ...prev, ...(json.readiness ?? {}) }));
    } catch (error) {
      setLoadMoreError(
        error instanceof Error ? error.message : "목록을 더 불러오지 못했습니다"
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = loadedDeals.filter(
    (d) =>
      d.status === "ACTIVE" &&
      (d.companyName.toLowerCase().includes(search.toLowerCase()) ||
        d.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="딜 또는 기업명 검색..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CreateMaDealDialog />
      </div>

      {loadedDeals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium text-foreground">등록된 PE/M&A 딜이 없습니다</p>
          <p className="text-sm mt-1">
            새 딜을 등록하고 재무 정규화·QoE 조정·DART 연동을 시작해보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              준비 상태는 재무·QoE·LBO·실사 데이터에서 계산된 값입니다.
              {sort === "urgency" ? " 차단된 딜을 먼저 보여줍니다." : " 최근 수정한 딜부터 보여줍니다."}
            </p>
            <div className="flex rounded-lg border border-border bg-card overflow-hidden text-xs" role="group" aria-label="정렬">
              {([
                ["urgency", "검토 필요 순"],
                ["recent", "최근 수정 순"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  aria-pressed={sort === key}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors",
                    sort === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <PeDealQueue
            deals={filtered}
            readiness={readiness}
            sort={sort}
            currentUserId={currentUserId}
            onArchive={handleArchive}
            archivingId={archivingId}
          />
        </div>
      )}

      {loadedDeals.length > 0 && hasMore && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            전체 {total}개 중 {loadedDeals.length}개 표시 중
          </p>
          {loadMoreError && <p className="text-xs text-red-500">{loadMoreError}</p>}
          <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "불러오는 중..." : `더 보기 (${total - loadedDeals.length}개 남음)`}
          </Button>
        </div>
      )}
    </div>
  );
}

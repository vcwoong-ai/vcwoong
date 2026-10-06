"use client";

import { FirstDealGuide } from "@/components/onboarding/first-deal-guide";

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
import styles from "@/components/ma-deals/pe-investment-desk.module.css";

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
  const activeDeals = loadedDeals.filter((deal) => deal.status === "ACTIVE");
  const loadedSummary = {
    blocked: activeDeals.filter((deal) => (readiness[deal.id]?.blockerCount ?? 0) > 0).length,
    ready: activeDeals.filter((deal) => readiness[deal.id]?.overall === "READY").length,
    unavailable: activeDeals.filter((deal) => !readiness[deal.id]).length,
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.masthead} aria-labelledby="pe-desk-title">
        <div className={styles.mastheadIntro}>
          <p className={styles.eyebrow}>PRIVATE EQUITY · DEAL DESK</p>
          <h1 id="pe-desk-title">PE/M&A 검토 데스크</h1>
          <p className={styles.brief}>딜별 자료 준비 상태와 차단 요인을 확인하고, 다음 검토를 이어가세요.</p>
        </div>
        <div className={styles.createAction}><CreateMaDealDialog /></div>
      </section>

      <section className={styles.summary} aria-label="불러온 활성 딜 요약">
        <div className={styles.summaryScope}>불러온 활성 딜 {activeDeals.length}건 기준 <span>· 전체 목록의 집계가 아닙니다</span></div>
        <dl className={styles.stats}>
          <div><dt>활성 딜</dt><dd>{activeDeals.length}<span>건</span></dd></div>
          <div><dt>차단 요인 있는 딜</dt><dd>{loadedSummary.blocked}<span>건</span></dd></div>
          <div><dt>자료 준비됨</dt><dd>{loadedSummary.ready}<span>건</span></dd></div>
          <div><dt>상태 미수신</dt><dd>{loadedSummary.unavailable}<span>건</span></dd></div>
        </dl>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.searchGroup}>
          <label htmlFor="pe-deal-search" className={styles.controlLabel}>딜 찾기</label>
          <div className="relative min-w-0">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="pe-deal-search"
            placeholder="딜 또는 기업명 검색..."
            className={cn("pl-9", styles.searchInput)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-describedby="pe-search-scope"
          />
          </div>
          <p id="pe-search-scope" className={styles.searchScope}>현재 불러온 활성 딜에서 검색합니다.</p>
        </div>
        <div className={styles.sortGroup}>
          <span className={styles.controlLabel}>검토 순서</span>
          <div className={styles.sortControls} role="group" aria-label="정렬">
            {([
              ["urgency", "검토 필요 순"],
              ["recent", "최근 수정 순"],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className={cn(styles.sortButton, sort === key && styles.sortSelected)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {loadedDeals.length === 0 ? (
        <FirstDealGuide track="pe" action={
          <CreateMaDealDialog trigger={<Button>첫 PE/M&A 딜 만들기</Button>} />
        } />
      ) : (
        <div className={styles.queueSection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.sectionEyebrow}>REVIEW QUEUE</p><h2>검토 대기열 <span>{filtered.length}</span></h2></div>
            <p>{sort === "urgency" ? "차단된 딜을 먼저 보여줍니다." : "최근 수정한 딜부터 보여줍니다."}</p>
          </div>
          <p className={styles.readinessNote}>준비 상태는 재무·QoE·LBO·실사 자료에서 계산되며, 투자 승인 여부를 뜻하지 않습니다.</p>
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
        <div className={styles.pagination}>
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

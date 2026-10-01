"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileQuestion } from "lucide-react";
import { QueueCell, QueueHeader, QueueHeaderCell, QueueRow, QueueTable } from "@/components/ui/queue-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EvidenceStateBadge } from "./evidence-state";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";
import { IC_RECOMMENDATION_LABEL, INVESTMENT_SIGNAL_LABEL, type InvestmentSignal } from "@/lib/ic-review";
import { NO_REPORT_NEXT_ACTION, queueUrgencyScore, type DealQueueSummary } from "@/lib/vc-deal-queue";
import { DEALS_PAGE_SIZE } from "@/lib/list-paging";
import type { DealSector, DealStage } from "@prisma/client";

export interface QueueDeal {
  id: string;
  name: string;
  companyName: string;
  sector: DealSector;
  stage: DealStage;
  investRound: string | null;
  investAmount: number | null;
  valuation: number | null;
  updatedAt: string;
  reports: Array<{ id: string; status: string }>;
}

const SIGNAL_TEXT_CLASS: Record<InvestmentSignal, string> = {
  STRONG: "text-state-positive",
  PROMISING: "text-state-info",
  CAUTION: "text-state-caution",
  HIGH_RISK: "text-state-critical",
};

type SummaryState = { status: "loading" } | { status: "error" } | { status: "ready"; summary: DealQueueSummary | null };

/**
 * 배치 요약을 가져온다. 이미 받은 딜은 다시 요청하지 않고, 요청은 목록 한 페이지(최대 24개)씩 나눈다.
 * 요청 대상은 화면에 이미 로드된 딜 id뿐이며, 서버가 다시 권한을 검사한다.
 */
function useDealSummaries(dealIds: string[]): Record<string, SummaryState> {
  const [states, setStates] = useState<Record<string, SummaryState>>({});
  const key = dealIds.join(",");

  useEffect(() => {
    const missing = dealIds.filter((id) => !states[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    setStates((prev) => {
      const next = { ...prev };
      for (const id of missing) next[id] = { status: "loading" };
      return next;
    });
    for (let i = 0; i < missing.length; i += DEALS_PAGE_SIZE) {
      const chunk = missing.slice(i, i + DEALS_PAGE_SIZE);
      fetch(`/api/deals/decision-summaries?ids=${encodeURIComponent(chunk.join(","))}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((json: { data: Record<string, DealQueueSummary> }) => {
          if (cancelled) return;
          setStates((prev) => {
            const next = { ...prev };
            for (const id of chunk) next[id] = { status: "ready", summary: json.data[id] ?? null };
            return next;
          });
        })
        .catch(() => {
          if (cancelled) return;
          setStates((prev) => {
            const next = { ...prev };
            for (const id of chunk) next[id] = { status: "error" };
            return next;
          });
        });
    }
    return () => {
      cancelled = true;
    };
    // states를 의존성에 넣으면 응답마다 다시 도는 루프가 된다 — 새 id만 보려고 key로 제어한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return states;
}

function formatEok(value: number | null): string | null {
  if (value == null) return null;
  return `${value.toLocaleString("ko-KR")}억원`;
}

export type QueueSort = "urgency" | "recent";

export function VcDealQueue({ deals, sort }: { deals: QueueDeal[]; sort: QueueSort }) {
  const states = useDealSummaries(deals.map((d) => d.id));

  const rows = useMemo(() => {
    const list = [...deals];
    if (sort === "urgency") {
      const scoreOf = (id: string) => {
        const s = states[id];
        return s?.status === "ready" ? queueUrgencyScore(s.summary ?? undefined) : -1;
      };
      // 안정 정렬: 같은 긴급도는 최근 수정순 유지
      list.sort((a, b) => scoreOf(b.id) - scoreOf(a.id) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    } else {
      list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }
    return list;
  }, [deals, sort, states]);

  if (rows.length === 0) {
    return <p className="rounded-lg border border-border bg-card py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>;
  }

  return (
    <QueueTable
      label="VC 딜 검토 대기열"
      columns="minmax(0,2fr) minmax(0,1.5fr) minmax(0,1.7fr) minmax(0,2.2fr) 5.5rem"
      data-testid="vc-deal-queue"
    >
      <QueueHeader>
        <QueueHeaderCell>딜</QueueHeaderCell>
        <QueueHeaderCell>투자 판단</QueueHeaderCell>
        <QueueHeaderCell>확인이 필요한 것</QueueHeaderCell>
        <QueueHeaderCell>다음 행동</QueueHeaderCell>
        <QueueHeaderCell className="text-right">수정일</QueueHeaderCell>
      </QueueHeader>
      {rows.map((deal) => {
        const state = states[deal.id];
        const latestReportId = deal.reports[0]?.id ?? null;
        const updated = new Date(deal.updatedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
        return (
          <QueueRow key={deal.id} data-testid="vc-deal-row" data-deal-id={deal.id}>
            <QueueCell>
              <Link
                href={`/deals/${deal.id}`}
                className="text-[15px] font-semibold text-foreground underline-offset-2 hover:underline focus-visible:underline"
              >
                {deal.companyName}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[SECTOR_LABEL[deal.sector] ?? deal.sector, STAGE_LABEL[deal.stage] ?? deal.stage, deal.investRound]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {(deal.investAmount != null || deal.valuation != null) && (
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {[
                    deal.investAmount != null ? `투자 ${formatEok(deal.investAmount)}` : null,
                    deal.valuation != null ? `Post ${formatEok(deal.valuation)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground lg:hidden">수정 {updated}</p>
            </QueueCell>

            <JudgmentCell state={state} hasReport={latestReportId != null} />
            <AttentionCell state={state} hasReport={latestReportId != null} />

            <QueueCell mobileLabel="다음 행동">
              <NextActionCell dealId={deal.id} state={state} latestReportId={latestReportId} />
            </QueueCell>

            <QueueCell className="hidden text-xs tabular-nums text-muted-foreground lg:block lg:text-right">
              {updated}
            </QueueCell>
          </QueueRow>
        );
      })}
    </QueueTable>
  );
}

function JudgmentCell({ state, hasReport }: { state: SummaryState | undefined; hasReport: boolean }) {
  if (!hasReport) {
    return (
      <QueueCell mobileLabel="투자 판단">
        <StatusBadge tone="neutral" icon={FileQuestion}>보고서 없음</StatusBadge>
      </QueueCell>
    );
  }
  if (!state || state.status === "loading") {
    return (
      <QueueCell mobileLabel="투자 판단" aria-busy="true">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-2 h-4 w-32" />
      </QueueCell>
    );
  }
  if (state.status === "error" || !state.summary) {
    return (
      <QueueCell mobileLabel="투자 판단">
        <p className="text-xs text-muted-foreground">판단 요약을 불러오지 못했습니다</p>
      </QueueCell>
    );
  }
  const s = state.summary;
  return (
    <QueueCell mobileLabel="투자 판단" data-testid="vc-row-judgment">
      <p className={`text-sm font-semibold ${SIGNAL_TEXT_CLASS[s.signal]}`}>{INVESTMENT_SIGNAL_LABEL[s.signal].label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{IC_RECOMMENDATION_LABEL[s.recommendation]}</p>
      <div className="mt-1.5">
        <EvidenceStateBadge state={s.confidence} />
      </div>
    </QueueCell>
  );
}

function AttentionCell({ state, hasReport }: { state: SummaryState | undefined; hasReport: boolean }) {
  if (!hasReport || !state || state.status !== "ready" || !state.summary) {
    return <QueueCell mobileLabel="확인이 필요한 것" className="text-xs text-muted-foreground">—</QueueCell>;
  }
  const s = state.summary;
  const chips: React.ReactNode[] = [];
  if (s.contradictionCount > 0) {
    chips.push(
      <StatusBadge key="c" tone="critical">
        수치 상충 {s.contradictionCount}건
      </StatusBadge>
    );
  }
  if (s.p0Count > 0) {
    chips.push(
      <StatusBadge key="p" tone="caution">
        필수 정보 공백 {s.p0Count}건
      </StatusBadge>
    );
  }
  if (s.breakerCount > 0) {
    chips.push(
      <StatusBadge key="b" tone="neutral">
        논지 훼손 요인 {s.breakerCount}건
      </StatusBadge>
    );
  }
  const otherGaps = s.missingCount - s.p0Count;
  if (otherGaps > 0) {
    chips.push(
      <StatusBadge key="g" tone="neutral">
        추가 확인 정보 {otherGaps}건
      </StatusBadge>
    );
  }
  return (
    <QueueCell mobileLabel="확인이 필요한 것" data-testid="vc-row-attention">
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">{chips}</div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {s.recommendation === "READY_FOR_IC_REVIEW"
            ? "결정을 막는 항목 없음"
            : "개별 항목은 없으나 근거 자체가 부족합니다"}
        </p>
      )}
    </QueueCell>
  );
}

function NextActionCell({
  dealId,
  state,
  latestReportId,
}: {
  dealId: string;
  state: SummaryState | undefined;
  latestReportId: string | null;
}) {
  if (!latestReportId) {
    return (
      <>
        <p className="text-sm text-foreground">{NO_REPORT_NEXT_ACTION.label}</p>
        <Link href={`/deals/${dealId}`} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          딜 열기 <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </>
    );
  }
  if (!state || state.status !== "ready" || !state.summary) {
    return (
      <Link href={`/reports/${latestReportId}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
        보고서 열기 <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <>
      <p className="text-sm text-foreground" data-testid="vc-row-next-action">
        {state.summary.nextAction.label}
      </p>
      <Link
        href={`/reports/${state.summary.reportId}`}
        className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
      >
        결정 화면 열기 <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </>
  );
}

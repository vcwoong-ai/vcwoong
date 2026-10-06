"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Archive, ArrowUpRight, Loader2 } from "lucide-react";
import { QueueCell, QueueHeader, QueueHeaderCell, QueueRow, QueueTable } from "@/components/ui/queue-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ReadinessBadge } from "./readiness-badge";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL, PE_DECISION_DOMAIN_LABEL, PE_IC_REVIEW_SIGNOFF_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import { presentBlockerLabel } from "@/lib/pe/blocker-display";
import { peQueueUrgencyScore, pickPeNextAction } from "@/lib/pe/ma-deal-queue";
import type { MaDealListReadinessSummary } from "@/lib/pe/ma-deal-list-readiness";
import { READINESS_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import styles from "./pe-investment-desk.module.css";

export interface PeQueueDeal {
  id: string;
  name: string;
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
  teamId: string | null;
  userId: string;
  updatedAt: string;
}

export type PeQueueSort = "urgency" | "recent";

const DOMAIN_ROWS = [
  { key: "financial", label: PE_DECISION_DOMAIN_LABEL.FINANCIAL },
  { key: "qoe", label: PE_DECISION_DOMAIN_LABEL.QOE },
  { key: "lbo", label: PE_DECISION_DOMAIN_LABEL.LBO },
  { key: "dd", label: PE_DECISION_DOMAIN_LABEL.DD },
] as const;
const DOMAIN_STATE_SHORT: Record<MaDealListReadinessSummary["overall"], string> = {
  READY: "준비됨", PARTIAL: "부분 준비", MISSING: "정보 없음", NOT_STARTED: "시작 전", BLOCKED: "차단됨",
};

/**
 * PE 딜 검토 대기열. 준비 상태(READY/PARTIAL/…)는 PE 전용 canonical 계산(buildPEDecisionReadiness)의
 * 배치 결과를 그대로 보여주며 VC 점수와 섞지 않는다. "다음 행동"은 요약의 도메인 상태에서
 * 이동할 탭을 고르는 표시 규칙(ma-deal-queue.ts)이다.
 */
export function PeDealQueue({
  deals,
  readiness,
  sort,
  currentUserId,
  onArchive,
  archivingId,
}: {
  deals: PeQueueDeal[];
  readiness: Record<string, MaDealListReadinessSummary>;
  sort: PeQueueSort;
  currentUserId: string;
  onArchive: (dealId: string, companyName: string) => void;
  archivingId: string | null;
}) {
  const rows = useMemo(() => {
    const list = [...deals];
    if (sort === "urgency") {
      list.sort(
        (a, b) =>
          peQueueUrgencyScore(readiness[b.id]) - peQueueUrgencyScore(readiness[a.id]) ||
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      );
    } else {
      list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }
    return list;
  }, [deals, readiness, sort]);

  if (rows.length === 0) {
    return <p className={styles.empty}>현재 불러온 딜에서 검색 결과가 없습니다.</p>;
  }

  return (
    <QueueTable
      label="PE/M&A 딜 검토 대기열"
      columns="minmax(0,2fr) minmax(0,2.2fr) minmax(0,2fr) minmax(0,1.3fr) 2.5rem"
      data-testid="pe-deal-queue"
      className={styles.queue}
    >
      <QueueHeader>
        <QueueHeaderCell>딜</QueueHeaderCell>
        <QueueHeaderCell>준비 상태</QueueHeaderCell>
        <QueueHeaderCell>다음 행동</QueueHeaderCell>
        <QueueHeaderCell>내 검토 · 수정일</QueueHeaderCell>
        <QueueHeaderCell />
      </QueueHeader>
      {rows.map((deal) => {
        const r = readiness[deal.id];
        const next = r ? pickPeNextAction(r) : null;
        const updated = new Date(deal.updatedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
        return (
          <QueueRow key={deal.id} data-testid="pe-deal-row" data-deal-id={deal.id} className={styles.row}>
            <QueueCell className={styles.identityCell}>
              <Link
                href={`/ma-deals/${deal.id}`}
                className={styles.companyLink}
              >
                {deal.companyName}
              </Link>
              <p className={styles.dealName}>{deal.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {MA_DEAL_TYPE_LABEL[deal.dealType]}
                {deal.teamId ? " · 팀 공유" : ""}
              </p>
            </QueueCell>

            <QueueCell mobileLabel="준비 상태" className={styles.readinessCell}>
              {r ? (
                <div>
                  <ReadinessBadge state={r.overall} />
                  <dl className={styles.domainList}>
                    {DOMAIN_ROWS.map((row) => (
                      <div key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>
                          <span className={styles.domainState} data-readiness={r[row.key]} title={READINESS_STATE_LABEL[r[row.key]]} aria-label={`${row.label}: ${READINESS_STATE_LABEL[r[row.key]]}`}>{DOMAIN_STATE_SHORT[r[row.key]]}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <div aria-busy="true">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-2 h-8 w-full" />
                </div>
              )}
            </QueueCell>

            <QueueCell mobileLabel="다음 행동" className={styles.actionCell}>
              {r && next ? (
                <>
                  {r.blockerCount > 0 && (
                    <StatusBadge tone="critical" className="mb-1.5">
                      차단 요인 {r.blockerCount}건
                    </StatusBadge>
                  )}
                  <p className="text-sm text-foreground" data-testid="pe-row-next-action">
                    {presentBlockerLabel(next.label)}
                  </p>
                  <Link
                    href={`/ma-deals/${deal.id}?tab=${next.tab}`}
                    className={styles.actionLink}
                  >
                    해당 탭 열기 <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">불러오는 중…</p>
              )}
            </QueueCell>

            <QueueCell mobileLabel="내 검토 · 수정일" className={styles.reviewCell}>
              <p>
                내 검토:{" "}
                <span className="font-medium text-foreground">
                  {r?.myReviewStatus ? PE_IC_REVIEW_SIGNOFF_STATUS_LABEL[r.myReviewStatus] : "미검토"}
                </span>
              </p>
              <p className="mt-0.5 tabular-nums">수정 {updated}</p>
            </QueueCell>

            <QueueCell className={styles.archiveCell}>
              {deal.userId === currentUserId && deal.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => onArchive(deal.id, deal.companyName)}
                  disabled={archivingId === deal.id}
                  aria-label={`${deal.companyName} 딜 보관`}
                  title="딜 보관"
                >
                  {archivingId === deal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                </Button>
              )}
            </QueueCell>
          </QueueRow>
        );
      })}
    </QueueTable>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, History, ListTree } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PE_IC_AUDIT_EVENT_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEICReviewSnapshotView, PEICAuditEventView } from "@/lib/pe/pe-ic-review-audit-types";

function truncateFingerprint(fp: string): string {
  return `${fp.slice(0, 10)}…${fp.slice(-6)}`;
}

function FingerprintBadge({ fingerprint }: { fingerprint: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fingerprint);
      toast.success("fingerprint를 복사했습니다");
    } catch {
      // 클립보드 API가 막힌 환경(권한/비보안 컨텍스트)일 수 있다 — 조용히 무시한다,
      // 복사는 부가 기능일 뿐 핵심 기능이 아니다.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={fingerprint}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-400 hover:text-gray-600 max-w-full"
    >
      <span className="truncate">{truncateFingerprint(fingerprint)}</span>
      <Copy className="w-3 h-3 shrink-0" />
    </button>
  );
}

/**
 * PE IC 검토 이력 / Audit Trail(PR #111) — "위원회 자료" 탭에 추가하는
 * 컴팩트 영역. 새 대시보드를 만들지 않는다(§29) — 기존 Card/Badge 컴포넌트만
 * 쓴다.
 *
 * 이 컴포넌트는 아무것도 계산하지 않는다 — `/reviews`(불변 스냅샷 이력)와
 * `/audit-events`(append-only 타임라인, 경계 있는 페이지네이션)를 그대로
 * 보여줄 뿐이다. 스냅샷은 REVIEWED로 전환하는 매 순간의 불변 기록이라
 * 재검토해도 예전 항목이 사라지거나 값이 바뀌지 않는다(§6/§40) — 리스트에
 * "현재/과거" 배지만 새로 계산해 붙일 뿐 서버가 이미 계산해 내려준
 * `isCurrent`/`changedCategoriesFromPrevious`를 그대로 옮긴다.
 */
export function MaDealReviewHistory({ maDealId, refreshKey }: { maDealId: string; refreshKey?: number }) {
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<PEICReviewSnapshotView[]>([]);
  const [events, setEvents] = useState<PEICAuditEventView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [snapshotsRes, eventsRes] = await Promise.all([
        fetch(`/api/ma-deals/${maDealId}/reviews`),
        fetch(`/api/ma-deals/${maDealId}/audit-events`),
      ]);
      if (snapshotsRes.ok) {
        const json = await snapshotsRes.json();
        setSnapshots(json.data ?? []);
      }
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        const data: PEICAuditEventView[] = json.data ?? [];
        setEvents(data);
        setHasMoreEvents(data.length >= 30);
      }
      setLoaded(true);
    } catch {
      toast.error("검토 이력을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEvents = async () => {
    const oldest = events[events.length - 1];
    if (!oldest) return;
    setLoadingMoreEvents(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/audit-events?before=${encodeURIComponent(oldest.createdAt)}`);
      if (res.ok) {
        const json = await res.json();
        const more: PEICAuditEventView[] = json.data ?? [];
        setEvents((prev) => [...prev, ...more]);
        setHasMoreEvents(more.length >= 30);
      }
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  useEffect(() => {
    if (!loaded && !loading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loading]);

  // 형제 컴포넌트(리뷰 서명 패널)가 서명/코멘트를 성공적으로 제출할 때마다
  // 부모가 refreshKey를 증가시켜 준다 — 최초 마운트 때는 위 effect가 이미
  // 불러오므로 건너뛴다(중복 조회 방지).
  const isFirstRefreshKey = useRef(true);
  useEffect(() => {
    if (isFirstRefreshKey.current) {
      isFirstRefreshKey.current = false;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <History className="w-4 h-4" />
          검토 이력 / Audit Trail
        </CardTitle>
        <p className="text-xs text-gray-500">
          검토 완료(REVIEWED)로 전환한 매 순간의 기록입니다 — 재검토해도 이전 기록은 바뀌지 않습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && !loaded ? (
          <p className="text-center text-gray-400 py-6 text-sm">불러오는 중...</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">검토 스냅샷</p>
              {snapshots.length === 0 ? (
                <p className="text-sm text-gray-400">아직 완료된 검토가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {snapshots.map((s) => (
                    <li key={s.id} className="border rounded-md px-3 py-2 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="font-medium text-sm">Review #{s.version}</span>
                          <Badge variant={s.isCurrent ? "default" : "outline"} className="text-[10px]">
                            {s.isCurrent ? "현재 기준과 일치" : "과거 기록"}
                          </Badge>
                          {s.openP0Count > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              P0 {s.openP0Count}건 미해결
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(s.reviewedAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        검토자: {s.reviewerName ?? s.reviewerEmail ?? "알 수 없음"} · 미해결 항목 {s.openQuestionCount}건
                      </p>
                      {s.changedCategoriesFromPrevious.length > 0 && (
                        <p className="text-xs text-amber-700">
                          이전 검토 대비 변경: {s.changedCategoriesFromPrevious.join(", ")}
                        </p>
                      )}
                      {s.comment && <p className="text-xs text-gray-500 break-words">{s.comment}</p>}
                      <div className="min-w-0">
                        <FingerprintBadge fingerprint={s.fingerprint} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <ListTree className="w-3.5 h-3.5" />
                감사 타임라인
              </p>
              {events.length === 0 ? (
                <p className="text-sm text-gray-400">아직 기록된 활동이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 text-xs border-b last:border-0 pb-1.5 last:pb-0 min-w-0">
                      <div className="min-w-0">
                        <span className="font-medium">{PE_IC_AUDIT_EVENT_TYPE_LABEL[e.eventType]}</span>
                        <span className="text-gray-400"> · {e.actorName ?? e.actorEmail ?? "알 수 없음"}</span>
                        {e.reviewSnapshotVersion !== null && (
                          <span className="text-gray-400"> · Review #{e.reviewSnapshotVersion}</span>
                        )}
                      </div>
                      <span className="text-gray-400 shrink-0">{new Date(e.createdAt).toLocaleString("ko-KR")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hasMoreEvents && (
                <Button variant="outline" size="sm" className="w-full" disabled={loadingMoreEvents} onClick={loadMoreEvents}>
                  {loadingMoreEvents ? "불러오는 중..." : "이전 활동 더 보기"}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

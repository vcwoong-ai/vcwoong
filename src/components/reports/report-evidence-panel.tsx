"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { DistributionPanel } from "@/components/ui/distribution-panel";
import { Button } from "@/components/ui/button";
import { SECTION_META } from "@/types";
import {
  Loader2,
  FileSearch,
  AlertTriangle,
  FileText,
  PenLine,
  Sparkles,
} from "lucide-react";

type EvidenceStatus = "document" | "deal" | "unverified";
type ClaimConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNSUPPORTED";

interface NumericClaim {
  sectionKey: string;
  raw: string;
  label: string;
  value: string;
  unit: string;
  status: EvidenceStatus;
  claimType: "numeric" | "qualitative";
  confidence: ClaimConfidence;
  source?: { documentName: string; location?: string; snippet: string };
}

interface EvidenceData {
  claims: NumericClaim[];
  totals: { checked: number; document: number; deal: number; unverified: number };
  coverage: number;
  confidenceTotals: Record<ClaimConfidence, number>;
  documentCount: number;
}

const STATUS_META: Record<
  EvidenceStatus,
  { label: string; className: string; icon: typeof FileText }
> = {
  document: {
    label: "문서 확인",
    className: "bg-state-positive-bg text-state-positive border-state-positive-line",
    icon: FileText,
  },
  deal: {
    label: "딜 입력",
    className: "bg-state-info-bg text-state-info border-state-info-line",
    icon: PenLine,
  },
  unverified: {
    label: "근거 없음",
    className: "bg-state-critical-bg text-state-critical border-state-critical-line",
    icon: AlertTriangle,
  },
};

/** hallucination 위험도 관점 — report-quality.ts의 summarizeEvidenceForQuality와 짝 */
const CONFIDENCE_META: Record<ClaimConfidence, { label: string; className: string }> = {
  HIGH: { label: "확신 높음", className: "bg-state-positive-bg text-state-positive border-state-positive-line" },
  MEDIUM: { label: "검토 필요", className: "bg-state-caution-bg text-state-caution border-state-caution-line" },
  LOW: { label: "약한 근거", className: "bg-orange-50 text-orange-700 border-orange-200" },
  UNSUPPORTED: { label: "환각 위험", className: "bg-state-critical-bg text-state-critical border-state-critical-line" },
};

const sectionTitle = (key: string) =>
  SECTION_META.find((s) => s.key === key)?.title ?? key;

export function ReportEvidencePanel({
  reportId,
  refreshKey = 0,
  canEdit = false,
}: {
  reportId: string;
  /** 섹션 재생성 후 증가시켜 근거를 다시 계산한다 */
  refreshKey?: number;
  canEdit?: boolean;
}) {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/${reportId}/evidence`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`근거를 불러오지 못했습니다 (${r.status})`);
        return r.json();
      })
      .then((res) => {
        if (!cancelled) setData(res.data ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : "근거 조회 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  useEffect(() => load(), [load, refreshKey]);

  const verifyWithAi = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/evidence/verify`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI 검증 실패");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 검증 실패");
    } finally {
      setVerifying(false);
    }
  };

  const visible = useMemo(() => {
    if (!data) return [];
    const filtered = onlyUnverified
      ? data.claims.filter((c) => c.status === "unverified")
      : data.claims;
    return expanded ? filtered : filtered.slice(0, 8);
  }, [data, onlyUnverified, expanded]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        근거 대조 중...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  if (!data || data.totals.checked === 0) return null;

  const { totals, coverage } = data;
  const filteredCount = onlyUnverified ? totals.unverified : totals.checked;
  const unsupportedCount = data.confidenceTotals?.UNSUPPORTED ?? totals.unverified;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <FileSearch className="w-4 h-4" />
          근거 추적
        </div>
        <Badge variant="secondary">추적 가능 {coverage}%</Badge>
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        보고서에 쓰인 수치·핵심 주장 {totals.checked}건을 업로드 자료 {data.documentCount}건과
        대조했습니다. &lsquo;문서 확인&rsquo;은 같은 값/취지가 자료에 있다는 뜻이지 해석까지
        맞다는 보증은 아닙니다. &lsquo;근거 없음&rsquo;은 투자심의위원회 전에 반드시 직접 확인하세요.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["document", "deal", "unverified"] as const).map((status) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <div
              key={status}
              className={`rounded-lg border px-3 py-3 text-center ${meta.className}`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs opacity-80">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{meta.label}</span>
              </div>
              <div className="font-bold text-2xl mt-1">{totals[status]}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <DistributionPanel title="근거의 구성" description="현재 보고서 API의 근거 분류 건수입니다. 자료 내 일치 여부이며 사실 확정이나 투자 판단 점수가 아닙니다." rows={(["document", "deal", "unverified"] as const).map(status => ({ label: STATUS_META[status].label, count: totals[status] }))} />
      </div>

      <details className="mt-4 rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">수치·출처 비교표 ({data.claims.filter(claim => claim.claimType === "numeric").length}건)</summary>
        <p className="mt-2 text-xs text-muted-foreground">원문에 기재된 값을 그대로 표시합니다. 기간·단위가 다른 숫자를 합산하거나 추정하지 않습니다.</p>
        <table className="mt-3 w-full table-fixed text-xs">
          <caption className="sr-only">보고서 수치와 원문 출처 비교</caption>
          <thead><tr className="border-b text-left"><th scope="col" className="w-1/3 p-2">수치 / 항목</th><th scope="col" className="p-2">출처 / 확인 상태</th></tr></thead>
          <tbody>{data.claims.filter(claim => claim.claimType === "numeric").map((claim, index) => <tr key={`${claim.sectionKey}-${index}`} className="border-b align-top">
            <td className="break-words p-2"><span className="font-semibold">{claim.value} {claim.unit}</span><br />{claim.label || claim.raw}<p className="mt-1 text-muted-foreground">{sectionTitle(claim.sectionKey)}</p></td>
            <td className="break-words p-2"><span className="font-medium">{STATUS_META[claim.status].label}</span>{claim.source ? <details className="mt-1"><summary className="cursor-pointer">{claim.source.documentName}{claim.source.location ? ` · ${claim.source.location}` : ""}</summary><p className="mt-1 leading-relaxed">{claim.source.snippet}</p></details> : <p className="mt-1 text-muted-foreground">{claim.status === "deal" ? "딜 입력값 · 별도 원문 확인 필요" : "연결된 원문 없음"}</p>}</td>
          </tr>)}</tbody>
        </table>
      </details>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOnlyUnverified((v) => !v);
            setExpanded(false);
          }}
          className="text-xs rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
        >
          {onlyUnverified ? "전체 보기" : "근거 없음만 보기"}
        </button>
        <span className="text-xs text-gray-400">
          {filteredCount}건 중 {visible.length}건 표시
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-green-700">
          {totals.checked === 0 ? "추출된 주장이 없어 근거 상태를 판단할 수 없습니다." : "현재 필터에 해당하는 주장이 없습니다. 추적 결과는 사실 검증 완료를 의미하지 않습니다."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((c, i) => {
            const meta = STATUS_META[c.status];
            /* confidence는 status==="document"일 때만 다른 값(HIGH/MEDIUM/LOW)을
             * 가질 수 있다 — "딜 입력"은 항상 HIGH, "근거 없음"은 항상 UNSUPPORTED로
             * status 자체가 그 의미를 이미 담고 있어(evidence.ts 참고), 이 경우
             * confidence 뱃지를 같이 보여주면 같은 말을 뱃지 두 개로 반복하게 된다.
             * "문서 확인"일 때만 confidence가 실제로 추가 정보(근거 품질)를 준다. */
            const confMeta =
              c.status === "document" ? CONFIDENCE_META[c.confidence] : null;
            return (
              <li
                key={`${c.sectionKey}-${c.claimType}-${c.value}-${c.unit}-${i}`}
                className="rounded border border-gray-100 bg-gray-50/60 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-gray-900">
                      {c.label ? `${c.label} · ` : ""}
                      {c.raw}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {sectionTitle(c.sectionKey)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {confMeta && (
                      <span
                        className={`text-xs rounded border px-1.5 py-0.5 ${confMeta.className}`}
                      >
                        {confMeta.label}
                      </span>
                    )}
                    <span
                      className={`text-xs rounded border px-1.5 py-0.5 ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>
                {c.source && (
                  <p className="mt-1 text-xs text-gray-500 break-words">
                    <span className="text-gray-400">
                      {c.source.documentName}
                      {c.source.location ? ` · ${c.source.location}` : ""}
                    </span>
                    {" — "}
                    {c.source.snippet}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filteredCount > visible.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {filteredCount - visible.length}건 더 보기
        </button>
      )}

      {canEdit && unsupportedCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={verifyWithAi}
          disabled={verifying}
        >
          {verifying ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          )}
          근거 없음 {Math.min(unsupportedCount, 5)}건 AI로 재확인
        </Button>
      )}
    </div>
  );
}

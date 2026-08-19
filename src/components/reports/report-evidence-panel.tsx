"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SECTION_META } from "@/types";
import { Loader2, FileSearch, AlertTriangle, FileText, PenLine } from "lucide-react";

type EvidenceStatus = "document" | "deal" | "unverified";

interface NumericClaim {
  sectionKey: string;
  raw: string;
  label: string;
  value: string;
  unit: string;
  status: EvidenceStatus;
  source?: { documentName: string; snippet: string };
}

interface EvidenceData {
  claims: NumericClaim[];
  totals: { checked: number; document: number; deal: number; unverified: number };
  coverage: number;
  documentCount: number;
}

const STATUS_META: Record<
  EvidenceStatus,
  { label: string; className: string; icon: typeof FileText }
> = {
  document: {
    label: "문서 확인",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: FileText,
  },
  deal: {
    label: "딜 입력",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: PenLine,
  },
  unverified: {
    label: "근거 없음",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: AlertTriangle,
  },
};

const sectionTitle = (key: string) =>
  SECTION_META.find((s) => s.key === key)?.title ?? key;

export function ReportEvidencePanel({
  reportId,
  refreshKey = 0,
}: {
  reportId: string;
  /** 섹션 재생성 후 증가시켜 근거를 다시 계산한다 */
  refreshKey?: number;
}) {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
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
  }, [reportId, refreshKey]);

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

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  if (!data || data.totals.checked === 0) return null;

  const { totals, coverage } = data;
  const filteredCount = onlyUnverified ? totals.unverified : totals.checked;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <FileSearch className="w-4 h-4" />
          근거 추적
        </div>
        <Badge variant="secondary">추적 가능 {coverage}%</Badge>
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        보고서에 쓰인 수치 {totals.checked}개를 업로드 자료 {data.documentCount}건과
        대조했습니다. &lsquo;문서 확인&rsquo;은 같은 값이 자료에 있다는 뜻이지 해석까지
        맞다는 보증은 아닙니다. &lsquo;근거 없음&rsquo;은 투자심의위원회 전에 반드시 직접 확인하세요.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["document", "deal", "unverified"] as const).map((status) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <div
              key={status}
              className={`rounded-xl border px-3 py-3 text-center ${meta.className}`}
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

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOnlyUnverified((v) => !v);
            setExpanded(false);
          }}
          className="text-[11px] rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
        >
          {onlyUnverified ? "전체 보기" : "근거 없음만 보기"}
        </button>
        <span className="text-[11px] text-gray-400">
          {filteredCount}건 중 {visible.length}건 표시
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-green-700">
          근거 없는 수치가 없습니다. 모든 숫자가 자료나 딜 입력값으로 되짚어집니다.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((c, i) => {
            const meta = STATUS_META[c.status];
            return (
              <li
                key={`${c.sectionKey}-${c.value}-${c.unit}-${i}`}
                className="rounded border border-gray-100 bg-gray-50/60 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-gray-900">
                      {c.label ? `${c.label} · ` : ""}
                      {c.raw}
                    </span>
                    <span className="ml-2 text-[11px] text-gray-400">
                      {sectionTitle(c.sectionKey)}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] rounded border px-1.5 py-0.5 shrink-0 ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </div>
                {c.source && (
                  <p className="mt-1 text-[11px] text-gray-500 break-words">
                    <span className="text-gray-400">{c.source.documentName}</span>
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
          className="mt-2 text-[11px] text-blue-600 hover:underline"
        >
          {filteredCount - visible.length}건 더 보기
        </button>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { IC_RECOMMENDATION_LABEL, INVESTMENT_SIGNAL_LABEL, type InvestmentSignal } from "@/lib/ic-review";
import { EvidenceStateBadge } from "./evidence-state";
import type { DecisionApiData } from "./decision-types";

const SIGNAL_TEXT_CLASS: Record<InvestmentSignal, string> = {
  STRONG: "text-state-positive",
  PROMISING: "text-state-info",
  CAUTION: "text-state-caution",
  HIGH_RISK: "text-state-critical",
};
const SIGNAL_TONE: Record<InvestmentSignal, StatusTone> = {
  STRONG: "positive",
  PROMISING: "info",
  CAUTION: "caution",
  HIGH_RISK: "critical",
};

/**
 * 딜 상세 첫 화면의 "투자 판단" 요약. 문서 업로더가 첫 화면이던 VC 진입 화면에서
 * 이 딜이 지금 어떤 상태인지 5초 안에 읽히게 한다. 새 계산은 없다 — 최신 보고서의
 * canonical 결정(GET /api/reports/[id]/decision)을 그대로 가져와 압축 표시한다.
 */
export function DealDecisionSummary({ reportId }: { reportId: string | null }) {
  const [data, setData] = useState<DecisionApiData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(reportId ? "loading" : "idle");

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setState("loading");
    fetch(`/api/reports/${reportId}/decision`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json) => {
        if (cancelled) return;
        setData(json.data as DecisionApiData);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (!reportId) {
    return (
      <Card className="p-4" data-testid="deal-decision-summary" data-state="no-report">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Investment Decision</p>
        <p className="mt-1 text-sm text-slate-700">
          아직 투자 판단이 없습니다. 문서를 업로드하고 보고서를 생성하면 투자 근거·논지 훼손 요인·미확인 정보가 여기에 요약됩니다.
        </p>
      </Card>
    );
  }
  if (state === "loading" || state === "idle") {
    return (
      <Card className="p-4" data-testid="deal-decision-summary" data-state="loading">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-3 h-4 w-full max-w-xl" />
      </Card>
    );
  }
  if (state === "error" || !data) {
    return (
      <Card className="p-4" data-testid="deal-decision-summary" data-state="error">
        <p className="text-sm text-slate-600">투자 판단 요약을 불러오지 못했습니다. 보고서에서 직접 확인하십시오.</p>
      </Card>
    );
  }

  if (!data.hasScore || !data.gate.ok) {
    const contradictions = data.decision.contradictions;
    return (
      <Card className="p-4" data-testid="deal-decision-summary" data-state={data.hasScore ? "gate-failed" : "no-score"}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Investment Decision</p>
        <p className="mt-1 text-sm text-slate-700">
          {data.hasScore
            ? "결정 요약이 자체 일관성 검증을 통과하지 못해 표시하지 않습니다."
            : "투자 매력도 점수가 아직 없어 결정 요약을 만들 수 없습니다."}
          {contradictions.length > 0 && ` 다만 수치 상충 ${contradictions.length}건이 있습니다.`}
        </p>
        <Link href={`/reports/${reportId}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          보고서에서 확인 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Card>
    );
  }

  const { decision } = data;
  const p0 = decision.missingInformation.filter((m) => m.priority === "P0").length;
  const topContradictions = decision.contradictions.slice(0, 2);
  return (
    <Card className="p-4 sm:p-5" data-testid="deal-decision-summary" data-state="ready">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Investment Decision</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`text-xl font-semibold tracking-tight ${SIGNAL_TEXT_CLASS[decision.signal]}`} data-testid="deal-decision-signal">
              {INVESTMENT_SIGNAL_LABEL[decision.signal].label}
            </span>
            <StatusBadge tone={SIGNAL_TONE[decision.signal]} icon={false}>
              {IC_RECOMMENDATION_LABEL[decision.recommendation]}
            </StatusBadge>
            <EvidenceStateBadge state={decision.confidence} />
          </div>
        </div>
        <Link
          href={`/reports/${reportId}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          결정 요약 전체 보기 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-800">{decision.thesis}</p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5"><dt className="text-slate-500">결정 차단(P0)</dt><dd className="font-semibold tabular-nums text-slate-900">{p0}건</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">수치 상충</dt><dd className="font-semibold tabular-nums text-slate-900">{decision.contradictions.length}건</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">논지 훼손 요인</dt><dd className="font-semibold tabular-nums text-slate-900">{decision.thesisBreakers.length}건</dd></div>
      </dl>

      {topContradictions.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm" data-testid="deal-decision-contradictions">
          {topContradictions.map((c) => (
            <li key={c.id} className="text-state-critical">
              <span className="font-medium">{c.metricLabel} 수치 상충</span>
              <span className="text-slate-700">
                {" — "}
                {c.values.map((v) => `${v.raw}${v.documentName ? `(${v.documentName})` : ""}`).join(" vs ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

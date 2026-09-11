"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QUESTION_CATEGORY_LABEL, type IcQuestion, type QuestionPriority } from "@/lib/ic-questions";
import { Loader2, RefreshCw, ListChecks, ChevronDown, ChevronUp } from "lucide-react";

interface IcQuestionsData {
  questions: IcQuestion[];
  top5: IcQuestion[];
  modelUsed: string;
}

const PRIORITY_META: Record<QuestionPriority, { label: string; className: string }> = {
  HIGH: { label: "HIGH", className: "bg-red-50 text-red-700 border-red-200" },
  MEDIUM: { label: "MEDIUM", className: "bg-amber-50 text-amber-700 border-amber-200" },
  LOW: { label: "LOW", className: "bg-gray-50 text-gray-600 border-gray-200" },
};

const TRIGGER_LABEL: Record<IcQuestion["trigger"], string> = {
  UNSUPPORTED_CLAIM: "근거 없는 주장",
  HIGH_SCORE_LOW_EVIDENCE: "고득점·근거 부족",
  RATIONALE_EVIDENCE_MISMATCH: "평가 근거 불일치",
  VALUATION_EVIDENCE_GAP: "밸류에이션 근거 부족",
};

function QuestionCard({ q }: { q: IcQuestion }) {
  const meta = PRIORITY_META[q.priority];
  return (
    <li className="rounded border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] rounded border px-1.5 py-0.5 ${meta.className}`}>
            {meta.label}
          </span>
          <span className="text-[11px] text-gray-400">
            {QUESTION_CATEGORY_LABEL[q.category]}
          </span>
          <span className="text-[11px] text-gray-300">·</span>
          <span className="text-[11px] text-gray-400">{TRIGGER_LABEL[q.trigger]}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-gray-900">{q.question}</p>
      <p className="mt-1 text-[11px] text-gray-500">
        <span className="font-medium text-gray-600">왜 중요한가</span> — {q.whyItMatters}
      </p>
      {(q.relatedClaim || q.relatedEvidence) && (
        <p className="mt-1 text-[11px] text-gray-400 break-words">
          {q.relatedClaim && <>연관 주장: &ldquo;{q.relatedClaim}&rdquo; </>}
          {q.relatedEvidence && <>· 근거 상태: {q.relatedEvidence}</>}
        </p>
      )}
    </li>
  );
}

export function IcQuestionsPanel({
  reportId,
  canEdit,
}: {
  reportId: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<IcQuestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/ic-questions`);
      if (res.ok) {
        const { data } = await res.json();
        setData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/ic-questions/generate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "IC 질문 생성 실패");
      setData(json.data);
      setExpanded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "IC 질문 생성 실패");
    } finally {
      setRunning(false);
    }
  };

  const visible = useMemo(() => {
    if (!data) return [];
    return expanded ? data.questions : data.top5;
  }, [data, expanded]);

  const grouped = useMemo(() => {
    const byPriority: Record<QuestionPriority, IcQuestion[]> = { HIGH: [], MEDIUM: [], LOW: [] };
    for (const q of visible) byPriority[q.priority].push(q);
    return byPriority;
  }, [visible]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        IC 질문 불러오는 중...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <ListChecks className="w-4 h-4" />
          IC Questions
        </div>
        {data && <Badge variant="secondary">{data.questions.length}개</Badge>}
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        일반적인 VC 질문 목록이 아니라, 이 딜의 Score·근거·Risk Flag에서 실제로
        확인이 필요한 부분만 뽑았습니다. 신호가 없는 항목은 질문을 만들지 않습니다.
      </p>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {data && data.questions.length > 0 ? (
        <>
          <div className="mt-3 space-y-3">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) =>
              grouped[priority].length > 0 ? (
                <div key={priority}>
                  <p className="text-[11px] font-medium text-gray-400 mb-1.5">
                    {PRIORITY_META[priority].label} ({grouped[priority].length})
                  </p>
                  <ul className="space-y-2">
                    {grouped[priority].map((q) => (
                      <QuestionCard key={q.id} q={q} />
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>

          {!expanded && data.questions.length > data.top5.length && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
            >
              <ChevronDown className="w-3 h-3" />
              전체 {data.questions.length}개 보기
            </button>
          )}
          {expanded && data.questions.length > data.top5.length && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-3 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
            >
              <ChevronUp className="w-3 h-3" />
              Top 5만 보기
            </button>
          )}

          <p className="mt-2 text-[11px] text-gray-400">{data.modelUsed}</p>
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center">
          {data ? (
            <>
              <p className="text-sm text-gray-500">확인이 필요한 항목을 찾지 못했습니다</p>
              <p className="text-xs text-gray-400 mt-1">
                근거 없는 주장이나 고득점·근거 부족 항목이 없으면 질문이 생성되지 않습니다
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">아직 생성하지 않았습니다</p>
              <p className="text-xs text-gray-400 mt-1">
                딜 스코어 계산 후 실행하면 Score·근거·Risk Flag를 바탕으로 IC 질문을 뽑습니다
              </p>
            </>
          )}
        </div>
      )}

      {canEdit && (
        <Button size="sm" variant="outline" className="mt-3" onClick={run} disabled={running}>
          {running ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {data ? "다시 생성" : "IC 질문 생성"}
        </Button>
      )}
    </div>
  );
}

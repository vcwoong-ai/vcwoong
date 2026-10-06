"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QUESTION_CATEGORY_LABEL, type IcQuestion, type QuestionPriority } from "@/lib/ic-questions";
import { Loader2, RefreshCw, ListChecks, ChevronDown, ChevronUp } from "lucide-react";

interface IcQuestionsData {
  questions: IcQuestion[];
  top5: IcQuestion[];
  modelUsed: string;
}

function isQuestionsData(value: unknown): value is IcQuestionsData | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return [data.questions, data.top5].every(items => Array.isArray(items) && items.every(item =>
    item && typeof item === "object" && ["HIGH", "MEDIUM", "LOW"].includes(item.priority)
      && ["id", "question", "whyItMatters"].every(key => typeof item[key] === "string")));
}

const PRIORITY_META: Record<QuestionPriority, { label: string; className: string }> = {
  HIGH: { label: "HIGH", className: "bg-state-critical-bg text-state-critical border-state-critical-line" },
  MEDIUM: { label: "MEDIUM", className: "bg-state-caution-bg text-state-caution border-state-caution-line" },
  LOW: { label: "LOW", className: "bg-state-neutral-bg text-state-neutral border-state-neutral-line" },
};

const TRIGGER_LABEL: Record<IcQuestion["trigger"], string> = {
  UNSUPPORTED_CLAIM: "근거 없는 주장",
  HIGH_SCORE_LOW_EVIDENCE: "고득점·근거 부족",
  RATIONALE_EVIDENCE_MISMATCH: "평가 근거 불일치",
  VALUATION_EVIDENCE_GAP: "밸류에이션 근거 부족",
  CONTRADICTION: "수치 상충",
};

function QuestionCard({ q }: { q: IcQuestion }) {
  const meta = PRIORITY_META[q.priority];
  return (
    <li className="rounded border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs rounded border px-1.5 py-0.5 ${meta.className}`}>
            {meta.label}
          </span>
          <span className="text-xs text-gray-400">
            {QUESTION_CATEGORY_LABEL[q.category]}
          </span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{TRIGGER_LABEL[q.trigger]}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-gray-900">{q.question}</p>
      <p className="mt-1 text-xs text-gray-500">
        <span className="font-medium text-gray-600">왜 중요한가</span> — {q.whyItMatters}
      </p>
      {(q.relatedClaim || q.relatedEvidence) && (
        <p className="mt-1 text-xs text-gray-400 break-words">
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
  onGenerated,
}: {
  reportId: string;
  canEdit: boolean;
  /** 질문 생성이 끝나면 호출 — 결정 요약이 질문 연결을 다시 불러오게 한다 */
  onGenerated?: () => void;
}) {
  const [data, setData] = useState<IcQuestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const request = useRef<{ epoch: number; controller?: AbortController }>({ epoch: 0 });
  const resource = useRef(reportId);
  resource.current = reportId;
  const mutation = useRef({ epoch: 0 });
  const active = useRef(true);

  const load = useCallback(async () => {
    request.current.controller?.abort();
    const controller = new AbortController();
    const epoch = ++request.current.epoch;
    request.current.controller = controller;
    const current = () => active.current && resource.current === reportId && request.current.epoch === epoch && !controller.signal.aborted;
    setLoading(true);
    setReadError(null);
    setData(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/ic-questions`, { signal: controller.signal });
      if (!res.ok) throw new Error("read_failed");
      if (current()) {
        const { data } = await res.json();
        if (!isQuestionsData(data)) throw new Error("read_failed");
        if (current()) setData(data);
      }
    } catch {
      if (current()) setReadError("IC 질문을 불러오지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 조회해주세요.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    active.current = true;
    setError(null);
    setRunning(false);
    setExpanded(false);
    void load();
    const pending = request.current;
    const mutations = mutation.current;
    return () => {
      active.current = false;
      mutations.epoch++;
      pending.epoch++;
      pending.controller?.abort();
    };
  }, [load]);

  const run = async () => {
    const token = ++mutation.current.epoch;
    const current = () => active.current && resource.current === reportId && mutation.current.epoch === token;
    request.current.controller?.abort();
    request.current.epoch++;
    setRunning(true);
    setLoading(false);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/ic-questions/generate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(res.status === 503 ? "IC 질문 생성 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요."
        : res.status === 429 ? "요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
        : "IC 질문을 생성하지 못했습니다. 연결과 로그인 상태를 확인해주세요.");
      const json = await res.json();
      if (!isQuestionsData(json.data) || json.data === null) throw new Error("invalid_questions");
      if (!current()) return;
      setData(json.data);
      setExpanded(false);
      onGenerated?.();
    } catch (e) {
      if (current()) setError(e instanceof Error && ["IC 질문 생성 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.", "요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.", "IC 질문을 생성하지 못했습니다. 연결과 로그인 상태를 확인해주세요."].includes(e.message)
        ? e.message : "IC 질문을 생성하지 못했습니다. 연결과 로그인 상태를 확인해주세요.");
    } finally {
      if (current()) setRunning(false);
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

  if (readError) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p role="alert" className="text-sm text-red-700">{readError}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>IC 질문 다시 조회</Button>
    </div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <ListChecks className="w-4 h-4" />
          IC 질문
        </div>
        {data && <Badge variant="secondary">{data.questions.length}개</Badge>}
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        일반적인 VC 질문 목록이 아니라, 이 딜의 Score·근거·Risk Flag에서 실제로
        확인이 필요한 부분만 뽑았습니다. 신호가 없는 항목은 질문을 만들지 않습니다.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {data && data.questions.length > 0 ? (
        <>
          <div className="mt-3 space-y-3">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) =>
              grouped[priority].length > 0 ? (
                <div key={priority}>
                  <p className="text-xs font-medium text-gray-400 mb-1.5">
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
              className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ChevronDown className="w-3 h-3" />
              전체 {data.questions.length}개 보기
            </button>
          )}
          {expanded && data.questions.length > data.top5.length && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ChevronUp className="w-3 h-3" />
              Top 5만 보기
            </button>
          )}

          <p className="mt-2 text-xs text-gray-400">{data.modelUsed}</p>
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

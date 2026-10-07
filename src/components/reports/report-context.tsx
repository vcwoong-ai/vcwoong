import Link from "next/link";
import type { DecisionContext } from "@/lib/decision-context";

export function ReportContext({ context, dealId }: { context: Omit<DecisionContext, "sections">; dealId?: string }) {
  if (!context.meetings.length && !context.research.length && !context.unavailableMeetings) return null;
  const mismatches = context.research.filter(item => item.verdict === "불일치" || item.needsRefresh).length;
  const comparisons = context.meetings.flatMap(meeting => meeting.claims.flatMap(claim => claim.comparisons.map(comparison => ({ meeting, claim, comparison }))));
  const questions = context.meetings.reduce((total, meeting) => total + meeting.questions.length + meeting.actions.length, 0);
  return <section className="space-y-4 break-words border-t border-slate-200 pt-6" aria-label="추가된 판단 근거">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h3 className="font-semibold text-slate-900">미팅·리서치에서 추가된 근거</h3>
      {dealId && context.meetings.length > 0 && <Link href={`/meetings/vc/${encodeURIComponent(dealId)}`} className="text-sm text-blue-700 underline underline-offset-4">회의 기록 확인</Link>}
    </div>
    <p className="text-sm text-slate-600">확정 회의록 {context.meetings.length}건 · 외부 리서치 주장 {context.research.length}건 · 질문·자료 요청 {questions}건</p>
    <p className="text-sm text-slate-600">회사 발언과 외부 리서치는 심사역이 검토할 참고 근거입니다. 기존 점수·자동 권고·승인 내용에 자동 반영하지 않습니다.</p>
    {context.meetings.length > 0 && <p className="text-xs text-slate-600">자동 수치 대조는 원문에서도 기간·단위·실적 또는 전망이 명시된 연간 원화 재무 수치에 한정합니다. 그 밖의 주장은 원문과 보완 자료를 함께 검토해주세요.</p>}
    {(context.comparisonCount > 0 || mismatches > 0 || context.unavailableMeetings > 0) && <p className="border-l-2 border-amber-500 pl-3 text-sm text-amber-800">
      기재 수치 대조 {context.comparisonCount}건 · 리서치 재확인 {mismatches}건 · 연결 오류 {context.unavailableMeetings}건. 아래 전체 판단 근거에서 양쪽 출처와 값을 확인해주세요.
    </p>}
    {comparisons.length > 0 && <ul className="space-y-3 text-sm text-slate-700">{comparisons.slice(0, 3).map(({ meeting, claim, comparison }, index) => <li key={index} className="border-b border-slate-100 pb-3">
      <p className="font-medium">{comparison.period} {comparison.metric} {comparison.scenario}: 회의 {comparison.meetingValue} / 자료 {comparison.documentValue}</p>
      <p className="mt-1 text-slate-600">{meeting.title} · {Math.floor(claim.start / 60)}분 {Math.floor(claim.start % 60)}초 ↔ {comparison.documentName} · {comparison.location}</p>
    </li>)}</ul>}
    {comparisons.length > 3 && <p className="text-xs text-slate-600">주요 3건을 표시했습니다. 모든 대조 항목은 아래 전체 판단 근거에서 확인할 수 있습니다.</p>}
    {context.meetings.length > 0 && <details>
      <summary className="cursor-pointer text-sm font-medium text-blue-700 focus-visible:outline-blue-600">확정 회의록 찾아보기 · {context.meetings.length}건</summary>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">{context.meetings.map(meeting => <li key={meeting.id} className="flex flex-wrap gap-x-3 gap-y-1">
      {dealId ? <Link className="min-w-0 font-medium text-blue-700 underline underline-offset-4" href={`/meetings/vc/${encodeURIComponent(dealId)}?meeting=${encodeURIComponent(meeting.id)}&version=${meeting.version}`}>{meeting.title}</Link> : <span className="min-w-0 font-medium">{meeting.title}</span>}<span>확정 버전 {meeting.version} · 주장 {meeting.claims.length}건</span>
      <span>{meeting.date.slice(0, 10)}</span>
    </li>)}</ul></details>}
  </section>;
}

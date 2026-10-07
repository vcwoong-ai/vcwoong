import { parseTranscript, validateMinutes } from "./meetings/policy";

/** Read-only references: never promote a reviewed statement to verified evidence. */
export const REPORT_MEETING_REFERENCE_INCLUDE = process.env.MEETING_INTELLIGENCE_ENABLED === "1" ? {
  meetings: { where: { status: "APPROVED", approvedAt: { not: null }, deletedAt: null, maDealId: null },
    orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }],
    select: { id: true, title: true, occurredAt: true, approvedAt: true, status: true, deletedAt: true,
      version: true, durationSeconds: true, minutes: true, transcript: true } }
} : {};

export interface MeetingReferenceInput {
  id: string; title: string; occurredAt: Date; approvedAt: Date | null; status: string; deletedAt: Date | null;
  version: number; durationSeconds: number | null; minutes: string | null; transcript: string | null;
}
export interface DecisionContextInput {
  sections: Array<{ sectionKey: string; content: string; updatedAt?: Date }>;
  documents: Array<{ id?: string; name: string; parsedText: string | null; createdAt?: Date }>;
  meetings?: MeetingReferenceInput[];
  research?: { claims: unknown; computedAt: Date; updatedAt?: Date; modelUsed: string } | null;
}
export interface ContextComparison {
  metric: string; period: string; scenario: string; meetingValue: string;
  documentValue: string; documentName: string; location: string;
}
export interface DecisionContext {
  meetings: Array<{ id: string; title: string; date: string; version: number; summary: string;
    claims: Array<{ text: string; start: number; end: number; state: string; note: string;
      excerpt: string; sourceLocated: boolean; comparisons: ContextComparison[] }>;
    questions: string[]; actions: string[] }>;
  research: Array<{ claim: string; sectionKey: string; verdict: string; rationale: string;
    currentReportMatch: boolean; needsRefresh: boolean; computedAt: string; sources: Array<{ title: string; url: string }> }>;
  unavailableMeetings: number;
  comparisonCount: number;
  sections: Array<{ title: string; content: string }>;
}

const units: Record<string, number> = { 원: 1e-8, 천원: 1e-5, 만원: 1e-4, 백만원: .01, 천만원: .1, 억원: 1, 억: 1, 조원: 10000, 조: 10000 };
interface AnnualFact { metric: string; period: string; scenario: string; scope: string; value: number; raw: string }
/** Deliberately narrow: explicit annual KRW statements only. Ambiguity requires a human. */
export function annualFinancialFact(text: string): AnnualFact | null {
  const years = Array.from(text.matchAll(/FY\s*((?:19|20)\d{2})(?!\d)|((?:19|20)\d{2})\s*년/gi)).map(match => match[1] ?? match[2]);
  const metrics = text.match(/영업이익|순이익|매출(?:액)?/g) ?? [];
  const values = Array.from(text.matchAll(/([-−△▲]?)\s*(\d[\d,]*(?:\.\d+)?)\s*(천만원|백만원|천원|만원|억원|조원|원)/g));
  const actual = /실적|actual/i.test(text), forecast = /전망|추정|예상|forecast|estimate/i.test(text);
  if (years.length !== 1 || metrics.length !== 1 || values.length !== 1 || actual === forecast
    || /분기|Q[1-4]|반기|TTM|LTM|이익률|성장률|비중|목표|누적|달러|USD|유로|EUR|CNY|위안|JPY/i.test(text)
    || /\d\s*[-~〜–]\s*\d|\d\s*월|\bH[12]\b|월간|약\s*\d|대략|내외|최소|최대|이상|이하|초과|미만|\d[eE][+-]?\d/.test(text)
    || (/연결/.test(text) && /별도|단독/.test(text))) return null;
  const value = Number(values[0][2].replace(/,/g, "")) * (values[0][1] ? -1 : 1) * units[values[0][3]];
  if (!Number.isFinite(value)) return null;
  return { metric: metrics[0].replace("매출액", "매출"), period: years[0], scenario: actual ? "실적" : "전망",
    scope: /연결/.test(text) ? "연결" : /별도|단독/.test(text) ? "별도" : "명시 없음", value, raw: values[0][0].trim() };
}
const factKey = (fact: AnnualFact) => [fact.metric, fact.period, fact.scenario, fact.scope].join(":");
const normalize = (value: string) => value.replace(/\s+/g, "").trim();
const literal = (value: string) => value.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function buildDecisionContext(input: DecisionContextInput): DecisionContext {
  const result: DecisionContext = { meetings: [], research: [], unavailableMeetings: 0, comparisonCount: 0, sections: [] };
  const documentFacts = input.meetings?.some(meeting => meeting.status === "APPROVED" && meeting.approvedAt && !meeting.deletedAt) ? input.documents.flatMap(document => {
    let location = "위치 미표기";
    return (document.parsedText ?? "").split(/\r?\n|[。;；]/).flatMap(line => {
      const marker = /\[(슬라이드 \d+|페이지 \d+|시트: [^\]]+)\]/.exec(line);
      if (marker) location = marker[1];
      const fact = annualFinancialFact(line);
      return fact ? [{ fact, name: document.name, location }] : [];
    });
  }) : [];
  for (const meeting of input.meetings ?? []) {
    if (meeting.status !== "APPROVED" || !meeting.approvedAt || meeting.deletedAt) continue;
    try {
      const minutes = validateMinutes(JSON.parse(meeting.minutes ?? "null"), meeting.durationSeconds ?? 0);
      const transcript = parseTranscript(JSON.parse(meeting.transcript ?? "null"), meeting.durationSeconds ?? 0);
      const claims = minutes.claims.map(claim => {
        const segments = transcript.filter(segment => claim.end > claim.start
          ? segment.start < claim.end && segment.end > claim.start : segment.start <= claim.start && segment.end > claim.start);
        const excerpt = segments.map(segment => segment.text).join("\n");
        const fact = annualFinancialFact(claim.text);
        // A reviewed paraphrase can contain an incorrect number; only compare numbers also located in transcript.
        const aligned = fact && segments.some(segment => {
          const source = annualFinancialFact(segment.text);
          return source && factKey(source) === factKey(fact) && source.value === fact.value;
        });
        const comparisons: ContextComparison[] = aligned && fact ? documentFacts.filter(item => factKey(item.fact) === factKey(fact)
          && Math.abs(item.fact.value - fact.value) > Math.max(1, Math.abs(item.fact.value), Math.abs(fact.value)) * Number.EPSILON * 8)
          .map(item => ({ metric: fact.metric, period: fact.period, scenario: fact.scenario, meetingValue: fact.raw,
            documentValue: item.fact.raw, documentName: item.name, location: item.location })) : [];
        result.comparisonCount += comparisons.length;
        return { text: claim.text, start: claim.start, end: claim.end,
          state: claim.verification === "VERIFIED" ? "사용자 확인 메모 있음" : claim.verification === "NEEDS_DATA" ? "보완 자료 필요" : "회사 발언 · 미검증",
          note: claim.note, excerpt, sourceLocated: segments.length > 0, comparisons };
      });
      result.meetings.push({ id: meeting.id, title: meeting.title, date: meeting.occurredAt.toISOString(), version: meeting.version,
        summary: minutes.summary, claims, questions: minutes.questions, actions: minutes.actions });
    } catch { result.unavailableMeetings++; }
  }
  if (input.research && Array.isArray(input.research.claims)) {
    for (const item of input.research.claims) {
      if (!item || typeof item !== "object" || typeof item.claim !== "string" || !item.claim.trim()
        || typeof item.sectionKey !== "string") continue;
      const sources = Array.isArray(item.sources) ? item.sources.flatMap((source: unknown) => {
        if (!source || typeof source !== "object") return [];
        const entry = source as Record<string, unknown>, url = safeUrl(entry.url);
        return url && typeof entry.title === "string" ? [{ title: entry.title, url }] : [];
      }) : [];
      const currentReportMatch = input.sections.some(section => section.sectionKey === item.sectionKey
        && normalize(section.content).includes(normalize(item.claim)));
      const researchedAt = input.research.updatedAt ?? input.research.computedAt;
      const needsRefresh = !currentReportMatch || input.sections.some(section => section.updatedAt && section.updatedAt > researchedAt)
        || input.documents.some(document => document.createdAt && document.createdAt > researchedAt);
      const verdict = sources.length && !needsRefresh && input.research.modelUsed !== "demo-mock"
        && ["지지", "불일치", "불명확"].includes(item.verdict) ? item.verdict : "불명확";
      result.research.push({ claim: item.claim, sectionKey: item.sectionKey, verdict,
        rationale: typeof item.rationale === "string" ? item.rationale : "판단 이유 미기재", sources,
        currentReportMatch, needsRefresh, computedAt: researchedAt.toISOString() });
    }
  }
  if (result.meetings.length || result.unavailableMeetings) {
    const lines = ["회의록 검토 확정은 회사 발언의 독립 사실 검증이 아닙니다. 추가 근거는 기존 점수·자동 권고·보고서 승인에 자동 반영하지 않습니다."];
    for (const meeting of result.meetings) {
      lines.push(`### ${literal(meeting.title)} · ${meeting.date} · 버전 ${meeting.version}`, literal(meeting.summary));
      for (const claim of meeting.claims) {
        lines.push(`- [${clock(claim.start)}–${clock(claim.end)}] ${literal(claim.text)} — ${claim.state}`,
          `  - 전사: ${claim.sourceLocated ? literal(claim.excerpt) : "해당 시간 구간의 전사를 찾지 못했습니다. 원본을 재확인해주세요."}`,
          `  - 확인 메모·필요 자료: ${literal(claim.note) || "미기재"}`);
        for (const comparison of claim.comparisons) lines.push(`  - 대조 필요: ${comparison.period} ${comparison.metric} ${comparison.scenario} — 회의 ${comparison.meetingValue} / ${literal(comparison.documentName)}(${literal(comparison.location)}) ${comparison.documentValue}. 같은 기간·구분의 다른 기재 값이며 어느 쪽이 맞는지 확정하지 않았습니다.`);
      }
      lines.push("#### 미확인 질문", ...meeting.questions.map(text => `- ${literal(text)}`), "#### 추가 자료와 다음 행동", ...meeting.actions.map(text => `- ${literal(text)}`));
    }
    if (result.unavailableMeetings) lines.push(`연결할 수 없는 확정 회의록 ${result.unavailableMeetings}건이 있습니다. 원본 기록을 재확인해주세요.`);
    result.sections.push({ title: "미팅에서 추가된 판단 근거", content: lines.join("\n\n") });
  }
  if (result.research.length) {
    const lines = ["저장된 외부 리서치의 AI 대조 결과입니다. 원문 확인과 심사역 검토가 필요하며 독립 사실 검증이나 투자 승인으로 간주하지 않습니다."];
    for (const item of result.research) {
      lines.push(`### ${literal(item.claim)}`, `외부 대조: ${item.verdict} · 확인일: ${item.computedAt}`, literal(item.rationale),
        ...(item.needsRefresh ? ["보고서·자료가 변경되었거나 현재 보고서에서 같은 문구를 찾지 못했습니다. 다시 대조해주세요."] : []),
        ...(item.sources.length ? item.sources.map(source => `- ${literal(source.title)}: ${source.url.replace(/[()<>]/g, character => encodeURIComponent(character))}`) : ["출처 링크 없음 · 추가 확인 필요"]));
    }
    result.sections.push({ title: "리서치에서 추가된 판단 근거", content: lines.join("\n\n") });
  }
  return result;
}

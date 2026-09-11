/**
 * 근거 추적 — 보고서에 쓰인 주장(claim)이 실제 업로드 자료의 어느 부분에
 * 근거하는지 추적한다.
 *
 * 왜 필요한가:
 *   AI 초안을 IC에 올리는 심사역이 가장 먼저 듣는 질문은 "이 숫자 어디서
 *   나온 거냐"다. 하나라도 출처를 못 대면 보고서 전체의 신뢰가 무너지므로,
 *   심사역은 결국 모든 숫자를 손으로 다시 확인하게 되고 자동화의 이득이
 *   사라진다.
 *
 * `report-quality.ts`의 `checkFactConsistency`와 방향이 반대다:
 *   - checkFactConsistency: 문서에서 뽑은 팩트가 보고서에 **쓰였는지**
 *     (= AI가 자료를 무시하지 않았는지)
 *   - 이 파일: 보고서에 쓰인 숫자/주장이 문서에 **있는지**
 *     (= AI가 없는 내용을 지어내지 않았는지)
 *
 * 후자가 환각을 잡는 쪽이고, 심사역이 실제로 방어해야 하는 것도 이쪽이다.
 *
 * 한계(과장하지 말 것): 같은 숫자가 자료에 있다는 건 "추적 가능"이지
 * "해석이 맞다"는 뜻이 아니다. 그래서 라벨도 '문서 확인'이지 '검증 완료'가
 * 아니다. 반대로 자료 어디에도 없는 숫자는 확실히 사람이 봐야 한다.
 *
 * 매칭은 5단계 파이프라인으로 한다(우선순위 순):
 *   1. exact numeric match   — 숫자 claim, 값이 문서에 정확히 있음
 *   2. normalized text match — (1)과 같은 코드 경로(콤마·꼬리0 정규화)
 *   3. keyword overlap       — 질적 claim, 핵심 키워드가 문서 한 곳에 몰려 있음
 *   4. adjacent sentence     — 키워드가 인접 문장에 흩어져 있음(약한 근거)
 *   5. AI semantic matching  — 위 4단계로 못 찾은 것만, 별도 API(evidence-ai.ts)에서
 *      제한된 수만큼 수행 — 이 파일 자체는 AI를 호출하지 않는다(순수 함수 유지).
 */

import { splitSentences, isUnverifiable } from "./deep-dive";

export type EvidenceStatus =
  /** 업로드한 자료 원문에 같은 값/취지가 있음 */
  | "document"
  /** 딜 정보에 사용자가 직접 입력한 값 (투자금액·밸류) */
  | "deal"
  /** 어느 자료에도 없음 — 사람이 확인해야 함 */
  | "unverified";

/** 근거의 확실성 등급 — hallucination 위험도와 직결된다(report-quality.ts 연결) */
export type ClaimConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNSUPPORTED";

export type ClaimType = "numeric" | "qualitative";

export type MatchMethod =
  | "exact_numeric"
  | "deal_input"
  | "keyword_overlap"
  | "adjacent_sentence"
  | "ai_semantic"
  | "none";

/** AI 보강 검증 결과(evidence-ai.ts가 계산, 이 파일은 주입만 받는다) */
export interface AiEvidenceVerdict {
  confidence: ClaimConfidence;
  rationale?: string;
  documentName?: string;
  location?: string;
  snippet?: string;
}

export interface EvidenceSource {
  documentId?: string;
  documentName: string;
  /** 문서 안에서의 위치 — 실제로 알 수 있을 때만 채운다("3페이지"/"슬라이드 2"/
   * "시트: 매출현황"). 없는 정보를 추정해서 만들지 않는다. */
  location?: string;
  snippet: string;
}

export interface NumericClaim {
  sectionKey: string;
  /** 보고서 원문 표기(숫자 claim: "45억원", 질적 claim: 문장 그 자체) */
  raw: string;
  /** 숫자 claim의 문맥 라벨(예: "ARR") 또는 질적 claim의 카테고리(예: "시장 성장성") */
  label: string;
  /** 숫자 claim만: 콤마·꼬리 0을 정리한 비교용 값. 질적 claim은 빈 문자열 */
  value: string;
  /** 숫자 claim만: 단위. 질적 claim은 빈 문자열 */
  unit: string;
  status: EvidenceStatus;
  /** status === "document" 일 때 근거 문서명·위치·원문 발췌 */
  source?: EvidenceSource;
  /** 이 claim이 숫자 주장인지 투자판단성 질적 주장인지 */
  claimType: ClaimType;
  confidence: ClaimConfidence;
  matchMethod: MatchMethod;
  /** AI 보강 검증 캐시(ClaimEvidenceCheck) 조회용 안정 키 */
  claimKey: string;
}

export interface EvidenceReport {
  claims: NumericClaim[];
  totals: {
    checked: number;
    document: number;
    deal: number;
    unverified: number;
  };
  /** 추적 가능한 수치 비율 (0~100) — 기존 필드, 숫자 claim 기준 그대로 유지 */
  coverage: number;
  /** 신뢰도 등급별 집계 — hallucination 연결(report-quality.ts)에서 사용 */
  confidenceTotals: Record<ClaimConfidence, number>;
}

/**
 * 단위. 긴 것부터 와야 "억원"이 "억"으로 잘리지 않는다.
 * `년`은 연도·기간이라 노이즈가 커서 뺐다.
 */
const UNITS = [
  "조원", "억원", "백만원", "천만원", "만원", "천원",
  "조", "억", "백만", "만",
  "tCO2e", "tCO₂e", "톤",
  "원", "%", "퍼센트", "명", "건", "개월", "개", "배", "배수", "x",
];

const UNIT_ALT = UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const CLAIM_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_ALT})?`, "g");
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/** 생성 시 보고서 끝에 자동으로 붙는 품질 메모 — 보고서의 주장이 아니다 */
const QUALITY_FOOTER_RE = /\n*---\n\*[^*]*자동 품질 점수[^*]*\*\s*$/;

function isYearToken(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value);
}

/** "1,200.50" → "1200.5", "45.0" → "45" (문서/보고서 표기 차이를 흡수) */
function normalizeNumber(raw: string): string {
  const cleaned = raw.replace(/,/g, "");
  if (!cleaned.includes(".")) return cleaned;
  return cleaned.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * 숫자 앞 문맥에서 라벨을 뽑는다. 줄 시작이나 구분자(·, |, ,)까지만 거슬러
 * 올라가 앞 문장이 통째로 딸려오지 않게 한다.
 */
function labelBefore(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const head = text.slice(Math.max(lineStart, index - 40), index);
  const seg = (head.split(/[·|,()]/).pop() ?? "")
    .replace(/^[\s\-*#>]+/, "")
    .replace(/[:：\s]+$/, "")
    .trim();
  if (seg) return seg.slice(-24);

  // 표 행(| ARR | 24.7억원 |)은 숫자 바로 앞이 구분자라 라벨이 비는데,
  // 이때는 그 행의 첫 칸이 사실상의 항목명이다.
  const line = text.slice(lineStart, index);
  if (line.trimStart().startsWith("|")) {
    const firstCell = line.split("|").map((c) => c.trim()).find(Boolean);
    if (firstCell) return firstCell.slice(-24);
  }
  return "";
}

// ────────────────────────────────────────────────────────────
// 위치(location) — 실제 parser가 남긴 표시만 읽는다. 추정 금지.
// ────────────────────────────────────────────────────────────

/**
 * document-parser.ts가 남기는 위치 표시:
 *   PPTX → "[슬라이드 3]" / "[슬라이드 3 발표자 노트]"
 *   XLSX → "[시트: 매출현황]"
 *   PDF  → "[페이지 3]" (pdf-parse의 실제 페이지 경계, 추정 아님)
 * DOCX(mammoth)는 이런 표시가 없다 — 위치 정보 없이 문서명+발췌만 제공한다.
 */
const LOCATION_MARKER_RE = /\[(슬라이드 \d+(?: 발표자 노트)?|시트: [^\]]+|페이지 \d+)\]/g;

interface LocationMarker {
  offset: number;
  label: string;
}

/** 문서 하나당 한 번만 스캔한다 — claim마다 전체 재스캔하지 않는다(성능 요구사항). */
function buildLocationIndex(text: string): LocationMarker[] {
  const markers: LocationMarker[] = [];
  LOCATION_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LOCATION_MARKER_RE.exec(text)) !== null) {
    markers.push({ offset: m.index, label: m[1] });
  }
  return markers;
}

/** offset 이전에 등장한 마지막 위치 표시를 찾는다(이진 탐색 — 마커 수는 적어 선형이어도 무방하나 명확성을 위해 유지). */
function locationAt(markers: LocationMarker[], offset: number): string | undefined {
  let lo = 0;
  let hi = markers.length - 1;
  let best: string | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (markers[mid].offset <= offset) {
      best = markers[mid].label;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────
// 숫자 claim — 문서 전체 숫자 색인 (기존 로직 그대로)
// ────────────────────────────────────────────────────────────

interface DocumentNumberHit {
  documentId?: string;
  documentName: string;
  location?: string;
  snippet: string;
  /** 라벨-문맥 일치 확인용 — 매칭된 스니펫 주변 원문(소문자, 공백 제거 없음) */
  context: string;
}

/**
 * 자료에 등장하는 모든 숫자를 값 → 출처로 색인한다.
 *
 * 부분 문자열 비교(예: 보고서의 "45"가 자료의 "1450"에 걸리는 것)를 피하려고
 * 토큰 단위로 정확히 맞춘다.
 */
function indexDocumentNumbers(
  documents: Array<{ id?: string; name: string; parsedText: string | null }>
): Map<string, DocumentNumberHit> {
  const index = new Map<string, DocumentNumberHit>();

  for (const doc of documents) {
    const text = doc.parsedText;
    if (!text) continue;
    const markers = buildLocationIndex(text);

    NUMBER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMBER_RE.exec(text)) !== null) {
      const value = normalizeNumber(m[0]);
      if (!value || index.has(value)) continue;

      const from = Math.max(0, m.index - 40);
      const to = Math.min(text.length, m.index + m[0].length + 40);
      const snippet = text.slice(from, to).replace(/\s+/g, " ").trim();

      index.set(value, {
        documentId: doc.id,
        documentName: doc.name,
        location: locationAt(markers, m.index),
        snippet: (from > 0 ? "…" : "") + snippet + (to < text.length ? "…" : ""),
        context: text.slice(Math.max(0, m.index - 120), m.index).toLowerCase(),
      });
    }
  }

  return index;
}

/**
 * 보고서 본문에서 검증할 만한 수치 주장만 골라낸다.
 *
 * 단위 없는 짧은 정수(항목 번호, "3개 축" 같은 표현)까지 넣으면 목록이
 * 노이즈로 가득 차 심사역이 안 보게 되므로, 단위가 붙었거나 4자리 이상인
 * 숫자만 남긴다.
 */
function extractNumericClaims(sectionKey: string, content: string): NumericClaim[] {
  const body = content.replace(QUALITY_FOOTER_RE, "");
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  CLAIM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAIM_RE.exec(body)) !== null) {
    const [raw, numberPart, unitPart] = m;
    const unit = unitPart ?? "";
    const value = normalizeNumber(numberPart);

    if (!value) continue;
    // 식별자 안의 숫자(NCT01234567, KR10-2020-…)는 수치 주장이 아니다.
    // 이런 건 외부 DB에서 가져온 값이라 자료에 없는 게 정상이므로,
    // 넣어두면 "근거 없음"만 잔뜩 늘어난다.
    if (/[A-Za-z]$/.test(body.slice(0, m.index))) continue;
    if (isYearToken(value) && !unit) continue;
    // 단위가 없으면 4자리 이상만 (항목 번호·소수 개수 같은 노이즈 제외)
    if (!unit && value.replace(".", "").length < 4) continue;
    // 0, 100%는 주장이라기보다 관용 표현인 경우가 많다
    if (value === "0") continue;

    const dedupeKey = `${value}|${unit}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const label = labelBefore(body, m.index);

    claims.push({
      sectionKey,
      raw: raw.trim(),
      label,
      value,
      unit,
      status: "unverified",
      claimType: "numeric",
      confidence: "UNSUPPORTED",
      matchMethod: "none",
      claimKey: `${sectionKey}:numeric:${value}|${unit}`.slice(0, 300),
    });
  }

  return claims;
}

// ────────────────────────────────────────────────────────────
// 질적(투자판단) claim — 숫자가 없는 판단성 문장만 대상으로 한다.
// 숫자가 섞인 문장은 이미 숫자 claim 파이프라인이 다루므로 중복 추출하지
// 않는다(이중 집계 방지).
// ────────────────────────────────────────────────────────────

interface QualitativePattern {
  category: string;
  re: RegExp;
  /** 문서 매칭에 쓸 핵심 키워드(전부 혹은 대부분 있어야 근거로 인정) */
  keywords: string[];
}

const QUALITATIVE_PATTERNS: QualitativePattern[] = [
  {
    category: "시장 성장성",
    re: /시장[\s\S]{0,15}(빠르게|급속|고속|가파르게)[\s\S]{0,10}성장/,
    keywords: ["시장", "성장"],
  },
  {
    category: "기술 경쟁력",
    re: /기술[\s\S]{0,10}(경쟁력|우위|차별화)/,
    keywords: ["기술", "경쟁력"],
  },
  {
    category: "진입장벽",
    re: /진입\s*장벽/,
    keywords: ["진입", "장벽"],
  },
  {
    category: "고객 확보 가능성",
    re: /고객[\s\S]{0,10}확보/,
    keywords: ["고객", "확보"],
  },
  {
    category: "경쟁우위",
    re: /경쟁\s*우위|해자|moat/i,
    keywords: ["경쟁우위"],
  },
];

const HAS_DIGIT_RE = /\d/;

/**
 * ReportSection.content에서 투자판단에 중요한 질적 주장만 골라낸다.
 *
 * 모든 문장을 claim으로 만들면 보고서 품질 표시가 노이즈로 뒤덮이므로,
 * 위 5개 카테고리 패턴에 걸리는 문장만, 섹션당 상한(maxPerSection)까지만
 * 남긴다. 숫자가 섞인 문장은 숫자 claim 쪽에서 이미 다루므로 제외한다.
 */
function extractQualitativeClaims(
  sectionKey: string,
  content: string,
  maxPerSection = 4
): NumericClaim[] {
  const body = content.replace(QUALITY_FOOTER_RE, "");
  const sentences = splitSentences(body);
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  outer: for (const sentence of sentences) {
    if (HAS_DIGIT_RE.test(sentence)) continue; // 숫자 claim 파이프라인이 처리
    if (isUnverifiable(sentence)) continue; // "확인 필요" 류는 주장이 아니다
    if (sentence.length < 6 || sentence.length > 200) continue;

    for (const pattern of QUALITATIVE_PATTERNS) {
      if (!pattern.re.test(sentence)) continue;
      const dedupeKey = `${pattern.category}|${sentence.slice(0, 40)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      claims.push({
        sectionKey,
        raw: sentence,
        label: pattern.category,
        value: "",
        unit: "",
        status: "unverified",
        claimType: "qualitative",
        confidence: "UNSUPPORTED",
        matchMethod: "none",
        claimKey: `${sectionKey}:qualitative:${normalizeForMatch(sentence).slice(0, 200)}`,
      });

      if (claims.length >= maxPerSection) break outer;
      break; // 문장 하나는 카테고리 하나에만 든다
    }
  }

  return claims;
}

/** 공백·구두점을 지우고 소문자로 — 한국어 표기 차이를 흡수하는 최소한의 정규화 */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?·|()[\]{}"'`~-]/g, "");
}

/**
 * 질적 claim의 핵심 키워드가 문서 한 곳에 몰려 있는지(동일/인접 문장) 확인한다.
 * AI 호출 없이 결정적으로 판단 — 전부 겹치면 MEDIUM, 일부만 겹치면 LOW.
 */
function matchQualitativeClaim(
  pattern: QualitativePattern | undefined,
  documents: Array<{ id?: string; name: string; parsedText: string | null }>
): { confidence: ClaimConfidence; source?: EvidenceSource } {
  if (!pattern) return { confidence: "UNSUPPORTED" };

  const WINDOW = 300;
  for (const doc of documents) {
    const text = doc.parsedText;
    if (!text) continue;
    const markers = buildLocationIndex(text);

    // 키워드 중 첫 번째가 등장하는 모든 위치를 기준으로 윈도우를 열어,
    // 나머지 키워드가 그 윈도우 안에 있는지 센다.
    const anchor = pattern.keywords[0];
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(anchor, searchFrom);
      if (idx === -1) break;
      searchFrom = idx + anchor.length;

      const from = Math.max(0, idx - WINDOW / 2);
      const to = Math.min(text.length, idx + WINDOW / 2);
      const window = text.slice(from, to);
      const hits = pattern.keywords.filter((k) => window.includes(k)).length;

      if (hits === pattern.keywords.length) {
        const snippet = window.replace(/\s+/g, " ").trim();
        return {
          confidence: "MEDIUM",
          source: {
            documentId: doc.id,
            documentName: doc.name,
            location: locationAt(markers, idx),
            snippet: (from > 0 ? "…" : "") + snippet + (to < text.length ? "…" : ""),
          },
        };
      }
      if (hits >= Math.ceil(pattern.keywords.length / 2)) {
        const snippet = window.replace(/\s+/g, " ").trim();
        return {
          confidence: "LOW",
          source: {
            documentId: doc.id,
            documentName: doc.name,
            location: locationAt(markers, idx),
            snippet: (from > 0 ? "…" : "") + snippet + (to < text.length ? "…" : ""),
          },
        };
      }
    }
  }

  return { confidence: "UNSUPPORTED" };
}

function patternForCategory(category: string): QualitativePattern | undefined {
  return QUALITATIVE_PATTERNS.find((p) => p.category === category);
}

// ────────────────────────────────────────────────────────────
// 메인 진입점
// ────────────────────────────────────────────────────────────

export function traceReportEvidence(
  sections: Array<{ sectionKey: string; content: string }>,
  documents: Array<{ id?: string; name: string; parsedText: string | null }>,
  dealFacts: { investAmount?: number | null; valuation?: number | null } = {},
  /** evidence-ai.ts가 계산해 캐시해둔 AI 보강 검증 결과(claimKey로 매칭) */
  aiVerdicts?: Map<string, AiEvidenceVerdict>
): EvidenceReport {
  const documentIndex = indexDocumentNumbers(documents);

  // 딜 등록 시 사용자가 직접 넣은 값은 자료에 없어도 근거가 있는 셈이다
  const dealValues = new Set<string>();
  if (dealFacts.investAmount != null)
    dealValues.add(normalizeNumber(String(dealFacts.investAmount)));
  if (dealFacts.valuation != null)
    dealValues.add(normalizeNumber(String(dealFacts.valuation)));

  const numericClaims = sections.flatMap((s) =>
    extractNumericClaims(s.sectionKey, s.content)
  );
  const qualitativeClaims = sections.flatMap((s) =>
    extractQualitativeClaims(s.sectionKey, s.content)
  );
  const claims = [...numericClaims, ...qualitativeClaims];

  for (const claim of claims) {
    if (claim.claimType === "numeric") {
      const hit = documentIndex.get(claim.value);
      if (hit) {
        claim.status = "document";
        claim.matchMethod = "exact_numeric";
        claim.source = {
          documentId: hit.documentId,
          documentName: hit.documentName,
          location: hit.location,
          snippet: hit.snippet,
        };
        // 라벨이 있는데 매칭된 문맥에 라벨의 키워드가 하나도 없으면(같은
        // 숫자가 우연히 다른 항목으로 존재할 가능성), 확신도를 낮춘다.
        const labelTokens = claim.label
          .split(/[\s·]/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2);
        const contextOverlap =
          labelTokens.length === 0 ||
          labelTokens.some((t) => hit.context.includes(t.toLowerCase()));
        claim.confidence = contextOverlap ? "HIGH" : "MEDIUM";
      } else if (dealValues.has(claim.value)) {
        claim.status = "deal";
        claim.matchMethod = "deal_input";
        claim.confidence = "HIGH";
      }
    } else {
      const pattern = patternForCategory(claim.label);
      const result = matchQualitativeClaim(pattern, documents);
      claim.confidence = result.confidence;
      if (result.source) {
        claim.status = "document";
        claim.matchMethod =
          result.confidence === "MEDIUM" ? "keyword_overlap" : "adjacent_sentence";
        claim.source = result.source;
      }
    }

    // AI 보강 검증(있으면) — deterministic 매칭이 UNSUPPORTED로 남긴 것만 덮어쓴다.
    // 이미 확인된 근거를 AI가 다시 판단하게 하지 않는다(비용·일관성 모두 이유).
    if (claim.confidence === "UNSUPPORTED" && aiVerdicts?.has(claim.claimKey)) {
      const verdict = aiVerdicts.get(claim.claimKey)!;
      claim.confidence = verdict.confidence;
      claim.matchMethod = "ai_semantic";
      if (verdict.confidence !== "UNSUPPORTED") {
        claim.status = "document";
        claim.source = {
          documentName: verdict.documentName ?? "AI 보강 검증",
          location: verdict.location,
          snippet: verdict.snippet ?? verdict.rationale ?? "",
        };
      }
    }
  }

  const totals = {
    checked: claims.length,
    document: claims.filter((c) => c.status === "document").length,
    deal: claims.filter((c) => c.status === "deal").length,
    unverified: claims.filter((c) => c.status === "unverified").length,
  };

  const traced = totals.document + totals.deal;
  const coverage =
    totals.checked === 0 ? 0 : Math.round((traced / totals.checked) * 100);

  const confidenceTotals: Record<ClaimConfidence, number> = {
    HIGH: claims.filter((c) => c.confidence === "HIGH").length,
    MEDIUM: claims.filter((c) => c.confidence === "MEDIUM").length,
    LOW: claims.filter((c) => c.confidence === "LOW").length,
    UNSUPPORTED: claims.filter((c) => c.confidence === "UNSUPPORTED").length,
  };

  // 확인이 필요한 것부터 위로 — 심사역이 먼저 봐야 할 순서다
  const statusRank: Record<EvidenceStatus, number> = {
    unverified: 0,
    deal: 1,
    document: 2,
  };
  const confidenceRank: Record<ClaimConfidence, number> = {
    UNSUPPORTED: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
  };
  claims.sort((a, b) => {
    const byStatus = statusRank[a.status] - statusRank[b.status];
    if (byStatus !== 0) return byStatus;
    return confidenceRank[a.confidence] - confidenceRank[b.confidence];
  });

  return { claims, totals, coverage, confidenceTotals };
}

/** claimKey 계산을 evidence-ai.ts·API route에서도 동일하게 쓸 수 있게 노출 */
export { normalizeForMatch };

/** UNSUPPORTED 상태이면서 AI 보강 검증 대상이 될 만한 claim만 골라낸다(개수 제한은 호출부 책임) */
export function pickUnsupportedClaims(report: EvidenceReport): NumericClaim[] {
  return report.claims.filter((c) => c.confidence === "UNSUPPORTED");
}

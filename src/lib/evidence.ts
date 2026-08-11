/**
 * 근거 추적 — 보고서에 쓰인 수치가 실제 업로드 자료에 있는 값인지 되짚는다.
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
 *   - 이 파일: 보고서에 쓰인 숫자가 문서에 **있는지**
 *     (= AI가 없는 숫자를 지어내지 않았는지)
 *
 * 후자가 환각을 잡는 쪽이고, 심사역이 실제로 방어해야 하는 것도 이쪽이다.
 *
 * 한계(과장하지 말 것): 같은 숫자가 자료에 있다는 건 "추적 가능"이지
 * "해석이 맞다"는 뜻이 아니다. 그래서 라벨도 '문서 확인'이지 '검증 완료'가
 * 아니다. 반대로 자료 어디에도 없는 숫자는 확실히 사람이 봐야 한다.
 */

export type EvidenceStatus =
  /** 업로드한 자료 원문에 같은 값이 있음 */
  | "document"
  /** 딜 정보에 사용자가 직접 입력한 값 (투자금액·밸류) */
  | "deal"
  /** 어느 자료에도 없음 — 사람이 확인해야 함 */
  | "unverified";

export interface NumericClaim {
  sectionKey: string;
  /** 보고서 원문 표기 (예: "45억원") */
  raw: string;
  /** 숫자 앞 문맥에서 뽑은 라벨 (예: "ARR") */
  label: string;
  /** 콤마·꼬리 0을 정리한 비교용 값 */
  value: string;
  unit: string;
  status: EvidenceStatus;
  /** status === "document" 일 때 근거 문서명과 원문 발췌 */
  source?: { documentName: string; snippet: string };
}

export interface EvidenceReport {
  claims: NumericClaim[];
  totals: {
    checked: number;
    document: number;
    deal: number;
    unverified: number;
  };
  /** 추적 가능한 수치 비율 (0~100) */
  coverage: number;
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

/**
 * 자료에 등장하는 모든 숫자를 값 → 출처로 색인한다.
 *
 * 부분 문자열 비교(예: 보고서의 "45"가 자료의 "1450"에 걸리는 것)를 피하려고
 * 토큰 단위로 정확히 맞춘다.
 */
function indexDocumentNumbers(
  documents: Array<{ name: string; parsedText: string | null }>
): Map<string, { documentName: string; snippet: string }> {
  const index = new Map<string, { documentName: string; snippet: string }>();

  for (const doc of documents) {
    const text = doc.parsedText;
    if (!text) continue;

    NUMBER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMBER_RE.exec(text)) !== null) {
      const value = normalizeNumber(m[0]);
      if (!value || index.has(value)) continue;

      const from = Math.max(0, m.index - 40);
      const to = Math.min(text.length, m.index + m[0].length + 40);
      const snippet = text.slice(from, to).replace(/\s+/g, " ").trim();

      index.set(value, {
        documentName: doc.name,
        snippet: (from > 0 ? "…" : "") + snippet + (to < text.length ? "…" : ""),
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
function extractClaims(sectionKey: string, content: string): NumericClaim[] {
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

    claims.push({
      sectionKey,
      raw: raw.trim(),
      label: labelBefore(body, m.index),
      value,
      unit,
      status: "unverified",
    });
  }

  return claims;
}

export function traceReportEvidence(
  sections: Array<{ sectionKey: string; content: string }>,
  documents: Array<{ name: string; parsedText: string | null }>,
  dealFacts: { investAmount?: number | null; valuation?: number | null } = {}
): EvidenceReport {
  const documentIndex = indexDocumentNumbers(documents);

  // 딜 등록 시 사용자가 직접 넣은 값은 자료에 없어도 근거가 있는 셈이다
  const dealValues = new Set<string>();
  if (dealFacts.investAmount != null)
    dealValues.add(normalizeNumber(String(dealFacts.investAmount)));
  if (dealFacts.valuation != null)
    dealValues.add(normalizeNumber(String(dealFacts.valuation)));

  const claims = sections.flatMap((s) => extractClaims(s.sectionKey, s.content));

  for (const claim of claims) {
    const hit = documentIndex.get(claim.value);
    if (hit) {
      claim.status = "document";
      claim.source = hit;
    } else if (dealValues.has(claim.value)) {
      claim.status = "deal";
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

  // 확인이 필요한 것부터 위로 — 심사역이 먼저 봐야 할 순서다
  const rank: Record<EvidenceStatus, number> = {
    unverified: 0,
    deal: 1,
    document: 2,
  };
  claims.sort((a, b) => rank[a.status] - rank[b.status]);

  return { claims, totals, coverage };
}

/**
 * PE DD AI Fact — 중복 제거 + 충돌 감지(PR-I, hardened in PR-I.1 §21~§23).
 *
 * 순수 함수만 있다 — DB/네트워크/AI 호출 없음, Date.now()/Math.random() 없음.
 * "같은 fact가 두 번 추출됨"(dedupe)과 "서로 다른 source가 다른 값을
 * 보고함"(conflict)을 구분한다 — 후자는 절대 하나를 임의로 지우거나 평균
 * 내지 않는다(§21, §28).
 *
 * PR-I.1 수정(Finding #4, adversarial review): 기존 dedupeKey는 `unit`을
 * 포함하지 않아 "10 USD million"과 "10 USD billion"(실제로는 1000배 차이)이
 * value/currency만 같으면 완전히 동일한 fact로 취급돼 하나가 조용히
 * 사라졌다(실증됨). 이제 `unit`(정규화된 값, normalizedUnit)을 dedupe
 * key에 포함하고, value/currency는 같지만 unit만 다른 경우를
 * UNIT_MISMATCH conflict로 명시적으로 남긴다 — 두 fact 모두 보존한다.
 *
 * 결정론(§17, §24): "첫 등장 우선(first occurrence wins)"은 이 함수
 * 자체가 순수·결정론적이라는 뜻이지, 호출자가 넘기는 배열 순서 자체까지
 * 이 함수가 통제할 수 있다는 뜻은 아니다 — 호출자가 항상 같은 순서로
 * fact를 모아 넘겨야 재현 가능한 결과가 보장된다(예: 여러 문서를 병렬
 * 추출한 뒤 Promise.all로 합칠 때 완료 순서가 아니라 안정적인 키로 미리
 * 정렬해서 넘길 것). 이 함수는 입력 순서를 임의로 재정렬하지 않는다 —
 * PR-I.1 검토에서 "provenance precedence를 바꿀 위험이 있는 재정렬은
 * 하지 않는다"는 원칙을 그대로 따른 것이다.
 */

import type { PEFactCandidate, PEFactConflict, PEFactConflictType } from "./pe-fact-types";

/** dedupe key — source/metric/period/value/currency/**unit**이 전부 같으면
 * "같은 사실이 두 번 추출됨"으로 본다(§21, PR-I.1에서 unit 추가). */
function dedupeKey(fact: PEFactCandidate): string {
  return [
    fact.sourceEvidenceId,
    fact.metric,
    fact.fiscalYear ?? "?",
    fact.normalizedPeriodType ?? "?",
    fact.value,
    fact.currency ?? "?",
    fact.normalizedUnit ?? fact.unit ?? "?",
  ].join("|");
}

/** conflict key — source/value/unit은 빼고 metric+period(+factType)만으로
 * 묶는다. 같은 metric+period에 서로 다른 값/통화/단위가 있으면 conflict
 * 후보다(§22, PR-I.1에서 unit 비교 추가). */
function conflictKey(fact: PEFactCandidate): string {
  return [fact.factType, fact.metric, fact.fiscalYear ?? "?", fact.normalizedPeriodType ?? "?"].join("|");
}

export interface ReconcileFactsResult {
  /** 중복은 제거되었지만 충돌은 그대로 남아있는 목록(둘 다 보존 — 임의 삭제 없음) */
  facts: PEFactCandidate[];
  conflicts: PEFactConflict[];
}

/** conflict id는 conflictKey 기반으로 결정론적으로 만든다(호출 순서·난수 의존 없음). */
function buildConflictId(key: string): string {
  return `conflict_${key.replace(/\|/g, "_")}`;
}

/**
 * VALIDATED(또는 NEEDS_REVIEW) 상태의 fact만 넘긴다 — INVALID는 애초에
 * 조정 대상이 아니다(호출자가 미리 걸러야 함).
 */
export function reconcileFacts(facts: PEFactCandidate[]): ReconcileFactsResult {
  // 1) dedupe — 정확히 같은 (source, metric, period, value, currency, unit)는
  //    입력 순서상 첫 번째만 남긴다(결정론적 — 무작위 선택 없음).
  const seenDedupe = new Set<string>();
  const deduped: PEFactCandidate[] = [];
  for (const fact of facts) {
    const key = dedupeKey(fact);
    if (seenDedupe.has(key)) continue;
    seenDedupe.add(key);
    deduped.push(fact);
  }

  // 2) conflict — metric+period(+factType)로 묶어 값/통화/단위가 갈리면 전부 보존하고 flag만 남긴다.
  const groups = new Map<string, PEFactCandidate[]>();
  for (const fact of deduped) {
    const key = conflictKey(fact);
    const arr = groups.get(key) ?? [];
    arr.push(fact);
    groups.set(key, arr);
  }

  const conflicts: PEFactConflict[] = [];
  for (const [key, group] of Array.from(groups)) {
    if (group.length < 2) continue;
    const distinctValues = new Set(group.map((f) => f.value));
    const distinctCurrencies = new Set(group.map((f) => f.currency ?? "?"));
    const distinctUnits = new Set(group.map((f) => f.normalizedUnit ?? f.unit ?? "?"));
    if (distinctValues.size <= 1 && distinctCurrencies.size <= 1 && distinctUnits.size <= 1) continue; // 완전히 같은 값 = conflict 아님

    const first = group[0];
    let conflictType: PEFactConflictType;
    if (distinctCurrencies.size > 1) conflictType = "CURRENCY_MISMATCH";
    else if (distinctValues.size > 1) conflictType = "VALUE_MISMATCH";
    else conflictType = "UNIT_MISMATCH"; // 값·통화는 같은데 unit만 다름(§4 Case F/G)

    conflicts.push({
      id: buildConflictId(key),
      factIds: group.map((f) => f.id),
      conflictType,
      metric: first.metric,
      fiscalYear: first.fiscalYear ?? 0,
      periodType: first.normalizedPeriodType ?? "?",
      resolutionStatus: "UNRESOLVED", // AI가 자동으로 RESOLVED하지 않는다(§23)
    });
  }

  return { facts: deduped, conflicts };
}

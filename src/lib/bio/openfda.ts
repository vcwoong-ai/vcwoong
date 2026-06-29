/**
 * OpenFDA API client — 미국 FDA 허가 의약품 데이터.
 * 완전 무료, 인증 불필요 (rate limit: 240 req/min).
 * https://open.fda.gov/apis/
 */

const BASE = "https://api.fda.gov";

export interface FdaApprovedDrug {
  brandName: string;
  genericName: string;
  company: string;
  approvalDate: string;
  indication: string;
  route: string;
  url: string;
}

export interface FdaAdverseEvent {
  term: string;
  count: number;
}

/**
 * 특정 약물명/적응증으로 FDA 승인 의약품 검색.
 * @param query  검색어 (예: "lung cancer", "PD-1")
 * @param limit  최대 결과 수
 */
export async function searchFdaApprovedDrugs(
  query: string,
  limit = 5
): Promise<FdaApprovedDrug[]> {
  try {
    // 적응증 또는 약물 분류로 검색
    const searchQuery = encodeURIComponent(
      `patient.drug.drugindication:"${query}" OR openfda.pharm_class_epc:"${query}"`
    );
    const url = `${BASE}/drug/event.json?search=${searchQuery}&count=openfda.brand_name.exact&limit=${limit}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: Array<{ term: string; count: number }> };
    const brands = data.results ?? [];

    // FDA NDA/BLA 데이터베이스에서 승인 정보 조회
    const drugs: FdaApprovedDrug[] = [];
    for (const brand of brands.slice(0, limit)) {
      try {
        const ndaUrl = `${BASE}/drug/drugsfda.json?search=openfda.brand_name:"${encodeURIComponent(brand.term)}"&limit=1`;
        const ndaRes = await fetch(ndaUrl, { signal: AbortSignal.timeout(5000) });
        if (!ndaRes.ok) continue;

        const ndaData = (await ndaRes.json()) as { results?: unknown[] };
        const result = (ndaData.results?.[0] ?? {}) as Record<string, unknown>;
        const openFda = (result.openfda ?? {}) as Record<string, string[]>;

        const submissions = (result.submissions as Array<Record<string, string>>)?.[0] ?? {};

        drugs.push({
          brandName: openFda.brand_name?.[0] ?? brand.term,
          genericName: openFda.generic_name?.[0] ?? "",
          company: openFda.manufacturer_name?.[0] ?? "",
          approvalDate: submissions.submission_status_date?.slice(0, 10) ?? "",
          indication: openFda.pharm_class_epc?.[0] ?? "",
          route: openFda.route?.[0] ?? "",
          url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${result.application_number ?? ""}`,
        });
      } catch {
        continue;
      }
    }
    return drugs;
  } catch {
    return [];
  }
}

/**
 * 특정 적응증(indication)의 FDA 승인 약물을 직접 검색.
 * 더 빠르고 안정적인 방법.
 */
export async function searchFdaDrugsByIndication(
  indication: string,
  limit = 5
): Promise<FdaApprovedDrug[]> {
  try {
    const url = `${BASE}/drug/drugsfda.json?search=openfda.pharm_class_epc:"${encodeURIComponent(indication)}"&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: unknown[] };
    const results = data.results ?? [];

    return results.map((r: unknown) => {
      const result = r as Record<string, unknown>;
      const openFda = (result.openfda ?? {}) as Record<string, string[]>;
      const submissions = (result.submissions as Array<Record<string, string>>)?.[0] ?? {};
      return {
        brandName: openFda.brand_name?.[0] ?? "N/A",
        genericName: openFda.generic_name?.[0] ?? "",
        company: openFda.manufacturer_name?.[0] ?? "",
        approvalDate: submissions.submission_status_date?.slice(0, 10) ?? "",
        indication: openFda.pharm_class_epc?.[0] ?? "",
        route: openFda.route?.[0] ?? "",
        url: `https://www.fda.gov/`,
      };
    });
  } catch {
    return [];
  }
}

/** FDA 데이터를 IC 보고서용 한국어 포맷으로 변환 */
export function formatFdaForPrompt(drugs: FdaApprovedDrug[], indication: string): string {
  if (drugs.length === 0) return "";

  const rows = drugs
    .map(
      (d) =>
        `| ${d.brandName} | ${d.genericName} | ${d.company} | ${d.approvalDate || "N/A"} | ${d.route || "N/A"} |`
    )
    .join("\n");

  return `\n\n## FDA 승인 경쟁 약물 (${indication} 관련, ${drugs.length}건)\n| 상품명 | 성분명 | 제조사 | FDA 승인일 | 투여경로 |\n|--------|--------|--------|-----------|--------|\n${rows}`;
}

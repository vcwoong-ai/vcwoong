/**
 * 외부 바이오 데이터 통합 페처.
 * 업로드된 IR 덱 텍스트에서 키워드를 추출하고
 * PubMed / ClinicalTrials.gov / OpenFDA를 병렬 조회한다.
 */

import { searchPubMed, formatPubMedForPrompt } from "./pubmed";
import { searchClinicalTrials, formatClinicalTrialsForPrompt } from "./clinical-trials";
import { searchFdaDrugsByIndication, formatFdaForPrompt } from "./openfda";

export interface BioExternalData {
  pubmedArticles: Awaited<ReturnType<typeof searchPubMed>>;
  clinicalTrials: Awaited<ReturnType<typeof searchClinicalTrials>>;
  fdaDrugs: Awaited<ReturnType<typeof searchFdaDrugsByIndication>>;
  indication: string;
  companyQuery: string;
}

/**
 * 문서 텍스트에서 주요 적응증 키워드를 추출.
 * Phase, 임상, 항암, 질환명 등을 탐지한다.
 */
export function extractBioKeywords(
  documentText: string,
  companyName: string
): { indication: string; drugKeyword: string; companyQuery: string } {
  const text = documentText.toLowerCase();

  // 한국어 적응증 패턴 → 영문 검색어 매핑
  const indicationMap: Array<{ pattern: RegExp; en: string; ko: string }> = [
    { pattern: /폐암|lung cancer/i, en: "lung cancer", ko: "폐암" },
    { pattern: /유방암|breast cancer/i, en: "breast cancer", ko: "유방암" },
    { pattern: /위암|gastric cancer/i, en: "gastric cancer", ko: "위암" },
    { pattern: /간암|hepatocellular/i, en: "hepatocellular carcinoma", ko: "간암" },
    { pattern: /대장암|colorectal/i, en: "colorectal cancer", ko: "대장암" },
    { pattern: /췌장암|pancreatic/i, en: "pancreatic cancer", ko: "췌장암" },
    { pattern: /혈액암|leukemia|lymphoma/i, en: "leukemia lymphoma", ko: "혈액암" },
    { pattern: /고형암|solid tumor/i, en: "solid tumor oncology", ko: "고형암" },
    { pattern: /당뇨|diabetes/i, en: "diabetes mellitus", ko: "당뇨" },
    { pattern: /알츠하이머|alzheimer/i, en: "alzheimer disease", ko: "알츠하이머" },
    { pattern: /파킨슨|parkinson/i, en: "parkinson disease", ko: "파킨슨" },
    { pattern: /자가면역|autoimmune/i, en: "autoimmune disease", ko: "자가면역질환" },
    { pattern: /류마티스|rheumatoid/i, en: "rheumatoid arthritis", ko: "류마티스관절염" },
    { pattern: /항암|oncology|cancer/i, en: "oncology cancer treatment", ko: "항암" },
  ];

  let indication = "oncology";
  let indicationKo = "항암";
  for (const { pattern, en, ko } of indicationMap) {
    if (pattern.test(text)) {
      indication = en;
      indicationKo = ko;
      break;
    }
  }

  // 약물/기전 키워드
  const drugPatternMap: Array<[RegExp, string]> = [
    [/pd-1|pd-l1|checkpoint/i, "PD-1 checkpoint inhibitor"],
    [/car-t|cell therapy/i, "CAR-T cell therapy"],
    [/adc|antibody.drug conjugate/i, "antibody drug conjugate ADC"],
    [/mrna|rna therapy/i, "mRNA therapy"],
    [/small molecule|저분자/i, "small molecule"],
    [/monoclonal antibody|단클론항체/i, "monoclonal antibody"],
  ];
  const drugKeyword =
    drugPatternMap.find(([pattern]) => pattern.test(text))?.[1] ?? indication;

  // 회사명 기반 PubMed 쿼리
  const companyShort = companyName
    .replace(/inc\.|co\.|corp\.|ltd\.|주식회사|㈜|\(주\)/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");

  return {
    indication,
    drugKeyword,
    companyQuery: `${companyShort} ${indicationKo}`,
  };
}

/**
 * 회사명 + 문서에서 추출한 키워드로 3개 API를 병렬 조회.
 * 각 API는 독립적으로 실패해도 전체에 영향 없음.
 */
export async function fetchBioExternalData(
  companyName: string,
  documentText: string
): Promise<BioExternalData> {
  const { indication, drugKeyword, companyQuery } = extractBioKeywords(
    documentText,
    companyName
  );

  console.log(`[BioData] 키워드: indication="${indication}", drug="${drugKeyword}"`);

  // 병렬 조회 (실패해도 빈 배열 반환)
  const [pubmedArticles, clinicalTrials, fdaDrugs] = await Promise.allSettled([
    searchPubMed(`${indication} clinical trial phase 2 3`, 5),
    searchClinicalTrials(`${indication} ${drugKeyword}`, 5),
    searchFdaDrugsByIndication(indication.split(" ")[0], 5),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : []))
  ) as [
    Awaited<ReturnType<typeof searchPubMed>>,
    Awaited<ReturnType<typeof searchClinicalTrials>>,
    Awaited<ReturnType<typeof searchFdaDrugsByIndication>>,
  ];

  console.log(
    `[BioData] PubMed ${pubmedArticles.length}건 | ClinicalTrials ${clinicalTrials.length}건 | FDA ${fdaDrugs.length}건`
  );

  return { pubmedArticles, clinicalTrials, fdaDrugs, indication, companyQuery };
}

/** 외부 데이터를 프롬프트 주입용 단일 텍스트로 조합 */
export function formatExternalDataForPrompt(data: BioExternalData): string {
  const sections: string[] = [];

  if (data.clinicalTrials.length > 0) {
    sections.push(formatClinicalTrialsForPrompt(data.clinicalTrials));
  }
  if (data.pubmedArticles.length > 0) {
    sections.push(formatPubMedForPrompt(data.pubmedArticles));
  }
  if (data.fdaDrugs.length > 0) {
    sections.push(formatFdaForPrompt(data.fdaDrugs, data.indication));
  }

  if (sections.length === 0) return "";

  return `\n\n${"=".repeat(60)}\n## 🔬 실시간 외부 데이터 (자동 조회)\n${sections.join("")}\n${"=".repeat(60)}\n위 데이터를 분석에 반드시 참고하고 인용하세요.`;
}

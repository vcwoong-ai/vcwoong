import type { BioExternalData } from "./external-data";
import { formatClinicalTrialsForPrompt } from "./clinical-trials";
import { formatPubMedForPrompt } from "./pubmed";
import { formatFdaForPrompt } from "./openfda";
import { formatRNPVTable, calculateRNPV, type PipelineAsset } from "./rnpv";

export function buildBioAppendix(
  externalData: BioExternalData | null,
  pipelineAssets: PipelineAsset[],
  companyName: string
): string {
  const sections: string[] = [`# ${companyName} — Dr. Cell 분석 부록\n`];

  if (pipelineAssets.length > 0) {
    const rnpv = calculateRNPV(pipelineAssets);
    sections.push("## A. rNPV 산출표\n" + formatRNPVTable(rnpv));
  }

  if (externalData) {
    if (externalData.clinicalTrials.length > 0) {
      sections.push("## B. ClinicalTrials.gov 경쟁 임상\n" + formatClinicalTrialsForPrompt(externalData.clinicalTrials));
    }
    if (externalData.pubmedArticles.length > 0) {
      sections.push("## C. PubMed 참고문헌\n" + formatPubMedForPrompt(externalData.pubmedArticles));
    }
    if (externalData.fdaDrugs.length > 0) {
      sections.push("## D. FDA 승인 경쟁약물\n" + formatFdaForPrompt(externalData.fdaDrugs, externalData.indication));
    }
    sections.push(
      `\n---\n*데이터 출처: PubMed (NCBI), ClinicalTrials.gov v2, OpenFDA — ${new Date().toLocaleDateString("ko-KR")} 자동 조회*`
    );
  } else {
    sections.push("\n*외부 데이터 조회 결과 없음 — IR 자료 기반 분석만 포함*");
  }

  return sections.join("\n\n");
}

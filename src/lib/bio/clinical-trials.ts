/**
 * ClinicalTrials.gov API v2 client.
 * 완전 무료, 인증 불필요.
 * https://clinicaltrials.gov/data-api/api
 */

const BASE = "https://clinicaltrials.gov/api/v2";

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  conditions: string[];
  interventions: string[];
  sponsor: string;
  startDate: string;
  primaryCompletion: string;
  enrollment: number;
  url: string;
}

const STATUS_KO: Record<string, string> = {
  "RECRUITING": "모집 중",
  "ACTIVE_NOT_RECRUITING": "진행 중 (모집 완료)",
  "COMPLETED": "완료",
  "NOT_YET_RECRUITING": "모집 예정",
  "TERMINATED": "조기 종료",
  "WITHDRAWN": "철회",
  "SUSPENDED": "중단",
  "ENROLLING_BY_INVITATION": "초청 모집 중",
};

const PHASE_KO: Record<string, string> = {
  "PHASE1": "Phase I",
  "PHASE2": "Phase II",
  "PHASE3": "Phase III",
  "PHASE4": "Phase IV",
  "EARLY_PHASE1": "Phase I 이전",
  "NA": "해당 없음",
};

/**
 * 적응증 또는 약물명으로 임상시험 검색.
 * @param query 검색어 (예: "lung cancer immunotherapy")
 * @param maxResults 최대 결과 수
 */
export async function searchClinicalTrials(
  query: string,
  maxResults = 5
): Promise<ClinicalTrial[]> {
  try {
    const params = new URLSearchParams({
      "query.term": query,
      pageSize: String(maxResults),
      format: "json",
      fields: [
        "NCTId",
        "BriefTitle",
        "OverallStatus",
        "Phase",
        "Condition",
        "InterventionName",
        "LeadSponsorName",
        "StartDate",
        "PrimaryCompletionDate",
        "EnrollmentCount",
      ].join(","),
    });

    const res = await fetch(`${BASE}/studies?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { studies?: unknown[] };
    const studies = data.studies ?? [];

    return studies.map((s: unknown) => {
      const study = s as Record<string, unknown>;
      const protocol = (study.protocolSection ?? {}) as Record<string, unknown>;
      const idModule = (protocol.identificationModule ?? {}) as Record<string, unknown>;
      const statusModule = (protocol.statusModule ?? {}) as Record<string, unknown>;
      const designModule = (protocol.designModule ?? {}) as Record<string, unknown>;
      const conditionsModule = (protocol.conditionsModule ?? {}) as Record<string, unknown>;
      const armsModule = (protocol.armsInterventionsModule ?? {}) as Record<string, unknown>;
      const sponsorModule = (protocol.sponsorCollaboratorsModule ?? {}) as Record<string, unknown>;

      const phases = (designModule.phases as string[]) ?? [];
      const interventions = ((armsModule.interventions as unknown[]) ?? [])
        .map((i) => (i as Record<string, string>).name ?? "")
        .filter(Boolean)
        .slice(0, 3);

      const nctId = String(idModule.nctId ?? "");
      return {
        nctId,
        title: String(idModule.briefTitle ?? ""),
        status: STATUS_KO[String(statusModule.overallStatus ?? "")] ?? String(statusModule.overallStatus ?? ""),
        phase: phases.map((p) => PHASE_KO[p] ?? p).join(", ") || "N/A",
        conditions: ((conditionsModule.conditions as string[]) ?? []).slice(0, 3),
        interventions,
        sponsor: String((sponsorModule.leadSponsor as Record<string, string>)?.name ?? ""),
        startDate: String(statusModule.startDateStruct ? (statusModule.startDateStruct as Record<string, string>).date : ""),
        primaryCompletion: String(statusModule.primaryCompletionDateStruct ? (statusModule.primaryCompletionDateStruct as Record<string, string>).date : ""),
        enrollment: Number((designModule.enrollmentInfo as Record<string, unknown>)?.count ?? 0),
        url: `https://clinicaltrials.gov/study/${nctId}`,
      };
    });
  } catch {
    return [];
  }
}

/** 임상 목록을 IC 보고서용 한국어 요약 텍스트로 포맷 */
export function formatClinicalTrialsForPrompt(trials: ClinicalTrial[]): string {
  if (trials.length === 0) return "";

  const rows = trials
    .map(
      (t) =>
        `| ${t.nctId} | ${t.title.slice(0, 50)}... | ${t.phase} | ${t.status} | ${t.sponsor} | ${t.enrollment ? t.enrollment + "명" : "N/A"} |`
    )
    .join("\n");

  return `\n\n## 관련 임상시험 (ClinicalTrials.gov, ${trials.length}건)\n| NCT번호 | 제목 | 임상단계 | 상태 | 스폰서 | 목표 피험자 |\n|---------|------|---------|------|--------|----------|\n${rows}`;
}

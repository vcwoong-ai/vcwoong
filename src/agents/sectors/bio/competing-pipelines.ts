const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";

export type ClinicalTrial = {
  nctId: string;
  title: string;
  sponsor: string;
  phase: string;
  status: string;
  startDate: string;
};

export async function searchClinicalTrials(
  condition: string,
  intervention?: string,
  phase?: string
): Promise<ClinicalTrial[]> {
  try {
    const params = new URLSearchParams({
      "query.cond": condition,
      pageSize: "20",
      format: "json",
    });
    if (intervention) params.append("query.intr", intervention);
    if (phase) params.append("filter.advanced", `AREA[Phase]${phase}`);

    const res = await fetch(`${CT_BASE}?${params}`, { signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as {
      studies?: {
        protocolSection?: {
          identificationModule?: { nctId?: string; briefTitle?: string };
          sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
          designModule?: { phases?: string[] };
          statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
        };
      }[];
    };

    return (data.studies ?? []).map((s) => ({
      nctId: s.protocolSection?.identificationModule?.nctId ?? "",
      title: s.protocolSection?.identificationModule?.briefTitle ?? "",
      sponsor: s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
      phase: s.protocolSection?.designModule?.phases?.join(", ") ?? "",
      status: s.protocolSection?.statusModule?.overallStatus ?? "",
      startDate: s.protocolSection?.statusModule?.startDateStruct?.date ?? "",
    }));
  } catch {
    return [];
  }
}

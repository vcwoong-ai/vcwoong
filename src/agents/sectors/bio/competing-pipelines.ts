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
  const params = new URLSearchParams({
    "query.cond": condition,
    pageSize: "20",
    format: "json",
  });
  if (intervention) params.append("query.intr", intervention);
  if (phase) params.append("filter.advanced", `AREA[Phase]${phase}`);

  try {
    const res = await fetch(`${CT_BASE}?${params}`, {
      next: { revalidate: 3600 },
    });
    const data = await res.json();

    return (data.studies || []).map((s: Record<string, unknown>) => {
      const proto = s.protocolSection as Record<string, Record<string, unknown>>;
      return {
        nctId: proto?.identificationModule?.nctId as string || "",
        title: proto?.identificationModule?.briefTitle as string || "",
        sponsor:
          (proto?.sponsorCollaboratorsModule?.leadSponsor as Record<string, string>)?.name || "",
        phase:
          ((proto?.designModule?.phases as string[]) || []).join(", "),
        status: proto?.statusModule?.overallStatus as string || "",
        startDate:
          (proto?.statusModule?.startDateStruct as Record<string, string>)?.date || "",
      };
    });
  } catch {
    return [];
  }
}

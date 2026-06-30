const OPENFDA_BASE = "https://api.fda.gov/drug/drugsfda.json";

export type DrugApproval = {
  brandName: string;
  genericName: string;
  applicant: string;
  approvalDate: string;
  indication: string;
};

export async function searchFDAApprovals(
  indication: string,
  _mechanism = "",
  limit = 5
): Promise<DrugApproval[]> {
  try {
    const query = encodeURIComponent(`indications_and_usage:"${indication}"`);
    const url = `${OPENFDA_BASE}?search=${query}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: {
        openfda?: { brand_name?: string[]; generic_name?: string[]; pharm_class_epc?: string[] };
        sponsor_name?: string;
        submissions?: { submission_status_date?: string }[];
      }[];
    };

    return (data.results ?? []).map((r) => ({
      brandName: r.openfda?.brand_name?.[0] ?? "",
      genericName: r.openfda?.generic_name?.[0] ?? "",
      applicant: r.sponsor_name ?? "",
      approvalDate: r.submissions?.[0]?.submission_status_date ?? "",
      indication: r.openfda?.pharm_class_epc?.[0] ?? indication,
    }));
  } catch {
    return [];
  }
}

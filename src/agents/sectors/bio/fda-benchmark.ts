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
  _mechanism: string,
  limit = 5
): Promise<DrugApproval[]> {
  const query = encodeURIComponent(`indications_and_usage:"${indication}"`);
  const url = `${OPENFDA_BASE}?search=${query}&limit=${limit}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((r: Record<string, unknown>) => ({
      brandName: (r.openfda as Record<string, string[]>)?.brand_name?.[0] || "",
      genericName: (r.openfda as Record<string, string[]>)?.generic_name?.[0] || "",
      applicant: (r as Record<string, string>).sponsor_name || "",
      approvalDate:
        (r.submissions as Array<Record<string, string>>)?.[0]
          ?.submission_status_date || "",
      indication:
        (r.openfda as Record<string, string[]>)?.pharm_class_epc?.[0] ||
        indication,
    }));
  } catch {
    return [];
  }
}

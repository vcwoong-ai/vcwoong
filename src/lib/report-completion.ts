/** Exporting a draft is distinct from completing its review. */
export function isReportFinalized(
  status: string | undefined,
  sections: ReadonlyArray<{ status: string }>
): boolean {
  return (
    (status === "FINAL" || status === "EXPORTED") &&
    sections.length > 0 &&
    sections.every((section) => section.status === "APPROVED")
  );
}

export interface ReportTableSeries {
  label: string;
  unit: string;
  points: Array<{ period: string; value: number | null }>;
  relativePeriods: boolean;
}

export interface ReportTableAnalysis {
  series: ReportTableSeries[];
  skipped: number;
}

/** Presentation only: accept explicit annual columns and a unit on each row.
 * Never infer units, fill gaps, strip uncertainty markers, or aggregate values.
 * Original Markdown remains the source of truth beside every chart.
 */
export function reportTableSeries(content: string): ReportTableSeries[] {
  return analyzeReportTables(content).series;
}

export function analyzeReportTables(content: string): ReportTableAnalysis {
  const lines = content.split(/\r?\n/);
  const series: ReportTableSeries[] = [];
  let skipped = 0;
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  let fenced = false;
  for (let index = 0; index < lines.length - 1; index++) {
    if (/^\s*(```|~~~)/.test(lines[index])) { fenced = !fenced; continue; }
    if (fenced || !lines[index].includes("|")) continue;
    const header = cells(lines[index]);
    const separator = cells(lines[index + 1]);
    if (header.length < 3 || separator.length !== header.length || !separator.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
    const relativePeriods = header.slice(1).every(cell => /^FY(?:[+-]\d+)?$/.test(cell));
    if (!relativePeriods && !header.slice(1).every(cell => /^(19|20)\d{2}년?$/.test(cell))) { skipped++; continue; }
    if (new Set(header.slice(1).map(cell => cell.replace(/년$/, ""))).size !== header.length - 1) continue;
    for (let row = index + 2; row < lines.length && lines[row].includes("|"); row++) {
      const values = cells(lines[row]);
      if (values.length !== header.length) continue;
      const unit = values[0].match(/\((억원|백만원|천원|원|%|명|건)\)\s*$/)?.[1];
      if (!unit) { skipped++; continue; }
      const points = header.slice(1).map((period, column) => {
        const raw = values[column + 1];
        const numeric = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw) ? Number(raw.replace(/,/g, "")) : NaN;
        return { period, value: Number.isFinite(numeric) ? numeric : null };
      });
      if (points.filter(point => point.value !== null).length < 2) { skipped++; continue; }
      series.push({ label: values[0], unit, points, relativePeriods });
      if (series.length === 4) return { series, skipped };
    }
  }
  return { series, skipped };
}

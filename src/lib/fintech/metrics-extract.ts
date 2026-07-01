import type { FintechMetrics } from "@/agents/sectors/fintech/fintech-metrics";

export function extractFintechMetricsFromText(text: string): FintechMetrics {
  const metrics: FintechMetrics = {};

  const tpv = text.match(/TPV\s*([\d,.]+)\s*억/i);
  if (tpv) metrics.tpv = parseFloat(tpv[1].replace(/,/g, ""));

  const take = text.match(/[Tt]ake\s*[Rr]ate\s*([\d.]+)\s*%/i);
  if (take) metrics.takeRate = parseFloat(take[1]);

  const npl = text.match(/NPL\s*([\d.]+)\s*%/i);
  if (npl) metrics.npl = parseFloat(npl[1]);

  const aum = text.match(/AUM\s*([\d,.]+)\s*억/i);
  if (aum) metrics.aum = parseFloat(aum[1].replace(/,/g, ""));

  const mau = text.match(/MAU\s*([\d,.]+)\s*만/i);
  if (mau) metrics.mau = parseFloat(mau[1].replace(/,/g, ""));

  return metrics;
}

export function formatFintechAnalysisForPrompt(text: string): string {
  const m = extractFintechMetricsFromText(text);
  const parts: string[] = [];

  if (m.tpv) parts.push(`- TPV: ${m.tpv}억원/년`);
  if (m.takeRate) parts.push(`- Take Rate: ${m.takeRate}%`);
  if (m.npl) parts.push(`- NPL: ${m.npl}%`);
  if (m.aum) parts.push(`- AUM: ${m.aum}억원`);
  if (m.mau) parts.push(`- MAU: ${m.mau}만명`);

  if (parts.length === 0) return "";

  return `\n\n## 💰 Vault 에이전트 — 핀테크 지표 자동 추출\n${parts.join("\n")}\n`;
}

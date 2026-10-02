/** 대시보드 집계. DB 와 분리된 순수 함수라 테스트로 숫자를 검증한다. */

export interface ResponseRow {
  answer_label: string;
  other_text: string | null;
  amount: number | null;
  created_at: Date | string;
}

export interface ChannelStat {
  label: string;
  count: number;
  share: number;
  revenue: number;
  /** 금액이 확인된 주문 수 (객단가 계산 기준) */
  revenueOrders: number;
  avgOrder: number | null;
}

export interface Summary {
  total: number;
  revenue: number;
  channels: ChannelStat[];
  daily: { date: string; count: number }[];
  otherTexts: { text: string; count: number }[];
}

/** 한국 시간 기준 날짜 문자열 (YYYY-MM-DD) */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function summarize(rows: ResponseRow[], days: number, now = new Date()): Summary {
  const byLabel = new Map<string, ChannelStat>();
  let revenue = 0;
  for (const r of rows) {
    let s = byLabel.get(r.answer_label);
    if (!s) {
      s = { label: r.answer_label, count: 0, share: 0, revenue: 0, revenueOrders: 0, avgOrder: null };
      byLabel.set(r.answer_label, s);
    }
    s.count++;
    if (typeof r.amount === "number") {
      s.revenue += r.amount;
      s.revenueOrders++;
      revenue += r.amount;
    }
  }
  const total = rows.length;
  const channels = Array.from(byLabel.values())
    .map((s) => ({
      ...s,
      share: total ? s.count / total : 0,
      avgOrder: s.revenueOrders ? Math.round(s.revenue / s.revenueOrders) : null,
    }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  const dayCounts = new Map<string, number>();
  for (const r of rows) {
    const key = kstDate(new Date(r.created_at));
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }
  const daily: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = kstDate(new Date(now.getTime() - i * 86400_000));
    daily.push({ date: key, count: dayCounts.get(key) || 0 });
  }

  const others = new Map<string, number>();
  for (const r of rows) {
    const t = (r.other_text || "").trim();
    if (t) others.set(t, (others.get(t) || 0) + 1);
  }
  const otherTexts = Array.from(others.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { total, revenue, channels, daily, otherTexts };
}

export function toCsv(rows: { created_at: Date | string; order_id: string; answer_label: string; other_text: string | null; amount: number | null; verified: boolean }[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["응답일시(KST)", "주문번호", "유입경로", "기타 응답", "결제금액(원)", "주문 확인"].join(",")];
  for (const r of rows) {
    const d = new Date(new Date(r.created_at).getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
    lines.push([d, r.order_id, r.answer_label, r.other_text ?? "", r.amount ?? "", r.verified ? "Y" : "N"].map(esc).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

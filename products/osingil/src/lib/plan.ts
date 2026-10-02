import { env } from "./env";
import { one } from "./db";

export interface PlanState {
  /** 무제한 사용 가능 여부 */
  unlimited: boolean;
  /** 화면 표시용 */
  label: string;
  monthCount: number;
  monthLimit: number | null;
  /** 이번 달 무료 한도 초과로 설문이 멈춘 상태 */
  paused: boolean;
  billing: "off" | "cafe24";
  expiresAt: Date | null;
}

/** 한국 시간 기준 이번 달 1일 0시의 UTC 시각 */
export function kstMonthStart(now = new Date()): Date {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600_000);
}

export async function planState(mallId: string): Promise<PlanState> {
  const row = await one<{ plan: string; plan_expires_at: Date | string | null; month_count: number }>(
    `SELECT m.plan, m.plan_expires_at,
       (SELECT count(*)::int FROM responses r WHERE r.mall_id = m.mall_id AND r.created_at >= $2) AS month_count
     FROM malls m WHERE m.mall_id = $1`,
    [mallId, kstMonthStart().toISOString()]
  );
  const monthCount = Number(row?.month_count ?? 0);
  if (env.billingMode === "off") {
    return { unlimited: true, label: "베타 (무료·무제한)", monthCount, monthLimit: null, paused: false, billing: "off", expiresAt: null };
  }
  const expiresAt = row?.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const pro = row?.plan === "pro" && !!expiresAt && expiresAt.getTime() > Date.now();
  if (pro) {
    return { unlimited: true, label: "Pro", monthCount, monthLimit: null, paused: false, billing: "cafe24", expiresAt };
  }
  const limit = env.freeMonthlyResponses;
  return { unlimited: false, label: "무료", monthCount, monthLimit: limit, paused: monthCount >= limit, billing: "cafe24", expiresAt: null };
}

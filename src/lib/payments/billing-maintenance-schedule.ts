import type { PrismaClient } from "@prisma/client";
import { BillingMaintenance, type BillingMaintenanceCounts, type BillingMaintenancePorts } from "./billing-maintenance";

export const BILLING_MAINTENANCE_STATE_ID = "billing-maintenance-v1";
const LEASE_MS = 180_000;
const COOLDOWN_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
export type ScheduledMaintenanceCounts = BillingMaintenanceCounts & { busy: number; backoff: number };
export class BillingScheduleUnavailable extends Error {
  constructor() { super("Billing scheduling unavailable"); this.name = "BillingScheduleUnavailable"; }
}
function emptyCounts(): ScheduledMaintenanceCounts {
  return { examined: 0, renewals: 0, reconciliations: 0, succeeded: 0, unknown: 0,
    held: 0, skipped: 0, failed: 0, budgetStopped: 0, busy: 0, backoff: 0 };
}

/** Private durable scan position and invocation throttle, not a financial reservation.
 * Each checkpoint is fenced and persisted before candidate work, including skipped candidates.
 * Existing intent leases still authorize provider/receipt operations. This cannot cancel an
 * already-issued request or atomically fence a process paused between ownership check and charge.
 * No provider construction, raw error logging, key reads or public references here.
 */
export class PrismaBillingMaintenanceSchedule {
  constructor(private readonly client: Pick<PrismaClient, "billingMaintenanceState">,
    private readonly ports: Omit<BillingMaintenancePorts, "schedule"> & { newId(): string }) {}

  async run(input: { batchLimit?: number; timeBudgetMs?: number } = {}): Promise<ScheduledMaintenanceCounts> {
    const batch = input.batchLimit ?? 2, budget = input.timeBudgetMs ?? 105_000;
    if (!Number.isInteger(batch) || batch < 1 || batch > 2 ||
        !Number.isInteger(budget) || budget < 1 || budget > 105_000) throw new BillingScheduleUnavailable();
    // No state claim or scan when the existing provider reservation cannot fit.
    if (budget < 70_000) return { ...emptyCounts(), budgetStopped: 1 };
    const clock = this.ports.monotonicMs ?? (() => performance.now());
    const started = clock();
    const date = () => {
      const now = this.ports.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new BillingScheduleUnavailable();
      return now;
    };
    const token = this.ports.newId();
    if (typeof token !== "string" || !token || token.length > 200) throw new BillingScheduleUnavailable();
    try {
      const now = date();
      await this.client.billingMaintenanceState.upsert({ where: { id: BILLING_MAINTENANCE_STATE_ID },
        create: { id: BILLING_MAINTENANCE_STATE_ID }, update: {} });
      const claimed = await this.client.billingMaintenanceState.updateMany({ where: {
        id: BILLING_MAINTENANCE_STATE_ID,
        AND: [
          { OR: [{ workerToken: null, leaseUntil: null }, { leaseUntil: { lte: now } }] },
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        ],
      }, data: { workerToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), lastStartedAt: now } });
      if (claimed.count !== 1) {
        const current = await this.client.billingMaintenanceState.findUnique({ where: { id: BILLING_MAINTENANCE_STATE_ID } });
        if (!current) throw new BillingScheduleUnavailable();
        const counts = emptyCounts();
        if (current.workerToken && current.leaseUntil && current.leaseUntil > date()) counts.busy = 1;
        else if (current.nextAttemptAt && current.nextAttemptAt > date()) counts.backoff = 1;
        else throw new BillingScheduleUnavailable(); // Invalid metadata does not silently reset ownership.
        return counts;
      }
      const state = await this.client.billingMaintenanceState.findFirst({ where: {
        id: BILLING_MAINTENANCE_STATE_ID, workerToken: token, leaseUntil: { gt: date() },
      } });
      if (!state || !Number.isInteger(state.failureStreak) || state.failureStreak < 0 || state.failureStreak > 16) throw new BillingScheduleUnavailable();
      const ownership = () => ({ id: BILLING_MAINTENANCE_STATE_ID, workerToken: token, leaseUntil: { gt: date() } });
      const finish = async (counts: BillingMaintenanceCounts) => {
        const completed = date();
        const failureStreak = counts.failed > 0 ? Math.min(16, state.failureStreak + 1) : 0;
        const delay = failureStreak > 0 ? Math.min(MAX_BACKOFF_MS, COOLDOWN_MS * 2 ** (failureStreak - 1)) : COOLDOWN_MS;
        const lastOutcome = counts.failed > 0 ? "FAILED" : counts.unknown > 0 ? "UNKNOWN" : counts.held > 0 ? "HELD" : "OK";
        const saved = await this.client.billingMaintenanceState.updateMany({ where: ownership(), data: {
          workerToken: null, leaseUntil: null, failureStreak, lastCompletedAt: completed, lastOutcome,
          nextAttemptAt: new Date(completed.getTime() + delay),
        } });
        if (saved.count !== 1) throw new BillingScheduleUnavailable();
      };
      let counts: BillingMaintenanceCounts;
      try {
        // Acquiring the durable state consumes the same invocation budget as candidate work.
        const elapsed = clock() - started;
        if (!Number.isFinite(elapsed) || elapsed < 0) throw new BillingScheduleUnavailable();
        const remainingBudget = Math.max(1, Math.floor(budget - elapsed));
        counts = await new BillingMaintenance({ ...this.ports, schedule: {
          state: { renewalCursor: state.renewalCursor ?? undefined,
            reconciliationCursor: state.reconciliationCursor ?? undefined, reconcileFirst: state.reconcileFirst },
          checkpoint: async ({ kind, cursor }) => {
            if (!cursor || cursor.length > 200) throw new BillingScheduleUnavailable();
            const saved = await this.client.billingMaintenanceState.updateMany({ where: ownership(), data: {
              ...(kind === "renew" ? { renewalCursor: cursor } : { reconciliationCursor: cursor }),
              reconcileFirst: kind === "renew",
            } });
            if (saved.count !== 1) throw new BillingScheduleUnavailable();
          },
          assertOwned: async () => {
            if (!await this.client.billingMaintenanceState.findFirst({ where: ownership(), select: { id: true } })) throw new BillingScheduleUnavailable();
          },
        } }).run({ ...input, timeBudgetMs: remainingBudget });
      } catch {
        // Preserve already-checkpointed progress and throttle a failed invocation if still owner.
        await finish({ ...emptyCounts(), failed: 1 });
        throw new BillingScheduleUnavailable();
      }
      await finish(counts);
      return { ...counts, busy: 0, backoff: 0 };
    } catch { throw new BillingScheduleUnavailable(); }
  }
}

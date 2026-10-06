import { BillingPolicyHold, type BillingLifecycle, type BillingOutcome } from "./billing-lifecycle";
import type { BillingMaintenanceCandidate, PrismaBillingRepository } from "./prisma-billing-repository";

export interface BillingMaintenanceCounts {
  examined: number; renewals: number; reconciliations: number; succeeded: number;
  unknown: number; held: number; skipped: number; failed: number; budgetStopped: number;
}
export interface BillingMaintenancePorts {
  repository: Pick<PrismaBillingRepository, "listReconciliationCandidates" | "listRenewalCandidates" | "getRenewalContext" | "getIntent">;
  lifecycle: Pick<BillingLifecycle, "prepare" | "execute">;
  now(): Date;
  /** Monotonic elapsed-time clock, separate from the calendar/UTC billing clock. */
  monotonicMs?: () => number;
  schedule?: {
    state: { renewalCursor?: string; reconciliationCursor?: string; reconcileFirst: boolean };
    checkpoint(input: { kind: "renew" | "reconcile"; cursor: string }): Promise<void>;
    assertOwned(): Promise<void>;
  };
}
const SCAN_LIMIT = 20;
const PROVIDER_RESERVATION_MS = 70_000;

/** Server-only bounded scheduler. No provider construction, environment reads or raw logging.
 * Reconciliation uses the persisted order only. Renewal prepares exactly the next canonical period.
 * An injected schedule persists cursors/priority across processes. Direct use retains runtime
 * cursors only. No stale period is charged in a catch-up loop.
 */
export class BillingMaintenance {
  private renewalCursor: string | undefined;
  private reconciliationCursor: string | undefined;
  private reconcileFirst = true;
  constructor(private readonly ports: BillingMaintenancePorts) {
    if (ports.schedule) {
      this.renewalCursor = ports.schedule.state.renewalCursor;
      this.reconciliationCursor = ports.schedule.state.reconciliationCursor;
      this.reconcileFirst = ports.schedule.state.reconcileFirst;
    }
  }

  private async assertOwned() {
    try { await this.ports.schedule?.assertOwned(); }
    catch { throw new MaintenanceOwnershipLost(); }
  }

  async run(input: { batchLimit?: number; timeBudgetMs?: number } = {}): Promise<BillingMaintenanceCounts> {
    const batchLimit = input.batchLimit ?? 2;
    const budget = input.timeBudgetMs ?? 105_000;
    if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 2 ||
        !Number.isInteger(budget) || budget < 1 || budget > 105_000) throw new BillingPolicyHold();
    const counts: BillingMaintenanceCounts = { examined: 0, renewals: 0, reconciliations: 0,
      succeeded: 0, unknown: 0, held: 0, skipped: 0, failed: 0, budgetStopped: 0 };
    const clock = this.ports.monotonicMs ?? (() => performance.now());
    const started = clock();
    const hasProviderBudget = () => {
      const elapsed = clock() - started;
      return Number.isFinite(elapsed) && elapsed >= 0 && budget - elapsed >= PROVIDER_RESERVATION_MS;
    };
    if (!hasProviderBudget()) { counts.budgetStopped = 1; return counts; }
    const now = this.ports.now();
    if (!Number.isFinite(now.getTime())) throw new BillingPolicyHold();
    let reconciliations: BillingMaintenanceCandidate[], renewals: BillingMaintenanceCandidate[];
    try {
      [reconciliations, renewals] = await Promise.all([
        this.ports.repository.listReconciliationCandidates(now, SCAN_LIMIT, this.reconciliationCursor),
        this.ports.repository.listRenewalCandidates(now, SCAN_LIMIT, this.renewalCursor),
      ]);
      if (renewals.length === 0 && this.renewalCursor) {
        this.renewalCursor = undefined;
        renewals = await this.ports.repository.listRenewalCandidates(now, SCAN_LIMIT);
      }
      if (reconciliations.length === 0 && this.reconciliationCursor) {
        this.reconciliationCursor = undefined;
        reconciliations = await this.ports.repository.listReconciliationCandidates(now, SCAN_LIMIT);
      }
    } catch { counts.failed = 1; return counts; }
    const first = this.reconcileFirst ? reconciliations : renewals;
    const second = this.reconcileFirst ? renewals : reconciliations;
    const firstKind = this.reconcileFirst ? "reconcile" : "renew";
    const queue: Array<{ kind: "reconcile" | "renew"; candidate: BillingMaintenanceCandidate }> = [];
    for (let index = 0; index < Math.max(first.length, second.length); index++) {
      if (first[index]) queue.push({ kind: firstKind, candidate: first[index] });
      if (second[index]) queue.push({ kind: firstKind === "reconcile" ? "renew" : "reconcile", candidate: second[index] });
    }
    let executions = 0;
    for (const item of queue) {
      if (executions >= batchLimit) break;
      if (!hasProviderBudget()) { counts.budgetStopped = 1; break; }
      counts.examined++;
      // Checkpoint before work: hard termination cannot pin the scan to this candidate.
      // Keep this outside the item catch so a lost scheduler lease stops the entire batch.
      await this.ports.schedule?.checkpoint({ kind: item.kind, cursor: item.candidate.id });
      if (item.kind === "renew") this.renewalCursor = item.candidate.id;
      else this.reconciliationCursor = item.candidate.id;
      this.reconcileFirst = item.kind === "renew";
      try {
        let intentId: string;
        if (item.kind === "reconcile") {
          const pending = await this.ports.repository.getIntent(item.candidate.id, item.candidate.userId);
          if (!pending || !["UNKNOWN", "PROCESSING"].includes(pending.status) || !pending.firstChargeAt ||
              (pending.leaseUntil && pending.leaseUntil > this.ports.now())) { counts.skipped++; continue; }
          intentId = pending.id;
        } else {
          const context = await this.ports.repository.getRenewalContext(item.candidate, this.ports.now());
          if (!context) { counts.skipped++; continue; }
          if (context.existingIntent) intentId = context.existingIntent.id;
          else {
            const current = context.subscription;
            // The repository checks last successful receipt amount too: unapproved catalog
            // price changes are held before any new intent/provider charge is created.
            await this.assertOwned();
            const prepared = await this.ports.lifecycle.prepare({ userId: current.userId,
              operation: "RENEWAL", plan: current.plan, cycle: current.cycle, anchor: current.anchor,
              periodIndex: current.paidThroughIndex + 1, customerRef: context.customerRef,
              paymentMethodRef: context.paymentMethodRef });
            intentId = prepared.id;
          }
        }
        // DB work also consumes the runtime budget. A persisted PREPARED intent can be picked
        // up later with its exact keys/price; never invent a new intent when time runs out.
        if (!hasProviderBudget()) { counts.budgetStopped = 1; break; }
        await this.assertOwned();
        executions++;
        if (item.kind === "reconcile") counts.reconciliations++; else counts.renewals++;
        this.countOutcome(counts, await this.ports.lifecycle.execute(intentId, item.candidate.userId));
      } catch (error) {
        if (error instanceof MaintenanceOwnershipLost) throw error;
        if (error instanceof BillingPolicyHold) counts.held++; else counts.failed++;
      }
    }
    return counts;
  }

  private countOutcome(counts: BillingMaintenanceCounts, outcome: BillingOutcome) {
    if (outcome === "SUCCEEDED") counts.succeeded++;
    else if (outcome === "UNKNOWN") counts.unknown++;
    else if (outcome === "HOLD") counts.held++;
    else counts.skipped++;
  }
}

class MaintenanceOwnershipLost extends Error {
  constructor() { super("Billing scheduling unavailable"); this.name = "MaintenanceOwnershipLost"; }
}

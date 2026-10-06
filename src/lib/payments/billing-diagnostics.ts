/** Aggregate-only PostgreSQL diagnostics. No providers, environment reads or application client. */
export interface BillingDiagnosticsTransaction {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}
export interface BillingDiagnosticsDatabase {
  $transaction<T>(callback: (tx: BillingDiagnosticsTransaction) => Promise<T>, options: {
    isolationLevel: "RepeatableRead"; timeout: number; maxWait: number;
  }): Promise<T>;
}
export const BILLING_DIAGNOSTIC_METRICS = ["intentHold", "intentUnknown", "intentProcessingExpired",
  "checkoutIssuanceExpired", "checkoutHold", "receiptPolicyHold", "renewalOverdue", "renewalMissedPeriod"] as const;
export const BILLING_DIAGNOSTIC_BLOCKERS = ["activeIntentLease", "unknownWithoutChargeTimestamp",
  "checkoutExpiredUnclaimed", "initialLegacyPlanConflict", "renewalCancelled", "renewalInvalidPeriod",
  "renewalUnresolvedIntent", "renewalMissingAppliedReceipt", "renewalRevokedMethod", "renewalStoredPriceMismatch",
  "maintenanceNeverStarted", "maintenanceLeaseExpired", "maintenanceCompletionDelayed", "maintenanceBackoffActive"] as const;
export const BILLING_DIAGNOSTIC_AGE_BUCKETS = ["under1h", "h1to24", "d1to7", "d7plus"] as const;
type Metric = typeof BILLING_DIAGNOSTIC_METRICS[number];
type Blocker = typeof BILLING_DIAGNOSTIC_BLOCKERS[number];
type AgeBucket = typeof BILLING_DIAGNOSTIC_AGE_BUCKETS[number];
export interface BillingDiagnosticsReport {
  status: "READ_ONLY_SNAPSHOT"; activation: "HELD"; asOf: string; providerVerified: false;
  counts: Record<Metric, number>;
  ageBuckets: Record<Metric, Record<AgeBucket, number>>;
  blockers: Record<Blocker, number>;
  limitations: string[];
}
export class BillingDiagnosticsUnavailable extends Error {
  constructor() { super("Billing diagnostics unavailable"); this.name = "BillingDiagnosticsUnavailable"; }
}
interface AggregateRow { metric: string; age_bucket: string; total: bigint | number }
function safeCount(value: bigint | number): number {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(result) || result < 0) throw new BillingDiagnosticsUnavailable();
  return result;
}

/** Canonical boundaries are computed directly from the original UTC timestamp and month index:
 * PostgreSQL anchor + interval clamps the original day once, matching billingPeriodUTC.
 * Only aggregate values cross this boundary. HOLD age is creation age, not time since transition.
 * The fixed SET statements protect the transaction; they do not mutate application data.
 */
export async function inspectBillingDiagnostics(db: BillingDiagnosticsDatabase, options: { now?: Date } = {}): Promise<BillingDiagnosticsReport> {
  const now = options.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new BillingDiagnosticsUnavailable();
  try {
    const rows = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '10000ms'`;
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return tx.$queryRaw<AggregateRow[]>`
WITH moment AS (SELECT ${now}::timestamp AS now),
due AS (
  SELECT s.*,
    CASE WHEN s."cycle" IN ('monthly', 'yearly') AND s."paidThroughIndex" BETWEEN 0 AND 1198
         AND extract(year FROM s."anchor") BETWEEN 1970 AND 9999
      THEN s."anchor" + make_interval(months => s."paidThroughIndex" * CASE WHEN s."cycle" = 'yearly' THEN 12 ELSE 1 END) END AS canonical_start,
    CASE WHEN s."cycle" IN ('monthly', 'yearly') AND s."paidThroughIndex" BETWEEN 0 AND 1198
         AND extract(year FROM s."anchor") BETWEEN 1970 AND 9999
      THEN s."anchor" + make_interval(months => (s."paidThroughIndex" + 1) * CASE WHEN s."cycle" = 'yearly' THEN 12 ELSE 1 END) END AS canonical_end,
    CASE WHEN s."cycle" IN ('monthly', 'yearly') AND s."paidThroughIndex" BETWEEN 0 AND 1198
         AND extract(year FROM s."anchor") BETWEEN 1970 AND 9999
      THEN s."anchor" + make_interval(months => (s."paidThroughIndex" + 2) * CASE WHEN s."cycle" = 'yearly' THEN 12 ELSE 1 END) END AS next_end
  FROM "BillingSubscription" s CROSS JOIN moment m
  WHERE s."status" = 'ACTIVE' AND NOT s."cancelAtPeriodEnd" AND s."periodEnd" <= m.now
),
renewals AS (
  SELECT d.*,
    coalesce(d."plan" IN ('solo', 'sector_pro', 'multi', 'full', 'bio_premium')
      AND d.canonical_start = d."periodStart" AND d.canonical_end = d."periodEnd"
      AND extract(year FROM d.next_end) <= 9999, false) AS canonical,
    EXISTS (SELECT 1 FROM "BillingIntent" i WHERE i."userId" = d."userId"
      AND i."status" IN ('UNKNOWN', 'PROCESSING', 'HOLD')) AS unresolved,
    EXISTS (SELECT 1 FROM "BillingIntent" i JOIN "BillingPayment" p ON p."intentId" = i."id"
      WHERE i."userId" = d."userId" AND i."status" = 'SUCCEEDED' AND p."status" = 'APPLIED'
      AND p."userId" = d."userId" AND p."subscriptionId" = d."id"
      AND i."plan" = d."plan" AND i."cycle" = d."cycle" AND i."anchor" = d."anchor"
      AND i."periodIndex" = d."paidThroughIndex" AND i."periodStart" = d."periodStart" AND i."periodEnd" = d."periodEnd") AS has_receipt,
    EXISTS (SELECT 1 FROM "BillingIntent" i JOIN "BillingPayment" p ON p."intentId" = i."id"
      WHERE i."userId" = d."userId" AND i."status" = 'SUCCEEDED' AND p."status" = 'APPLIED'
      AND p."userId" = d."userId" AND p."subscriptionId" = d."id"
      AND i."plan" = d."plan" AND i."cycle" = d."cycle" AND i."anchor" = d."anchor"
      AND i."periodIndex" = d."paidThroughIndex" AND i."periodStart" = d."periodStart" AND i."periodEnd" = d."periodEnd"
      AND NOT EXISTS (SELECT 1 FROM "BillingPaymentMethod" method WHERE method."id" = i."paymentMethodRef"
        AND method."userId" = d."userId" AND method."customerRef" = i."customerRef" AND method."revokedAt" IS NULL)) AS revoked_method,
    EXISTS (SELECT 1 FROM "BillingIntent" next JOIN "BillingIntent" previous ON previous."userId" = d."userId"
      JOIN "BillingPayment" p ON p."intentId" = previous."id"
      WHERE next."subscriptionId" = d."id" AND next."periodIndex" = d."paidThroughIndex"::bigint + 1 AND next."status" = 'PREPARED'
      AND previous."status" = 'SUCCEEDED' AND previous."periodIndex" = d."paidThroughIndex"
      AND previous."plan" = d."plan" AND previous."cycle" = d."cycle" AND previous."anchor" = d."anchor"
      AND previous."periodStart" = d."periodStart" AND previous."periodEnd" = d."periodEnd"
      AND p."subscriptionId" = d."id" AND p."userId" = d."userId" AND p."status" = 'APPLIED'
      AND (next."amount" <> previous."amount" OR next."amount" <> p."amount")) AS price_mismatch
  FROM due d
),
items AS (
  SELECT 'intentHold' AS metric, i."createdAt" AS since FROM "BillingIntent" i WHERE i."status" = 'HOLD'
  UNION ALL SELECT 'intentUnknown', i."createdAt" FROM "BillingIntent" i WHERE i."status" = 'UNKNOWN'
  UNION ALL SELECT 'intentProcessingExpired', i."createdAt" FROM "BillingIntent" i CROSS JOIN moment m
    WHERE i."status" = 'PROCESSING' AND (i."leaseUntil" IS NULL OR i."leaseUntil" <= m.now)
  UNION ALL SELECT 'checkoutIssuanceExpired', c."createdAt" FROM "BillingCheckoutSession" c CROSS JOIN moment m
    WHERE c."status" = 'ISSUING' AND (c."leaseUntil" IS NULL OR c."leaseUntil" <= m.now)
  UNION ALL SELECT 'checkoutHold', c."createdAt" FROM "BillingCheckoutSession" c WHERE c."status" = 'HOLD'
  UNION ALL SELECT 'receiptPolicyHold', p."createdAt" FROM "BillingPayment" p WHERE p."status" = 'POLICY_HOLD'
  UNION ALL SELECT 'renewalOverdue', r."periodEnd" FROM renewals r
  UNION ALL SELECT 'renewalMissedPeriod', r."periodEnd" FROM renewals r CROSS JOIN moment m WHERE r.canonical AND r.next_end <= m.now
),
ages AS (
  SELECT i.metric, CASE WHEN m.now - i.since < interval '1 hour' THEN 'under1h'
    WHEN m.now - i.since < interval '24 hours' THEN 'h1to24'
    WHEN m.now - i.since < interval '7 days' THEN 'd1to7' ELSE 'd7plus' END AS age_bucket
  FROM items i CROSS JOIN moment m
)
SELECT metric, age_bucket, count(*) AS total FROM ages GROUP BY metric, age_bucket
UNION ALL SELECT 'activeIntentLease', 'none', count(*) FROM "BillingIntent" i CROSS JOIN moment m
  WHERE i."status" IN ('UNKNOWN', 'PROCESSING') AND i."leaseUntil" > m.now
UNION ALL SELECT 'unknownWithoutChargeTimestamp', 'none', count(*) FROM "BillingIntent" i
  WHERE i."status" IN ('UNKNOWN', 'PROCESSING') AND i."firstChargeAt" IS NULL
UNION ALL SELECT 'checkoutExpiredUnclaimed', 'none', count(*) FROM "BillingCheckoutSession" c CROSS JOIN moment m
  WHERE c."status" = 'PREPARED' AND c."expiresAt" <= m.now AND c."authKeyHash" IS NULL AND c."workerToken" IS NULL AND c."leaseUntil" IS NULL
UNION ALL SELECT 'initialLegacyPlanConflict', 'none', count(*) FROM "BillingIntent" i JOIN "User" u ON u."id" = i."userId"
  WHERE i."operation" = 'INITIAL' AND i."status" IN ('PREPARED', 'UNKNOWN', 'PROCESSING') AND u."subscriptionPlan" <> 'FREE'
UNION ALL SELECT 'renewalCancelled', 'none', count(*) FROM "BillingSubscription" s CROSS JOIN moment m
  WHERE s."status" = 'ACTIVE' AND s."cancelAtPeriodEnd" AND s."periodEnd" <= m.now
UNION ALL SELECT 'renewalInvalidPeriod', 'none', count(*) FROM renewals WHERE NOT canonical
UNION ALL SELECT 'renewalUnresolvedIntent', 'none', count(*) FROM renewals WHERE unresolved
UNION ALL SELECT 'renewalMissingAppliedReceipt', 'none', count(*) FROM renewals WHERE NOT has_receipt
UNION ALL SELECT 'renewalRevokedMethod', 'none', count(*) FROM renewals WHERE revoked_method
UNION ALL SELECT 'renewalStoredPriceMismatch', 'none', count(*) FROM renewals WHERE price_mismatch
UNION ALL SELECT 'maintenanceNeverStarted', 'none', CASE WHEN EXISTS (
  SELECT 1 FROM "BillingMaintenanceState" WHERE "id" = 'billing-maintenance-v1' AND "lastStartedAt" IS NOT NULL
) THEN 0 ELSE 1 END
UNION ALL SELECT 'maintenanceLeaseExpired', 'none', count(*) FROM "BillingMaintenanceState" s CROSS JOIN moment m
  WHERE s."id" = 'billing-maintenance-v1' AND s."workerToken" IS NOT NULL
    AND (s."leaseUntil" IS NULL OR s."leaseUntil" <= m.now)
UNION ALL SELECT 'maintenanceCompletionDelayed', 'none', count(*) FROM "BillingMaintenanceState" s CROSS JOIN moment m
  WHERE s."id" = 'billing-maintenance-v1' AND s."lastStartedAt" IS NOT NULL
    AND coalesce(s."lastCompletedAt", s."lastStartedAt") <= m.now - interval '15 minutes'
UNION ALL SELECT 'maintenanceBackoffActive', 'none', count(*) FROM "BillingMaintenanceState" s CROSS JOIN moment m
  WHERE s."id" = 'billing-maintenance-v1' AND s."nextAttemptAt" > m.now
`;
    }, { isolationLevel: "RepeatableRead", timeout: 15_000, maxWait: 5_000 });
    const counts = Object.fromEntries(BILLING_DIAGNOSTIC_METRICS.map(key => [key, 0])) as Record<Metric, number>;
    const ageBuckets = Object.fromEntries(BILLING_DIAGNOSTIC_METRICS.map(key => [key,
      Object.fromEntries(BILLING_DIAGNOSTIC_AGE_BUCKETS.map(bucket => [bucket, 0]))])) as BillingDiagnosticsReport["ageBuckets"];
    const blockers = Object.fromEntries(BILLING_DIAGNOSTIC_BLOCKERS.map(key => [key, 0])) as Record<Blocker, number>;
    const seen = new Set<string>();
    if (!Array.isArray(rows)) throw new BillingDiagnosticsUnavailable();
    for (const row of rows) {
      const key = `${row.metric}:${row.age_bucket}`;
      if (seen.has(key)) throw new BillingDiagnosticsUnavailable();
      seen.add(key);
      const total = safeCount(row.total);
      if (BILLING_DIAGNOSTIC_METRICS.includes(row.metric as Metric) && BILLING_DIAGNOSTIC_AGE_BUCKETS.includes(row.age_bucket as AgeBucket)) {
        counts[row.metric as Metric] += total;
        if (!Number.isSafeInteger(counts[row.metric as Metric])) throw new BillingDiagnosticsUnavailable();
        ageBuckets[row.metric as Metric][row.age_bucket as AgeBucket] = total;
      } else if (BILLING_DIAGNOSTIC_BLOCKERS.includes(row.metric as Blocker) && row.age_bucket === "none") blockers[row.metric as Blocker] = total;
      else throw new BillingDiagnosticsUnavailable();
    }
    // Every blocker aggregate returns a row even for zero. A truncated/invalid response is unavailable.
    if (BILLING_DIAGNOSTIC_BLOCKERS.some(key => !seen.has(`${key}:none`))) throw new BillingDiagnosticsUnavailable();
    return { status: "READ_ONLY_SNAPSHOT", activation: "HELD", asOf: now.toISOString(), providerVerified: false,
      counts, ageBuckets, blockers, limitations: ["PROVIDER_STATUS_NOT_VERIFIED", "HOLD_AGE_USES_RECORD_CREATION_TIME",
        "SERVER_CATALOG_PRICE_NOT_VERIFIED", "LEGACY_HISTORY_NOT_IMPORTED", "BLOCKERS_MAY_OVERLAP",
        "MAINTENANCE_DELAY_THRESHOLD_IS_15_MINUTES_NOT_AN_SLA", "NEVER_STARTED_CAN_MEAN_NOT_ACTIVATED"] };
  } catch { throw new BillingDiagnosticsUnavailable(); }
}

-- Server-owned INITIAL checkout reservation only; does not enable checkout or migrate keys.
CREATE TABLE IF NOT EXISTS "BillingCheckoutSession" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "activeUserId" TEXT UNIQUE,
  "plan" TEXT NOT NULL, "cycle" TEXT NOT NULL, "anchor" TIMESTAMP(3) NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL, "amount" INTEGER NOT NULL,
  "customerRef" TEXT NOT NULL UNIQUE, "paymentMethodRef" TEXT NOT NULL UNIQUE,
  "intentId" TEXT NOT NULL UNIQUE, "orderId" TEXT NOT NULL UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "callbackOrigin" TEXT NOT NULL, "status" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  "authKeyHash" TEXT UNIQUE, "workerToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "BillingCheckoutSession_status_leaseUntil_idx" ON "BillingCheckoutSession"("status", "leaseUntil");
CREATE INDEX IF NOT EXISTS "BillingCheckoutSession_userId_idx" ON "BillingCheckoutSession"("userId");

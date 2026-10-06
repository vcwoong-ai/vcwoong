-- Additive PostgreSQL patch only. Does not import/activate legacy subscriptions or billing keys.
CREATE TABLE IF NOT EXISTS "BillingPaymentMethod" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerRef" TEXT NOT NULL, "encryptedBillingKey" TEXT NOT NULL, "keyVersion" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "BillingPaymentMethod_userId_revokedAt_idx" ON "BillingPaymentMethod"("userId", "revokedAt");
CREATE TABLE IF NOT EXISTS "BillingSubscription" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 0, "plan" TEXT NOT NULL, "cycle" TEXT NOT NULL,
  "anchor" TIMESTAMP(3) NOT NULL, "paidThroughIndex" INTEGER NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL, "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "BillingIntent" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reservationKey" TEXT NOT NULL UNIQUE, "operation" TEXT NOT NULL,
  "plan" TEXT NOT NULL, "cycle" TEXT NOT NULL, "anchor" TIMESTAMP(3) NOT NULL,
  "periodIndex" INTEGER NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "subscriptionId" TEXT REFERENCES "BillingSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "subscriptionVersion" INTEGER, "amount" INTEGER NOT NULL, "currency" TEXT NOT NULL,
  "orderId" TEXT NOT NULL UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "customerRef" TEXT NOT NULL, "paymentMethodRef" TEXT NOT NULL, "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "firstChargeAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "workerToken" TEXT,
  UNIQUE ("subscriptionId", "periodIndex")
);
CREATE INDEX IF NOT EXISTS "BillingIntent_userId_status_idx" ON "BillingIntent"("userId", "status");
CREATE INDEX IF NOT EXISTS "BillingIntent_status_leaseUntil_idx" ON "BillingIntent"("status", "leaseUntil");
CREATE TABLE IF NOT EXISTS "BillingPayment" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "intentId" TEXT NOT NULL UNIQUE REFERENCES "BillingIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "subscriptionId" TEXT REFERENCES "BillingSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentKey" TEXT NOT NULL UNIQUE, "orderId" TEXT NOT NULL UNIQUE,
  "amount" INTEGER NOT NULL, "currency" TEXT NOT NULL, "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BillingPayment_userId_createdAt_idx" ON "BillingPayment"("userId", "createdAt");

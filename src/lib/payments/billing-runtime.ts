import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PUBLIC_PLANS, priceForCycle } from "../plans";
import { BillingLifecycle } from "./billing-lifecycle";
import { createBillingClient } from "./billing-client";
import { BillingKeyVault } from "./billing-key-vault";
import { PrismaBillingRepository } from "./prisma-billing-repository";
import { createPaymentMethodResolver } from "./payment-method-resolver";
import { createTossBillingProvider } from "./toss-billing-provider";
import { createTossBillingIssuer } from "./toss-billing-issuer";
import { CheckoutSessionService } from "./checkout-session";
import { isSubscriptionCheckoutReady } from "./checkout-readiness";
import { inspectTossConfiguration } from "./provider-configuration";
import { PrismaBillingMaintenanceSchedule } from "./billing-maintenance-schedule";
import { BillingEventService } from "./billing-events";

/** Cancellation requires storage only; missing provider keys must not prevent stopping renewals. */
export async function withBillingRepository<T>(callback: (repository: PrismaBillingRepository) => Promise<T>): Promise<T> {
  const client = createBillingClient(process.env.DATABASE_URL ?? "");
  try { return await callback(new PrismaBillingRepository(client)); }
  finally { await client.$disconnect(); }
}

export interface CheckoutRuntimeConfiguration {
  databaseUrl: string; vaultKey: Uint8Array; vaultKeyId: string;
  tossClientKey: string; tossSecretKey: string;
}
export interface CheckoutRuntimePorts {
  client?: PrismaClient;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
  newId?: () => string;
}

/** Explicit composition for isolated tests and future activation. Never serialize this object. */
export function createCheckoutRuntime(config: CheckoutRuntimeConfiguration, ports: CheckoutRuntimePorts = {}) {
  const ready = inspectTossConfiguration({ NEXT_PUBLIC_TOSS_CLIENT_KEY: config.tossClientKey, TOSS_SECRET_KEY: config.tossSecretKey });
  if (!ready.ready) throw new Error("Billing configuration unavailable");
  const vault = new BillingKeyVault({ key: config.vaultKey, keyId: config.vaultKeyId });
  let client: PrismaClient;
  try { client = ports.client ?? createBillingClient(config.databaseUrl); }
  catch { vault.destroy(); throw new Error("Billing configuration unavailable"); }
  const repository = new PrismaBillingRepository(client);
  const authorization = async () => `Basic ${Buffer.from(`${config.tossSecretKey}:`).toString("base64")}`;
  const fetcher = ports.fetch ?? ((url, init) => fetch(url, init));
  const price: ConstructorParameters<typeof BillingLifecycle>[0]["price"] = (plan, cycle) => {
    const catalog = PUBLIC_PLANS.find(item => item.key === plan);
    if (!catalog) throw new Error("Billing plan unavailable");
    return priceForCycle(catalog, cycle);
  };
  const now = ports.now ?? (() => new Date());
  const newId = ports.newId ?? randomUUID;
  const lifecycle = new BillingLifecycle({ repository, now, newId, price,
    provider: createTossBillingProvider({ fetch: fetcher, authorization,
      resolvePaymentMethod: createPaymentMethodResolver({ store: repository, vault, keyVersion: vault.keyVersion }) }) });
  const service = new CheckoutSessionService({ client, repository, lifecycle, vault, now, newId, price,
    issueBillingKey: createTossBillingIssuer({ fetch: fetcher, authorization }) });
  const maintenance = new PrismaBillingMaintenanceSchedule(client, { repository, lifecycle, now, newId });
  const eventProvider = createTossBillingProvider({ fetch: fetcher, authorization, lookupTimeoutMs: 8_000,
    resolvePaymentMethod: async () => { throw new Error("Event charging forbidden"); } });
  const events = new BillingEventService({ repository, now, newId, lookupByOrder: eventProvider.lookupByOrder,
    allow: async key => {
      const expiresAt = new Date(now().getTime() + 60_000);
      // Dedicated shared counters fail closed. No request identifiers or provider values in keys.
      await client.rateLimit.deleteMany({ where: { key, expiresAt: { lt: now() } } });
      const record = await client.rateLimit.upsert({ where: { key }, create: { key, count: 1, expiresAt },
        update: { count: { increment: 1 } } });
      return record.count <= (key === "billing-events:global" ? 60 : 5);
    } });
  return { service, repository, maintenance, events, async dispose() { vault.destroy(); if (!ports.client) await client.$disconnect(); } };
}

let runtime: ReturnType<typeof createCheckoutRuntime> | undefined;
/** Hard readiness hold precedes all environment reads and provider/client construction. */
async function getRuntime(): Promise<ReturnType<typeof createCheckoutRuntime> | null> {
  if (!isSubscriptionCheckoutReady()) return null;
  if (runtime) return runtime;
  let bytes: Buffer | undefined;
  try {
    const encoded = process.env.BILLING_VAULT_KEY ?? "";
    bytes = Buffer.from(encoded, "base64");
    if (bytes.length !== 32 || bytes.toString("base64") !== encoded) return null;
    runtime = createCheckoutRuntime({ databaseUrl: process.env.DATABASE_URL ?? "", vaultKey: bytes,
      vaultKeyId: process.env.BILLING_VAULT_KEY_ID ?? "",
      tossClientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "", tossSecretKey: process.env.TOSS_SECRET_KEY ?? "" });
    return runtime;
  } catch { return null; }
  finally { bytes?.fill(0); }
}

export async function getCheckoutRuntime(): Promise<CheckoutSessionService | null> {
  return (await getRuntime())?.service ?? null;
}
export async function withBillingEventService<T>(callback: (service: BillingEventService) => Promise<T>): Promise<T | null> {
  const current = await getRuntime();
  return current ? callback(current.events) : null;
}
export async function getBillingMaintenance(): Promise<PrismaBillingMaintenanceSchedule | null> {
  return (await getRuntime())?.maintenance ?? null;
}

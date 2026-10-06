import { PrismaClient } from "@prisma/client";

/** Explicit server configuration only. Do not use the development query-logging singleton.
 * Callers own lifecycle/disconnect and must keep the URL and Prisma errors out of responses.
 * Construction never reads application environment files or starts a charge.
 */
export function createBillingClient(databaseUrl: string): PrismaClient {
  try {
    const target = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || target.pathname.length < 2) {
      throw new Error();
    }
    return new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  } catch { throw new Error("Billing storage unavailable"); }
}

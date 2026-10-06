/** Real isolated PostgreSQL reset consumption; synthetic credentials only, no mail. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";

let stage = "environment";
async function main() {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3119");
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const { prisma } = await import("../src/lib/prisma");
  const { resetPasswordWithToken, createResetToken, hashToken } = await import("../src/lib/password-reset");
  const email = `reset-integration-${randomUUID()}@example.com`;
  const identifier = `password-reset:${email}`;
  let userId: string | undefined;
  const token = "synthetic-disposable-reset-token";
  const expires = new Date(Date.now() + 60_000);
  try {
    stage = "synthetic seed";
    userId = (await prisma.user.create({ data: { email, passwordHash: "synthetic-old-hash" } })).id;
    await prisma.verificationToken.create({ data: { identifier, token: hashToken(token), expires } });
    stage = "concurrent real transactions";
    const results = await Promise.all([
      resetPasswordWithToken(email, token, "synthetic-hash-A"),
      resetPasswordWithToken(email, token, "synthetic-hash-B"),
    ]);
    assert.equal(results.filter(value => value === "updated").length, 1);
    assert.equal(results.filter(value => value === "invalid").length, 1);
    const winner = results[0] === "updated" ? "synthetic-hash-A" : "synthetic-hash-B";
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash, winner);
    assert.equal(await resetPasswordWithToken(email, token, "synthetic-replay"), "invalid");
    stage = "concurrent issuance leaves one active link";
    // Force both real Serializable DELETE predicates to observe no active row before INSERT.
    // Only this synthetic identifier exists in these calls; restore the singleton method afterward.
    type TxWork = (tx: Prisma.TransactionClient) => Promise<unknown>;
    type TxOptions = { isolationLevel?: "Serializable"; maxWait?: number; timeout?: number };
    const runtime = prisma as unknown as { $transaction: (work: TxWork, options?: TxOptions) => Promise<unknown> };
    const originalTransaction = runtime.$transaction.bind(prisma);
    let deletes = 0, conflicts = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>(resolve => { releaseBarrier = resolve; });
    runtime.$transaction = async (work, options) => {
      try {
        return await originalTransaction(tx => work(new Proxy(tx, {
          get(target, key, receiver) {
            if (key !== "verificationToken") return Reflect.get(target, key, receiver);
            return new Proxy(target.verificationToken, {
              get(delegate, method, delegateReceiver) {
                if (method !== "deleteMany") return Reflect.get(delegate, method, delegateReceiver);
                return async (args: Prisma.VerificationTokenDeleteManyArgs) => {
                  const result = await delegate.deleteMany(args);
                  const position = ++deletes;
                  if (position === 2) releaseBarrier();
                  if (position <= 2) await barrier;
                  return result;
                };
              },
            });
          },
        })), options);
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") conflicts++;
        throw error;
      }
    };
    try {
      await Promise.all([createResetToken(email), createResetToken(email)]);
      assert(conflicts >= 1, "forced real Serializable write skew must conflict and retry");
      assert.equal(await prisma.verificationToken.count({ where: { identifier } }), 1);
    } finally { runtime.$transaction = originalTransaction; }
    for (let round = 0; round < 3; round++) {
      const issued = await Promise.all([createResetToken(email), createResetToken(email)]);
      const rows = await prisma.verificationToken.findMany({ where: { identifier } });
      assert.equal(rows.length, 1);
      assert(issued.some(value => hashToken(value) === rows[0].token));
      assert(rows[0].expires.getTime() > Date.now());
      const inactive = issued.find(value => hashToken(value) !== rows[0].token)!;
      assert.equal(await resetPasswordWithToken(email, inactive, "synthetic-inactive-link"), "invalid");
      assert.equal(await prisma.verificationToken.count({ where: { identifier } }), 1);
    }
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    stage = "expired link leaves newer link intact";
    const newer = "synthetic-new-reset-token";
    await prisma.verificationToken.createMany({ data: [
      { identifier, token: hashToken(token), expires: new Date(Date.now() - 1000) },
      { identifier, token: hashToken(newer), expires },
    ] });
    assert.equal(await resetPasswordWithToken(email, token, "synthetic-expired"), "invalid");
    assert.equal(await prisma.verificationToken.count({ where: { identifier, token: hashToken(newer) } }), 1);
    stage = "missing user rolls token consumption back";
    await prisma.user.delete({ where: { id: userId } });
    assert.equal(await resetPasswordWithToken(email, newer, "synthetic-missing"), "account_missing");
    assert.equal(await prisma.verificationToken.count({ where: { identifier, token: hashToken(newer) } }), 1);
    console.log("PASS actual PostgreSQL concurrent reset winner1/replay0, concurrent issuance active1, expired exact cleanup, missing-user rollback; no mail/provider");
  } finally {
    try {
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier } }),
        prisma.user.deleteMany({ where: { email } }),
      ]);
      assert.equal(await prisma.verificationToken.count({ where: { identifier } }), 0);
      assert.equal(await prisma.user.count({ where: { email } }), 0);
      console.log("PASS synthetic password reset cleanup");
    } finally { await prisma.$disconnect(); }
  }
}
main().catch(() => { console.error(`PASSWORD_RESET_INTEGRATION_FAILED stage=${stage}; private details withheld`); process.exitCode = 1; });

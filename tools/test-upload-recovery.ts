/** Lease/state regression without database calls, provider keys, or stored files. */
import assert from "node:assert/strict";
import { queuedRecovery, readRecoveryState, nextRecoveryLease, canCommitRecovery, UPLOAD_LEASE_MS, MAX_UPLOAD_ATTEMPTS } from "../src/lib/upload-recovery";

const now = 1_000_000;
const queued = queuedRecovery(now);
assert.equal(readRecoveryState({ __uploadRecovery: queued })?.status, "queued");
for (const malformed of [null, {}, { __uploadRecovery: { ...queued, version: 2 } }, { __uploadRecovery: { ...queued, attempt: -1 } }, { __uploadRecovery: { ...queued, leaseExpiresAt: Number.NaN } }]) assert.equal(readRecoveryState(malformed), null);
const first = nextRecoveryLease(queued, now, "11111111-1111-4111-8111-111111111111");
assert(first);
assert.equal(first.attempt, 1);
assert.equal(first.leaseExpiresAt, now + UPLOAD_LEASE_MS);
assert.equal(nextRecoveryLease(first, now + 1, "22222222-2222-4222-8222-222222222222"), null, "active lease cannot be claimed twice");
assert(canCommitRecovery(first, first, now + 1));
assert(!canCommitRecovery(first, first, now + UPLOAD_LEASE_MS), "expired lease cannot commit");
const second = nextRecoveryLease(first, now + UPLOAD_LEASE_MS, "33333333-3333-4333-8333-333333333333");
assert(second);
assert.equal(second.attempt, 2);
assert(!canCommitRecovery(second, first, now + 1), "stale worker token is fenced even if its clock is old");
assert(!canCommitRecovery({ ...second, attempt: second.attempt + 1 }, second, now + UPLOAD_LEASE_MS));
assert.equal(nextRecoveryLease({ ...queued, retryAfter: now + 10 }, now), null, "backoff is respected");
assert.equal(nextRecoveryLease({ ...queued, attempt: MAX_UPLOAD_ATTEMPTS }, now), null);
assert.equal(nextRecoveryLease({ ...queued, status: "complete" }, now), null);
assert.equal(nextRecoveryLease({ ...queued, status: "failed" }, now), null);
assert(!canCommitRecovery(null, first, now));
console.log("Offline upload recovery lease/duplicate-worker/stale-token/backoff/attempt-limit checks passed.");

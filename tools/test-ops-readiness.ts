import assert from "node:assert/strict";
import { planOperationalReadiness, type InventoryEntry } from "./lib/ops-readiness";

const empty = planOperationalReadiness();
assert.equal(empty.mode, "plan-only");
assert.equal(empty.status, "unverified");
assert.equal(empty.target, "unselected");
assert.equal(empty.checks.databaseSchema, "not-connected");
assert.equal(empty.checks.targetStorageAccess, "not-queried");
assert.equal(empty.checks.sourceObjects, "not-read");
const refs = ["/uploads/synthetic.pdf", "https://fixture.public.blob.vercel-storage.com/synthetic.pdf", "private-local:synthetic.pdf", "https://fixture.private.blob.vercel-storage.com/synthetic.pdf", "https://fixture.s3.ap-northeast-2.amazonaws.com/synthetic.pdf", "https://invalid.example/synthetic.pdf?token=synthetic-only"];
const entries: InventoryEntry[] = refs.map((storageRef, index) => ({ recordId: `private-record-${index}`, kind: "vc-document", storageRef, size: 10 }));
const plan = planOperationalReadiness([...entries, entries[0]], "private-blob");
assert.equal(plan.inventory.entries, entries.length, "duplicate metadata entries are deduplicated");
assert.deepEqual(plan.inventory.items.map(item => item.source).sort(), ["public-local", "public-blob", "private-local", "private-blob", "s3-policy-unverified", "unrecognized"].sort());
assert.deepEqual(planOperationalReadiness([...entries].reverse(), "private-blob"), plan, "input order does not change the generated plan");
for (const item of plan.inventory.items) {
  assert.match(item.resourceRef, /^[a-f0-9]{64}$/);
  assert.match(item.objectRef, /^[a-f0-9]{64}$/);
  if (item.source.startsWith("public-")) assert.equal(item.action, "copy-verify-switch");
}
const serialized = JSON.stringify(plan);
for (const ref of refs) assert(!serialized.includes(ref), "storage references are omitted from output");
assert(!serialized.includes("private-record-"));
assert(!serialized.includes("synthetic-only"));
for (const storageRef of ["/uploads/../synthetic.pdf", "/uploads/%2e%2e/synthetic.pdf", "/uploads/a\\b.pdf", "private-local:../synthetic.pdf", "private-local:/synthetic.pdf", "private-local:a%2fb.pdf", "https://fixture.private.blob.vercel-storage.com/a/../synthetic.pdf"]) {
  const unsafe = planOperationalReadiness([{ recordId: "synthetic-malformed", kind: "vc-document", storageRef }]);
  assert.equal(unsafe.inventory.items[0].source, "unrecognized", "malformed references require inspection rather than migration classification");
  assert(!JSON.stringify(unsafe).includes(storageRef));
}
assert.throws(() => planOperationalReadiness({}, "private-local"));
assert.throws(() => planOperationalReadiness([], "invalid" as never));
for (const entry of [{}, { recordId: "x", kind: "invalid", storageRef: "x" }, { ...entries[0], size: -1 }, { ...entries[0], size: 1.1 }]) assert.throws(() => planOperationalReadiness([entry]));
console.log("Offline operations-readiness metadata planning/classification/validation/no-raw-reference checks passed.");

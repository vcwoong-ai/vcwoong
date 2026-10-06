import { createHash } from "node:crypto";

export type StorageTarget = "unselected" | "private-blob" | "private-s3" | "private-local";
export type InventoryKind = "vc-document" | "pe-document" | "template" | "extracted-image";
export interface InventoryEntry {
  recordId: string;
  kind: InventoryKind;
  storageRef: string;
  size?: number;
}
export interface MigrationItem {
  resourceRef: string;
  objectRef: string;
  kind: InventoryKind;
  source: "public-local" | "public-blob" | "private-blob" | "private-local" | "s3-policy-unverified" | "unrecognized";
  size?: number;
  action: "copy-verify-switch" | "verify-existing-private" | "inspect-source";
}
const kinds: InventoryKind[] = ["vc-document", "pe-document", "template", "extracted-image"];
const targets: StorageTarget[] = ["unselected", "private-blob", "private-s3", "private-local"];
function opaque(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function sourceType(ref: string): MigrationItem["source"] {
  if (/[\\\x00-\x1f%]/.test(ref) || ref.includes("..")) return "unrecognized";
  const safeLocal = (key: string) => !!key && /^[A-Za-z0-9_./-]+$/.test(key) && key.split("/").every(part => !!part && part !== "." && part !== "..");
  if (ref.startsWith("private-local:")) return safeLocal(ref.slice(14)) ? "private-local" : "unrecognized";
  if (ref.startsWith("/uploads/")) return safeLocal(ref.slice(9)) ? "public-local" : "unrecognized";
  try {
    const url = new URL(ref);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || !safeLocal(url.pathname.slice(1))) return "unrecognized";
    if (/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)) return "public-blob";
    if (/^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname)) return "private-blob";
    if (/\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) return "s3-policy-unverified";
  } catch { /* Return a classification only, never the rejected reference. */ }
  return "unrecognized";
}

/** Pure planning only: no environment lookup, database, network, writes, or content reads. */
export function planOperationalReadiness(input: unknown = [], target: StorageTarget = "unselected") {
  if (!targets.includes(target)) throw new Error("INVALID_TARGET");
  if (!Array.isArray(input) || input.length > 100_000) throw new Error("INVALID_INVENTORY");
  const items: MigrationItem[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INVENTORY_ENTRY");
    const entry = value as InventoryEntry;
    if (typeof entry.recordId !== "string" || !entry.recordId || entry.recordId.length > 1024 ||
        !kinds.includes(entry.kind) || typeof entry.storageRef !== "string" || !entry.storageRef || entry.storageRef.length > 4096 ||
        (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0))) throw new Error("INVALID_INVENTORY_ENTRY");
    const resourceRef = opaque(`${entry.kind}:${entry.recordId}`);
    const objectRef = opaque(entry.storageRef);
    const identity = `${resourceRef}:${objectRef}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const source = sourceType(entry.storageRef);
    items.push({ resourceRef, objectRef, kind: entry.kind, source,
      ...(entry.size !== undefined ? { size: entry.size } : {}),
      action: source === "public-local" || source === "public-blob" ? "copy-verify-switch" :
        source === "private-local" || source === "private-blob" ? "verify-existing-private" : "inspect-source" });
  }
  items.sort((a, b) => a.resourceRef.localeCompare(b.resourceRef) || a.objectRef.localeCompare(b.objectRef));
  return {
    mode: "plan-only" as const,
    target,
    status: "unverified" as const,
    checks: {
      databaseSchema: "not-connected",
      targetStorageAccess: "not-queried",
      sourceObjects: "not-read",
      documentAuthorization: "requires-isolated-runtime-check",
    },
    inventory: { entries: items.length, suppliedMetadataOnly: true, items },
    requiredSteps: [
      "Select and verify a non-operating private storage target before integration checks.",
      "Run scoped schema-readiness and authenticated download checks in an approved environment.",
      "Obtain a separately approved read-only operating inventory; include extracted images and all referencing records.",
      "Copy each object to a private target; compare byte count and SHA-256 before switching references.",
      "Switch authorized record references using compare-and-swap and an approved rollback journal.",
      "Verify owner/team/outsider/anonymous download behavior after switching references.",
      "Request separate approval before deleting public objects; retain backups under an agreed retention policy.",
    ],
    warnings: [
      "Metadata classification is not evidence that a bucket, store, object, or deployed app is private.",
      "Opaque hashes are stable correlation identifiers, not an anonymization guarantee.",
      "This planner never copies objects, updates references, deletes files, or connects to any service.",
    ],
  };
}

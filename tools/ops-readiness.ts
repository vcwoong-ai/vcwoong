import { readFile, stat } from "node:fs/promises";
import { planOperationalReadiness, type StorageTarget } from "./lib/ops-readiness";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Plan only: ops-readiness [--inventory <explicit metadata JSON file>] [--target private-blob|private-s3|private-local]. No database/network access or changes. Defaults to an unverified checklist.");
    return;
  }
  let inventoryFile: string | undefined;
  let target: StorageTarget = "unselected";
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index + 1] || (args[index] !== "--inventory" && args[index] !== "--target")) throw new Error("INVALID_ARGUMENTS");
    if (args[index] === "--inventory") {
      if (inventoryFile) throw new Error("DUPLICATE_ARGUMENT");
      inventoryFile = args[index + 1];
    } else {
      if (target !== "unselected") throw new Error("DUPLICATE_ARGUMENT");
      target = args[index + 1] as StorageTarget;
    }
  }
  // Only explicitly selected metadata is read. Never load dotenv or infer a production source.
  let inventory: unknown = [];
  if (inventoryFile) {
    const info = await stat(inventoryFile);
    if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error("INVALID_INVENTORY_FILE");
    inventory = JSON.parse(await readFile(inventoryFile, "utf8"));
  }
  console.log(JSON.stringify(planOperationalReadiness(inventory, target), null, 2));
}
main().catch(() => {
  console.error(JSON.stringify({ status: "unverified", code: "PLAN_INPUT_INVALID_OR_UNREADABLE", mode: "plan-only" }));
  process.exitCode = 1;
});

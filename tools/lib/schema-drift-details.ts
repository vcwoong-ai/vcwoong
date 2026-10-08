import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isolatedSchema } from "./schema-readiness";

/** Schema-only diagnostic SQL. Never execute its output or inherit Prisma errors. */
export async function schemaDriftDetails(projectRoot: string, databaseUrl: string, source: string): Promise<string | null> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dealmind-release-diff-"));
  try {
    const file = path.join(directory, "schema.prisma");
    await writeFile(file, isolatedSchema(source), { mode: 0o600 });
    return await new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(projectRoot, "node_modules/prisma/build/index.js"),
        "migrate", "diff", "--from-schema-datasource", file, "--to-schema-datamodel", file, "--script"],
      { cwd: directory, env: { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: "1" },
        stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      let output = "", overflow = false;
      const timer = setTimeout(() => { child.kill(); resolve(null); }, 60_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        if (output.length + chunk.length > 1_000_000) { overflow = true; child.kill(); }
        else output += chunk;
      });
      child.once("error", () => { clearTimeout(timer); resolve(null); });
      child.once("close", code => { clearTimeout(timer); resolve(code === 0 && !overflow ? output : null); });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

// Dedicated, ephemeral loopback PostgreSQL. Never reads .env files or service keys.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

const root = await mkdtemp(join(tmpdir(), "dealmind-meeting-pg-"));
const pgBin = process.env.MEETING_TEST_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const baseEnv = {};
for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT"]) if (process.env[name]) baseEnv[name] = process.env[name];
function run(executable, args, env = baseEnv) {
  return new Promise((resolveRun, reject) => {
    const process = spawn(executable, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    for (const stream of [process.stdout, process.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-8000); });
    process.on("error", reject);
    process.on("exit", code => code === 0 ? resolveRun(output) : reject(new Error(`Isolated command failed (${code}): ${output.slice(-2000)}`)));
  });
}
let started = false;
try {
  const server = createServer();
  await new Promise(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  const port = server.address().port;
  await new Promise(resolveClosed => server.close(resolveClosed));
  const database = `dealmind_meeting_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const url = `postgresql://postgres@127.0.0.1:${port}/${database}`;
  const env = { ...baseEnv, DATABASE_URL: url, DEALMIND_E2E_ISOLATED: "1", NODE_ENV: "test" };
  console.log("Preparing a dedicated local PostgreSQL fixture; no operating database or service keys.");
  await run(join(pgBin, "initdb.exe"), ["-D", join(root, "pgdata"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await run(join(pgBin, "pg_ctl.exe"), ["-D", join(root, "pgdata"), "-l", join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  await run(join(pgBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", database]);
  let current = await readFile("prisma/schema.prisma", "utf8");
  const before = current.replace(/\nmodel (?:Meeting|MeetingUsageAdmission|MeetingRevision) \{[\s\S]*?\n\}/g, "")
    .replace(/^\s*meetings\s+Meeting\[\].*$/gm, "").replace(/^\s*meetingUsage\s+MeetingUsageAdmission\[\].*$/gm, "");
  if (/model Meeting\b/.test(before)) throw new Error("Unexpected baseline schema");
  await writeFile(join(root, "before.prisma"), before);
  current = current.replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = ${JSON.stringify(join(root, "client").replaceAll("\\", "/"))}`);
  await writeFile(join(root, "after.prisma"), current);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--schema", join(root, "after.prisma")], env);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", join(root, "before.prisma"), "--skip-generate"], env);
  await run(join(pgBin, "psql.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-f", resolve("prisma/patches/2026-10-06-add-meeting-intelligence.sql")]);
  await run(join(pgBin, "psql.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-f", resolve("prisma/patches/2026-10-07-add-meeting-upload-memo.sql")]);
  console.log(await run(process.execPath, ["--import", "tsx", "tools/test-meeting-intelligence.ts"], {
    ...env, MEETING_TEST_POSTGRES_URL: url, MEETING_TEST_POSTGRES_CLIENT: join(root, "client"),
  }));
} catch (error) {
  console.error(String(error?.message ?? "Isolated PostgreSQL validation failed"));
  process.exitCode = 1;
} finally {
  if (started) await run(join(pgBin, "pg_ctl.exe"), ["-D", join(root, "pgdata"), "-m", "fast", "-w", "stop"]).catch(() => { process.exitCode = 1; });
  const target = resolve(root), child = relative(resolve(tmpdir()), target);
  if ((!started || process.exitCode !== 1) && child.startsWith("dealmind-meeting-pg-") && !child.includes("..") && !isAbsolute(child)) await rm(target, { recursive: true, force: true });
  else console.log("Retained isolated diagnostic fixture; no service keys were written.");
}

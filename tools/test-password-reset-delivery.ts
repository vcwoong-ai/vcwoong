/** Actual request handler with synthetic dependencies; no database, keys or email requests. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function main() {
  let configured = false;
  let exists = true;
  let allowed = true;
  let sent = true;
  let lookupThrows = false;
  let lookups = 0;
  let tokens = 0;
  let emails = 0;
  let lookedUpEmail = "";
  const logs: string[] = [];
  const imports: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse }, zod: { z },
    "@/lib/prisma": { prisma: { user: { findUnique: async ({ where }: { where: { email: string } }) => {
      lookups++; lookedUpEmail = where.email;
      if (lookupThrows) throw new Error("sensitive-database-detail@example.invalid");
      return exists ? { id: "fixture", passwordHash: "synthetic-hash" } : null;
    } } } },
    "@/lib/password-reset": { createResetToken: async () => { tokens++; return "synthetic-token"; }, RESET_TOKEN_TTL_MINUTES: 30 },
    "@/lib/email": { isEmailConfigured: () => configured, sendEmail: async () => { emails++; return { sent, reason: sent ? undefined : "http_422" }; }, passwordResetEmail: () => "synthetic-html" },
    "@/lib/rate-limit": { clientIp: () => "synthetic-ip", checkRateLimit: async () => ({ allowed, retryAfterSec: 60 }) },
  };
  const exports: { POST?: (request: NextRequest) => Promise<NextResponse> } = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/auth/forgot-password/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, process: { env: { NEXTAUTH_URL: "http://localhost:3107" } },
    console: { error: (...args: unknown[]) => logs.push(args.join(" ")), info: (...args: unknown[]) => logs.push(args.join(" ")) },
    require: (name: string) => { assert(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  assert(exports.POST);
  async function request(email = "fixture@example.invalid") {
    const response = await exports.POST!(new NextRequest("http://localhost:3107/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    }));
    return { status: response.status, body: await response.json(), retry: response.headers.get("Retry-After") };
  }
  const unavailable = await request();
  assert.equal(unavailable.status, 503, "An unconfigured service must not promise delivery");
  exists = false;
  assert.deepEqual(await request(), unavailable, "Unconfigured service must not reveal account existence");
  assert.equal(lookups, 0);
  assert.equal(tokens, 0);
  assert.equal(emails, 0);
  configured = true; exists = true;
  const delivered = await request("  FIXTURE@EXAMPLE.INVALID  ");
  assert.equal(delivered.status, 200);
  assert.equal(lookedUpEmail, "fixture@example.invalid");
  assert.equal(tokens, 1);
  assert.equal(emails, 1);
  assert(!delivered.body.message.includes("보냈습니다"), "Receipt must not assert confirmed delivery");
  exists = false;
  assert.deepEqual(await request(), delivered);
  sent = false; exists = true;
  assert.deepEqual(await request(), delivered, "Provider failure must not expose account existence");
  assert(logs.some((line) => line.includes("발송 실패")));
  lookupThrows = true;
  assert.deepEqual(await request(), delivered);
  assert(!logs.join("\n").includes("sensitive-database-detail"));
  assert.equal((await request("invalid")).status, 400);
  allowed = false;
  const limited = await request();
  assert.equal(limited.status, 429);
  assert.equal(limited.retry, "60");
  console.log("Offline password reset delivery, normalization, privacy and rate-limit regressions passed.");
}
main().catch(() => { console.error("Offline password reset delivery regression failed."); process.exitCode = 1; });

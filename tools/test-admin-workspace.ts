/** 실제 인증 callback/페이지/조회 함수를 합성 ports로 검증한다. DB·외부 발송 없음. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { isPlatformAdminAccount } from "../src/lib/platform-admin";
import { canUseDemoCredentials, DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_EMAILS } from "../src/lib/demo-access";
import * as sessionVersions from "../src/lib/auth-session-version";
import { BRAND } from "../src/lib/brand";

function load(file: string, imports: Record<string, unknown>, env: Record<string, string> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, process: { env }, console, require: (name: string) => {
    assert(name in imports, `Unexpected import: ${name}`); return imports[name];
  } });
  return exports;
}

async function main() {
  const email = "operator@example.invalid", id = "trusted-operator";
  const account = { id, email };
  assert(isPlatformAdminAccount(account, email, id));
  assert(!isPlatformAdminAccount(account, email, ""), "Email-only signup must not grant platform access");
  assert(!isPlatformAdminAccount({ id: "customer", email }, email, id));
  assert(!isPlatformAdminAccount({ id, email: "other@example.invalid" }, email, id));
  assert(!isPlatformAdminAccount(null, email, id));
  for (const demoEmail of DEMO_ACCOUNT_EMAILS) {
    assert(!isPlatformAdminAccount({ id, email: demoEmail }, demoEmail, id));
    assert(!canUseDemoCredentials(demoEmail, "production"));
    assert(!canUseDemoCredentials(demoEmail, "unknown"));
    assert(canUseDemoCredentials(demoEmail, "development"));
    assert(canUseDemoCredentials(demoEmail, "test"));
  }

  let session: any = null, current: any = account, dbReads = 0;
  const guard = load("src/lib/platform-admin-server.ts", {
    react: { cache: (fn: unknown) => fn },
    "next-auth": { getServerSession: async () => session },
    "next/navigation": { redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("denied"); } },
    "./auth": { authOptions: {} },
    "./prisma": { prisma: { user: { findUnique: async ({ where }: any) => {
      dbReads++; assert.equal(where.id, session.user.id); return current;
    } } } },
    "./platform-admin": { isPlatformAdminAccount: (value: any) => isPlatformAdminAccount(value, email, id) },
  }).requirePlatformAdmin;
  await assert.rejects(guard(), /redirect/);
  assert.equal(dbReads, 0);
  session = { user: { id, email, role: "ADMIN", platformAdmin: true } };
  current = { id: "customer", email }; // A spoofed client flag cannot authorize another DB identity.
  await assert.rejects(guard(), /denied/);
  current = null; await assert.rejects(guard(), /denied/);
  current = account; assert.equal((await guard()).id, id);

  let authAccount: any = { ...account, passwordHash: "synthetic-hash", role: "ANALYST" };
  let configuredId = id, mode = "production", passwordChecks = 0;
  const auth = load("src/lib/auth.ts", {
    "next-auth/providers/credentials": { __esModule: true, default: (options: any) => options },
    "@auth/prisma-adapter": { PrismaAdapter: () => ({}) },
    bcryptjs: { __esModule: true, default: { compare: async () => { passwordChecks++; return true; } } },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => authAccount }, rateLimit: { deleteMany: async () => ({ count: 0 }) } } },
    "@/lib/rate-limit": { RATE_LIMITS: { login: { limit: 5, windowMs: 1000 } }, checkRateLimit: async () => ({ allowed: true }) },
    "@/lib/login-email": { findLoginEmailCandidates: async () => [{ id }] },
    "@/lib/auth-session-version": sessionVersions,
    "@/lib/demo-access": { canUseDemoCredentials: (value: string) => canUseDemoCredentials(value, mode) },
    "@/lib/platform-admin": { isPlatformAdminAccount: (value: any) => isPlatformAdminAccount(value, email, configuredId) },
  }).authOptions;
  const token = { id, email: "stale@example.invalid", platformAdmin: true,
    authSessionVersion: sessionVersions.passwordSessionVersion(id, authAccount.passwordHash) };
  let valid = await auth.callbacks.jwt({ token });
  assert.equal(valid.email, email); assert.equal(valid.platformAdmin, true);
  configuredId = "revoked";
  valid = await auth.callbacks.jwt({ token }); assert.equal(valid.platformAdmin, false);
  const publicSession = await auth.callbacks.session({ session: { user: {} }, token: valid });
  assert.equal(publicSession.user.platformAdmin, false);
  assert(!JSON.stringify(publicSession).includes(token.authSessionVersion));
  authAccount = { ...authAccount, email: DEMO_ACCOUNT_EMAIL };
  await assert.rejects(auth.callbacks.jwt({ token }), sessionVersions.AuthSessionInvalid);
  await assert.rejects(auth.providers[0].authorize({ email: DEMO_ACCOUNT_EMAIL, password: "synthetic" }, { headers: {} }));
  assert.equal(passwordChecks, 0);
  mode = "test";
  assert.equal((await auth.providers[0].authorize({ email: DEMO_ACCOUNT_EMAIL, password: "synthetic" }, { headers: {} })).id, id);

  let ownerPresent = false, dataReads = 0;
  const repository = { user: { findUnique: async ({ where }: any) => {
    assert.equal(where.email, DEMO_ACCOUNT_EMAIL); return ownerPresent ? { id: "fixed-demo-owner" } : null;
  } }, deal: {}, mADeal: {} } as any;
  for (const delegate of [repository.deal, repository.mADeal]) {
    delegate.findMany = async (args: any) => {
      dataReads++; assert.equal(args.where.userId, "fixed-demo-owner"); assert.equal(args.take, 12);
      assert(!JSON.stringify(args.select).includes('"url"')); return [];
    };
    delegate.findFirst = async (args: any) => {
      dataReads++; assert.equal(args.where.userId, "fixed-demo-owner");
      assert.equal(args.select.documents.take, 20);
      assert(!JSON.stringify(args.select).includes('"parsedText"'));
      assert(!JSON.stringify(args.select).includes('"url"'));
      if (args.where.id === "customer-deal") return null;
      return { id: args.where.id, documents: [], reports: [{ sections: [{ content: "x".repeat(9000) }] }] };
    };
  }
  const demo = load("src/lib/admin-demo.ts", { "./prisma": { prisma: repository }, "./demo-access": { DEMO_ACCOUNT_EMAIL } });
  assert.equal(await demo.loadAdminDemoWorkspace(), null); assert.equal(dataReads, 0);
  assert.equal(await demo.loadAdminDemoDetail("vc", "customer-deal"), null); assert.equal(dataReads, 0);
  ownerPresent = true; await demo.loadAdminDemoWorkspace(); assert.equal(dataReads, 2);
  for (const track of ["vc", "pe"]) {
    assert.equal(await demo.loadAdminDemoDetail(track, "customer-deal"), null);
    const preview = await demo.loadAdminDemoDetail(track, "demo-deal");
    assert.equal(preview.reports[0].sections[0].content.length, 8000);
    assert.equal(preview.reports[0].sections[0].truncated, true);
  }
  const readsBeforeInvalid = dataReads;
  assert.equal(await demo.loadAdminDemoDetail("invalid", "demo-deal"), null);
  assert.equal(dataReads, readsBeforeInvalid);

  // Actual pages must stop before data access; protecting only a layout is insufficient.
  let pageReads = 0;
  const deniedGuard = { requirePlatformAdmin: async () => { throw new Error("denied"); } };
  const ui = { Card: "div", CardContent: "div", CardHeader: "div", CardTitle: "h2" };
  const imports: Record<string, unknown> = {
    "react/jsx-runtime": jsx, "next/link": { __esModule: true, default: "a" },
    "next/navigation": { notFound: () => { throw new Error("missing"); } },
    "lucide-react": { ArrowRight: "span", FlaskConical: "span", DollarSign: "span", HelpCircle: "span", ShieldCheck: "span" },
    "@/components/ui/card": ui, "@/components/ui/badge": { Badge: "span" },
    "@/components/admin/daily-cost-chart": { DailyCostChart: "div" },
    "@/components/admin/admin-navigation": { AdminNavigation: "nav" },
    "@/lib/brand": { BRAND }, "@/lib/platform-admin-server": deniedGuard,
    "@/lib/admin-demo": { loadAdminDemoWorkspace: async () => { pageReads++; }, loadAdminDemoDetail: async () => { pageReads++; } },
    "@/lib/prisma": { prisma: { usageLog: { findMany: async () => { pageReads++; } } } },
    "@/lib/usage-cost-report": { buildUsageCostReport: () => ({}) },
  };
  for (const file of ["src/app/admin/layout.tsx", "src/app/admin/page.tsx", "src/app/admin/demo/page.tsx",
    "src/app/admin/demo/[track]/[id]/page.tsx", "src/app/admin/usage-cost/page.tsx"]) {
    const page = load(file, imports).default;
    await assert.rejects(page({ children: null, params: { track: "vc", id: "demo-deal" }, searchParams: {} }), /denied/);
    assert.equal(pageReads, 0);
  }
  console.log("PASS admin workspace: server gate, live identity, demo login/session revocation, owner scope, bounded previews and page guards (offline)");
}

main().catch(() => { console.error("FAIL admin workspace regression"); process.exitCode = 1; });

/** Real team handlers with serialized in-memory transactions. No DB/network/keys. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file: string, modules: Record<string, unknown>): any {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, console, require: (name: string) => {
    assert(name in modules, `Unmocked import ${name}`);
    return modules[name];
  } }, { filename: file });
  return exports;
}

async function main() {
  type User = { id: string; name: string; email: string; role: string; teamRole: string | null; teamId: string | null };
  type Team = { id: string; name: string; ownerUserId: string | null };
  let users: User[] = [
    { id: "creator", name: "Creator", email: "creator@example.invalid", role: "ANALYST", teamRole: null, teamId: null },
    { id: "member", name: "Member", email: "member@example.invalid", role: "ADMIN", teamRole: null, teamId: null },
    { id: "outsider", name: "Outsider", email: "outsider@example.invalid", role: "ANALYST", teamRole: null, teamId: "other" },
  ];
  let teams: Team[] = [{ id: "other", name: "Other", ownerUserId: "outsider" }];
  let actor = "creator", nextId = 0;
  let beforeTransaction: (() => void) | undefined;
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const matches = (user: User, where: any): boolean =>
    (!where.id || user.id === where.id) && (!where.email || user.email === where.email) &&
    (!("teamId" in where) || user.teamId === where.teamId) &&
    (!where.OR || where.OR.some((part: any) =>
      (part.teamRole === null ? user.teamRole === null : part.teamRole?.in?.includes(user.teamRole)) &&
      (!part.role || part.role.in.includes(user.role))));
  const userRow = (where: any) => {
    const user = users.find((row) => matches(row, where));
    return user ? { ...copy(user), team: copy(teams.find((team) => team.id === user.teamId) ?? null) } : null;
  };
  const tx = {
    user: {
      findUnique: async ({ where }: any) => userRow(where),
      findFirst: async ({ where }: any) => userRow(where),
      count: async ({ where }: any) => users.filter((row) => matches(row, where)).length,
      updateMany: async ({ where, data }: any) => {
        assert(!("role" in data), "team operations must never mutate global account role");
        const rows = users.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    team: {
      create: async ({ data }: any) => { const row = { id: `team-${++nextId}`, ...data }; teams.push(row); return copy(row); },
      updateMany: async ({ where }: any) => ({ count: teams.some((row) => row.id === where.id) ? 1 : 0 }),
      update: async ({ where, data }: any) => { const row = teams.find((team) => team.id === where.id)!; Object.assign(row, data); return copy(row); },
      findUnique: async ({ where, include }: any) => {
        const row = teams.find((team) => team.id === where.id);
        if (!row) return null;
        return include ? { ...copy(row), users: copy(users.filter((user) => user.teamId === row.id)), _count: {} } : copy(row);
      },
    },
  };
  let queue = Promise.resolve();
  const prisma = { ...tx, $transaction: <T>(operation: (client: typeof tx) => Promise<T>) => {
    const job = queue.then(async () => {
      beforeTransaction?.(); beforeTransaction = undefined;
      const snapshot = { users: copy(users), teams: copy(teams) };
      try { return await operation(tx); } catch (error) { users = snapshot.users; teams = snapshot.teams; throw error; }
    });
    queue = job.then(() => undefined, () => undefined);
    return job;
  } };
  const modules: Record<string, unknown> = {
    "@/lib/prisma": { prisma }, "@/lib/auth": { authOptions: {} },
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => ({ user: { id: actor } }) },
    "zod": require("zod"), "@/lib/plan-gates": { requireFeature: async () => null },
    "@prisma/client": { UserRole: { ADMIN: "ADMIN", PARTNER: "PARTNER", ANALYST: "ANALYST" } },
  };
  const access = load("src/lib/team-access.ts", modules);
  modules["@/lib/team-access"] = access;
  const team = load("src/app/api/team/route.ts", modules);
  const members = load("src/app/api/team/members/route.ts", modules);
  const roles = load("src/app/api/team/members/role/route.ts", modules);
  const request = (body: unknown) => new Request("http://offline.invalid", { method: "POST", body: JSON.stringify(body) });

  const created = await Promise.all([team.POST(request({ name: "Desk" })), team.POST(request({ name: "Concurrent" }))]);
  assert.deepEqual(created.map((res) => res.status).sort(), [201, 409]);
  assert.equal(teams.length, 2, "losing team creation transaction rolls back orphan team");
  const owner = users.find((user) => user.id === actor)!;
  assert.equal(owner.role, "ANALYST");
  assert.equal(owner.teamRole, "ANALYST");
  const context = await access.getUserTeamContext(actor);
  assert.equal(context.isTeamOwner, true);
  assert.equal(context.accountRole, "ANALYST", "owner never receives global ADMIN role");
  assert.equal(context.role, "PARTNER", "owner gets scoped shared edit capability");
  assert.equal((await team.PATCH(request({ name: "Owner rename" }))).status, 200);
  assert.equal((await members.DELETE(request({ userId: actor }))).status, 409);
  assert.equal((await roles.PATCH(request({ userId: actor, role: "ADMIN" }))).status, 409);
  const member = users.find((user) => user.id === "member")!;
  // Accepted invitation fixture; invitation/acceptance handlers have their own regression suite.
  member.teamId = owner.teamId;
  member.teamRole = "ANALYST";
  assert.equal(member.teamRole, "ANALYST", "new membership cannot inherit previous global ADMIN capability");
  assert.equal(member.role, "ADMIN", "adding member preserves account role");
  const teamData = (await (await team.GET()).json()).data;
  assert(teamData.canManage && teamData.canChangeRoles);
  assert.equal(teamData.users.find((user: any) => user.id === "member").role, "ANALYST");
  actor = "member";
  assert.equal((await team.PATCH(request({ name: "Unauthorized rename" }))).status, 403);
  assert.equal((await roles.PATCH(request({ userId: "creator", role: "ANALYST" }))).status, 403);
  actor = "creator";
  assert.equal((await roles.PATCH(request({ userId: "member", role: "PARTNER" }))).status, 200);
  assert.equal(member.role, "ADMIN");
  assert.equal(member.teamRole, "PARTNER");
  assert.equal((await roles.PATCH(request({ userId: "outsider", role: "ADMIN" }))).status, 404);
  assert.equal((await members.POST(request({ email: "outsider@example.invalid" }))).status, 409);
  actor = "member";
  assert.equal((await members.DELETE(request({ userId: actor }))).status, 200);
  assert.equal(member.teamId, null);
  assert.equal(member.teamRole, null);
  assert.equal(member.role, "ADMIN");

  teams.push({ id: "legacy", name: "Legacy", ownerUserId: null });
  member.teamId = "legacy";
  const legacy = await access.getUserTeamContext("member");
  assert.equal(legacy.isTeamOwner, false);
  assert.equal(legacy.role, "ADMIN", "null teamRole preserves explicit legacy behavior without backfill");
  assert.equal((await members.DELETE(request({ userId: actor }))).status, 409, "last legacy manager cannot leave");
  actor = "creator";
  beforeTransaction = () => { owner.teamId = null; };
  assert.equal((await team.PATCH(request({ name: "Stale permission" }))).status, 403, "membership checked again after team lock");
  owner.teamId = context.teamId;
  const outsider = await access.getUserTeamContext("outsider");
  assert.equal(outsider.teamId, "other");
  assert.equal(outsider.isTeamOwner, true);
  assert.equal(teams.find((row) => row.id === context.teamId)!.name, "Owner rename", "another team owner cannot alter this team");
  for (const file of ["prisma/schema.prisma", "prisma/schema.sqlite.prisma"]) {
    const schema = fs.readFileSync(file, "utf8");
    assert(schema.includes("teamRole           UserRole?"));
    assert(schema.includes("ownerUserId String?"));
    assert(schema.includes('onDelete: Restrict'), "account deletion cannot leave a dangling owner");
  }
  console.log("Offline team owner/scoped roles/concurrent create rollback/membership CAS/owner protection/legacy manager regression passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

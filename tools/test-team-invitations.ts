/** Real invitation/ownership handlers, fake serialized DB. No mail, paid service or DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Row = Record<string, any>;
function load(file: string, modules: Row): any {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Date, console, require: (name: string) => {
    assert(name in modules, `Unmocked import ${name}`);
    return modules[name];
  } }, { filename: file });
  return exports;
}
async function main() {
  let actor: string | null = "owner", nextId = 0;
  let users: Row[] = [
    { id: "owner", role: "ANALYST", teamRole: "ANALYST", teamId: "a", name: "Owner", email: "owner@example.invalid", subscriptionPlan: "FREE" },
    { id: "ownerB", role: "ANALYST", teamRole: "ANALYST", teamId: "b", name: "Owner B", email: "owner-b@example.invalid" },
    { id: "target", role: "ADMIN", teamRole: null, teamId: null, name: "Target", email: "target@example.invalid", subscriptionPlan: "FREE" },
    { id: "reject", role: "ANALYST", teamRole: null, teamId: null, name: "Reject", email: "reject@example.invalid" },
    { id: "manager", role: "ANALYST", teamRole: "PARTNER", teamId: "a", name: "Manager", email: "manager@example.invalid" },
  ];
  let teams: Row[] = [{ id: "a", name: "A", ownerUserId: "owner" }, { id: "b", name: "B", ownerUserId: "ownerB" }];
  let invitations: Row[] = [];
  const clone = (row: Row): Row => ({ ...row });
  const match = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part: Row) => match(row, part));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lte" in value) return row[key] <= value.lte;
      if ("gt" in value) return row[key] > value.gt;
    }
    return row[key] === value;
  });
  const findUser = (where: Row) => {
    const row = users.find((user) => match(user, where));
    return row ? { ...row, team: teams.find((team) => team.id === row.teamId) ?? null } : null;
  };
  const tx = {
    user: {
      findUnique: async ({ where }: Row) => findUser(where),
      findFirst: async ({ where }: Row) => findUser(where),
      updateMany: async ({ where, data }: Row) => {
        assert(!("role" in data) && !("subscriptionPlan" in data), "global account role/plan immutable");
        const rows = users.filter((user) => match(user, where)); rows.forEach((user) => Object.assign(user, data));
        return { count: rows.length };
      },
      count: async ({ where }: Row) => users.filter((user) => match(user, where)).length,
    },
    team: {
      updateMany: async ({ where, data }: Row) => {
        const rows = teams.filter((team) => match(team, where)); rows.forEach((team) => Object.assign(team, data));
        return { count: rows.length };
      },
      findUnique: async ({ where }: Row) => { const row = teams.find((team) => match(team, where)); return row ? clone(row) : null; },
    },
    teamInvitation: {
      findUnique: async ({ where }: Row) => { const row = invitations.find((invitation) => match(invitation, where)); return row ? clone(row) : null; },
      findFirst: async ({ where }: Row) => { const row = invitations.find((invitation) => match(invitation, where)); return row ? clone(row) : null; },
      findMany: async ({ where, take }: Row) => invitations.filter((invitation) => match(invitation, where)).slice(-take).reverse().map((row) => ({
        ...row, team: { name: teams.find((team) => team.id === row.teamId)!.name },
        invitedBy: { name: users.find((user) => user.id === row.invitedByUserId)!.name },
        target: { name: users.find((user) => user.id === row.targetUserId)!.name, email: users.find((user) => user.id === row.targetUserId)!.email },
      })),
      create: async ({ data }: Row) => { const row = { id: `invite-${++nextId}`, status: "PENDING", createdAt: new Date(), ...data }; invitations.push(row); return clone(row); },
      updateMany: async ({ where, data }: Row) => { const rows = invitations.filter((invitation) => match(invitation, where)); rows.forEach((row) => Object.assign(row, data)); return { count: rows.length }; },
    },
  };
  let queue = Promise.resolve();
  const prisma = { ...tx, $transaction: <T>(fn: (client: typeof tx) => Promise<T>) => {
    const job = queue.then(async () => {
      const before = { users: users.map(clone), teams: teams.map(clone), invitations: invitations.map(clone) };
      try { return await fn(tx); } catch (error) { users = before.users; teams = before.teams; invitations = before.invitations; throw error; }
    });
    queue = job.then(() => undefined, () => undefined);
    return job;
  } };
  const modules: Row = {
    "@/lib/prisma": { prisma }, "@/lib/auth": { authOptions: {} }, zod: require("zod"),
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => actor ? { user: { id: actor } } : null },
    "@/lib/plan-gates": { requireFeature: async () => null },
  };
  const access = load("src/lib/team-access.ts", modules); modules["@/lib/team-access"] = access;
  const members = load("src/app/api/team/members/route.ts", modules);
  const inbox = load("src/app/api/team/invitations/route.ts", modules);
  const respond = load("src/app/api/team/invitations/[id]/route.ts", modules);
  const ownership = load("src/app/api/team/ownership/route.ts", modules);
  const request = (body: Row) => new Request("http://offline.invalid", { method: "POST", body: JSON.stringify(body) });
  const action = (id: string, action: string) => respond.PATCH(request({ action }), { params: { id } });
  const invite = async (email: string) => {
    const response = await members.POST(request({ email })); assert.equal(response.status, 201);
    return (await response.json()).data.id as string;
  };
  const target = () => users.find((user) => user.id === "target")!;
  const row = (id: string) => invitations.find((invitation) => invitation.id === id)!;
  const first = await invite("  TARGET@example.invalid  ");
  assert.equal(target().teamId, null, "invitation does not grant membership/access");
  assert.equal((await members.POST(request({ email: "target@example.invalid" }))).status, 409, "duplicate pending invite blocked");
  actor = "ownerB";
  assert.equal((await action(first, "accept")).status, 403);
  assert.equal((await action(first, "cancel")).status, 403, "other team owner cannot cancel");
  actor = "target";
  const incoming = (await (await inbox.GET()).json()).data;
  assert.equal(incoming.incoming.length, 1);
  assert.equal(incoming.outgoing.length, 0);
  assert.equal((await action(first, "accept")).status, 200);
  assert.equal(target().teamId, "a");
  assert.equal(target().teamRole, "ANALYST", "global ADMIN cannot inherit team role");
  assert.equal(target().role, "ADMIN"); assert.equal(target().subscriptionPlan, "FREE");
  assert.equal((await action(first, "accept")).status, 409, "replay is terminal");
  actor = "owner";
  assert.equal((await ownership.POST(request({ userId: "ownerB" }))).status, 404);
  assert.equal((await ownership.POST(request({ userId: "owner" }))).status, 400);
  assert.equal((await ownership.POST(request({ userId: "target" }))).status, 200);
  assert.equal((await access.getUserTeamContext("owner")).isTeamOwner, false);
  assert.equal((await access.getUserTeamContext("target")).isTeamOwner, true);
  assert.equal((await ownership.POST(request({ userId: "manager" }))).status, 403, "former owner loses ownership action");
  assert.equal((await members.DELETE(request({ userId: "owner" }))).status, 200, "former owner may leave after transfer");
  actor = "target";
  assert.equal((await members.DELETE(request({ userId: "target" }))).status, 409, "new owner protected");
  const rejected = await invite("reject@example.invalid");
  actor = "reject";
  assert.equal((await action(rejected, "reject")).status, 200);
  assert.equal(row(rejected).status, "REJECTED");
  assert.equal((await action(rejected, "accept")).status, 409);
  actor = "target";
  const cancelled = await invite("reject@example.invalid");
  assert.notEqual(cancelled, rejected, "new invitation ID prevents old action from addressing reinvite");
  assert.equal((await action(cancelled, "cancel")).status, 200);
  actor = "reject"; assert.equal((await action(cancelled, "accept")).status, 409);
  actor = "target";
  const expired = await invite("reject@example.invalid");
  row(expired).expiresAt = new Date(0);
  actor = "reject";
  assert.equal((await action(expired, "accept")).status, 409);
  assert.equal(row(expired).status, "EXPIRED");
  actor = "target";
  const expiredOnRead = await invite("reject@example.invalid");
  row(expiredOnRead).expiresAt = new Date(0);
  actor = "reject"; await inbox.GET(); assert.equal(row(expiredOnRead).status, "EXPIRED");
  actor = "manager";
  const revoked = await invite("reject@example.invalid");
  users.find((user) => user.id === "manager")!.teamRole = "ANALYST";
  actor = "reject"; assert.equal((await action(revoked, "accept")).status, 403, "inviter privilege revoked before acceptance");
  assert.equal(row(revoked).status, "PENDING");
  assert.equal((await action(revoked, "reject")).status, 200, "target may reject after inviter privilege revoked");
  actor = "target";
  const concurrentA = await invite("reject@example.invalid");
  actor = "ownerB"; const concurrentB = await invite("reject@example.invalid");
  actor = "reject";
  const competing = await Promise.all([action(concurrentA, "accept"), action(concurrentB, "accept")]);
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  assert.equal([row(concurrentA), row(concurrentB)].filter((invitation) => invitation.status === "ACCEPTED").length, 1);
  assert.equal([row(concurrentA), row(concurrentB)].filter((invitation) => invitation.status === "PENDING").length, 1, "losing membership CAS rolls invitation back");
  actor = null;
  assert.equal((await inbox.GET()).status, 401);
  assert.equal((await action(first, "accept")).status, 401);
  assert.equal((await ownership.POST(request({ userId: "manager" }))).status, 401);
  actor = "target";
  assert.equal((await action(first, "invalid")).status, 400);
  assert.equal((await action("missing", "accept")).status, 404);
  const transfers = await Promise.all([
    ownership.POST(request({ userId: "manager" })),
    ownership.POST(request({ userId: "reject" })),
  ]);
  assert.deepEqual(transfers.map((response) => response.status).sort(), [200, 409], "two ownership transfers have one winner");
  console.log("Offline invitations target consent/replay/expiry/revocation/cancel/concurrent membership rollback/ownership/account-role-plan regression passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

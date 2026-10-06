/** Synthetic source API + disposable PostgreSQL only; no browser, email, payment or AI. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";
import { SYNTHETIC_MODEL } from "./helpers/synthetic-generation";

let safeDiagnosis: { kind: "HTTP_STATUS" | "CONCURRENT_STATUS"; actual: number[]; expected: number } | undefined;
function singleWinner(statuses: number[], success: number, losers: readonly number[] = [409]) {
  safeDiagnosis = { kind: "CONCURRENT_STATUS", actual: statuses, expected: success };
  assert.equal(statuses.filter(status => status === success).length, 1, "exactly one concurrent operation wins");
  assert(statuses.every(status => status === success || losers.includes(status)), "losers must be explicit conflicts, never server errors");
  safeDiagnosis = undefined;
}
function preflight() {
  singleWinner([201, 409, 409], 201);
  singleWinner([200, 403], 200, [403, 409]);
  assert.throws(() => singleWinner([200, 200], 200));
  assert.throws(() => singleWinner([200, 500], 200));
  assert.throws(() => singleWinner([409, 409], 200));
  safeDiagnosis = undefined;
  console.log("Team workflow offline preflight PASS; actual PostgreSQL concurrency, API and browser not executed by preflight.");
}

let stage = "safety guards";
async function runApi() {
  assert(process.argv.includes("--fresh-isolated-server"), "A fresh isolated source server is required.");
  const base = process.env.BASE_URL ?? "http://localhost:3112";
  assertE2ETarget(base);
  assertCleanE2EWorkspace();
  assertNoExternalE2ECredentials();
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.STORAGE_MODE, "local");
  assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
  preflight();
  const prefix = `e2e-team-${randomUUID()}`;
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  type Actor = { id?: string; email: string; password: string; ip: string; jar: Map<string, string> };
  const actors: Actor[] = Array.from({ length: 9 }, (_, index) => ({ email: `${prefix}-${index}@example.invalid`, password: `Synthetic-${randomUUID()}-Aa1!`, ip: `2001:db8:6:${prefix.slice(-4)}::${index + 1}`, jar: new Map() }));
  const [ownerA, ownerB, shared, successorA, successorB, outsider, late, expired, creator] = actors;
  const names = [prefix + "-A", prefix + "-B", prefix + "-C", prefix + "-renamed"];
  async function request(actor: Actor, route: string, method = "GET", body?: unknown) {
    assert(route.startsWith("/api/") && !route.startsWith("//"));
    const headers = new Headers({ "x-forwarded-for": actor.ip });
    if (actor.jar.size) headers.set("cookie", [...actor.jar].map(([key, value]) => `${key}=${value}`).join("; "));
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(new URL(route, base), { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL, "ordinary application servers are refused");
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]; const at = pair.indexOf("=");
      if (at > 0) actor.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }
  async function json(actor: Actor, route: string, method = "GET", body?: unknown, expected = 200) {
    const response = await request(actor, route, method, body);
    safeDiagnosis = { kind: "HTTP_STATUS", actual: [response.status], expected };
    assert.equal(response.status, expected, `${stage}: ${method} ${route.replace(/\/[^/]+$/, "/resource")} status`);
    safeDiagnosis = undefined;
    return response.json();
  }
  async function login(actor: Actor) {
    const { csrfToken } = await json(actor, "/api/auth/csrf");
    const response = await fetch(new URL("/api/auth/callback/credentials", base), {
      method: "POST", headers: { "x-forwarded-for": actor.ip, cookie: [...actor.jar].map(([key, value]) => `${key}=${value}`).join("; "), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email: actor.email, password: actor.password, json: "true" }), redirect: "manual", signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL);
    assert([200, 302].includes(response.status));
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const at = pair.indexOf("="); if (at > 0) actor.jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    assert.equal((await json(actor, "/api/auth/session")).user?.id, actor.id);
  }
  const invitation = async (owner: Actor, target: Actor) => (await json(owner, "/api/team/members", "POST", { email: target.email }, 201)).data;
  const action = (actor: Actor, id: string, value: string, expected = 200) => json(actor, `/api/team/invitations/${id}`, "PATCH", { action: value, role: "ADMIN" }, expected);
  try {
    // Read-only attestation before any fixture writes.
    await json(ownerA, "/api/auth/csrf");
    await json(ownerA, "/api/team", "GET", undefined, 401);
    stage = "fresh synthetic accounts";
    for (const actor of actors) {
      const registered = await json(actor, "/api/auth/register", "POST", { name: "합성 팀 테스트", email: actor.email, password: actor.password }, 201);
      actor.id = registered.data.id;
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: actor.id } })).email, actor.email);
      // Test entitlement only on these freshly registered accounts, not a payment/upgrade assertion.
      if ([ownerA, ownerB, creator].includes(actor)) await db.user.update({ where: { id: actor.id }, data: { subscriptionPlan: "MULTI", subscriptionStatus: "ACTIVE" } });
      await login(actor);
    }
    stage = "FREE team feature gate";
    await json(outsider, "/api/team", "POST", { name: prefix + "-refused" }, 402);
    stage = "concurrent team creation";
    const creates = await Promise.all(Array.from({ length: 4 }, () => request(ownerA, "/api/team", "POST", { name: names[0] })));
    singleWinner(creates.map(response => response.status), 201);
    const teamA = (await creates.find(response => response.status === 201)!.json()).data;
    const teamB = (await json(ownerB, "/api/team", "POST", { name: names[1] }, 201)).data;
    assert.equal(await db.team.count({ where: { name: names[0] } }), 1, "failed creation transactions leave no orphan teams");
    assert.equal(teamA.ownerUserId, ownerA.id);

    stage = "invitation consent and concurrent cross-team acceptance";
    const invitations = await Promise.all(Array.from({ length: 2 }, () => request(ownerA, "/api/team/members", "POST", { email: shared.email })));
    singleWinner(invitations.map(response => response.status), 201);
    const inviteA = (await invitations.find(response => response.status === 201)!.json()).data;
    const inviteB = await invitation(ownerB, shared);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).teamId, null, "inviting never silently joins a user");
    await json(ownerA, "/api/team/members", "POST", { email: shared.email }, 409);
    const incoming = (await json(shared, "/api/team/invitations")).data.incoming;
    assert(incoming.some((item: { id: string }) => item.id === inviteA.id) && incoming.some((item: { id: string }) => item.id === inviteB.id));
    await action(outsider, inviteA.id, "accept", 403);
    await action(ownerB, inviteA.id, "cancel", 403);
    assert.equal((await json(outsider, "/api/team/invitations")).data.incoming.length, 0);
    const accepts = await Promise.all([inviteA, inviteB].map(invite => request(shared, `/api/team/invitations/${invite.id}`, "PATCH", { action: "accept", role: "ADMIN" })));
    singleWinner(accepts.map(response => response.status), 200);
    const acceptedIndex = accepts.findIndex(response => response.status === 200);
    const attached = await db.user.findUniqueOrThrow({ where: { id: shared.id } });
    assert.equal(attached.teamId, acceptedIndex === 0 ? teamA.id : teamB.id);
    assert.equal(attached.teamRole, "ANALYST", "request cannot elevate the invitation role");
    const loser = acceptedIndex === 0 ? inviteB : inviteA;
    assert.equal((await db.teamInvitation.findUniqueOrThrow({ where: { id: loser.id } })).status, "PENDING", "failed acceptance rolls back invitation CAS");
    await action(acceptedIndex === 0 ? ownerB : ownerA, loser.id, "cancel");
    await action(shared, [inviteA, inviteB][acceptedIndex].id, "accept", 409);

    stage = "same invitation acceptance CAS";
    for (const successor of [successorA, successorB]) {
      const invite = await invitation(ownerA, successor);
      const same = await Promise.all(Array.from({ length: 2 }, () => request(successor, `/api/team/invitations/${invite.id}`, "PATCH", { action: "accept" })));
      singleWinner(same.map(response => response.status), 200);
    }
    const lateInvite = await invitation(ownerA, late);
    stage = "ownership authorization and concurrent transfer";
    await json(successorA, "/api/team/ownership", "POST", { userId: successorB.id }, 403);
    await json(ownerA, "/api/team/ownership", "POST", { userId: outsider.id }, 404);
    await json(ownerA, "/api/team/ownership", "POST", { userId: ownerA.id }, 400);
    await json(ownerA, "/api/team/members", "DELETE", { userId: ownerA.id }, 409);
    const transfers = await Promise.all([successorA, successorB].map(successor => request(ownerA, "/api/team/ownership", "POST", { userId: successor.id })));
    singleWinner(transfers.map(response => response.status), 200, [403, 409]);
    const newOwner = [successorA, successorB][transfers.findIndex(response => response.status === 200)];
    assert.equal((await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).ownerUserId, newOwner.id);
    await json(ownerA, "/api/team", "PATCH", { name: names[3] }, 403);
    await json(newOwner, "/api/team", "PATCH", { name: names[3] });
    await json(newOwner, "/api/team/members", "DELETE", { userId: newOwner.id }, 409);
    await action(late, lateInvite.id, "accept", 403);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: late.id } })).teamId, null);
    await action(newOwner, lateInvite.id, "cancel");
    await json(ownerA, "/api/team/members", "DELETE", { userId: ownerA.id });

    stage = "rejection and expired invitation refuse attachment";
    const rejected = await invitation(ownerB, expired);
    await action(expired, rejected.id, "reject");
    await action(expired, rejected.id, "accept", 409);
    assert.equal((await db.teamInvitation.findUniqueOrThrow({ where: { id: rejected.id } })).status, "REJECTED");
    const expiring = await invitation(ownerB, expired);
    await db.teamInvitation.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await action(expired, expiring.id, "accept", 409);
    assert.equal((await db.teamInvitation.findUniqueOrThrow({ where: { id: expiring.id } })).status, "EXPIRED");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: expired.id } })).teamId, null);

    stage = "invite acceptance versus creating one's own team";
    const creationInvite = await invitation(ownerB, creator);
    const competition = await Promise.all([request(creator, `/api/team/invitations/${creationInvite.id}`, "PATCH", { action: "accept" }), request(creator, "/api/team", "POST", { name: names[2] })]);
    assert.deepEqual(competition.map(response => response.status).sort(), competition[0].status === 200 ? [200, 409] : [201, 409]);
    const createdCount = await db.team.count({ where: { name: names[2] } });
    assert.equal(createdCount, competition[1].status === 201 ? 1 : 0, "losing creation has no orphan team");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: creator.id } })).teamId === teamB.id, competition[0].status === 200);
    assert.equal(await db.usageLog.count({ where: { userId: { in: actors.map(actor => actor.id!) } } }), 0);
    console.log("Synthetic team source API/PostgreSQL PASS: concurrent creation, invitation consent/CAS, ownership transfer, expiry and membership races. No payment, email, model or Next browser verification claimed.");
  } finally {
    try {
      // Discover even accounts created before a failed response; exact unpredictable addresses only.
      const users = await db.user.findMany({ where: { email: { in: actors.map(actor => actor.email) } }, select: { id: true, email: true } });
      assert(users.every(user => user.email !== null && user.email.startsWith(prefix + "-")));
      const ids = users.map(user => user.id);
      const teams = await db.team.findMany({ where: { name: { in: names } }, select: { id: true, ownerUserId: true } });
      assert(teams.every(team => team.ownerUserId === null || ids.includes(team.ownerUserId)), "cleanup never includes a nonfixture owner");
      await db.$transaction(async tx => {
        await tx.teamInvitation.deleteMany({ where: { OR: [{ targetUserId: { in: ids } }, { invitedByUserId: { in: ids } }] } });
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { teamId: null, teamRole: null } });
        await tx.team.updateMany({ where: { id: { in: teams.map(team => team.id) } }, data: { ownerUserId: null } });
        await tx.team.deleteMany({ where: { id: { in: teams.map(team => team.id) } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
        await tx.rateLimit.deleteMany({ where: { key: { in: actors.map(actor => `register:${actor.ip}`) } } });
      });
      assert.equal(await db.user.count({ where: { email: { in: actors.map(actor => actor.email) } } }), 0);
      assert.equal(await db.team.count({ where: { name: { in: names } } }), 0);
    } finally { await db.$disconnect(); }
  }
}
if (process.argv.includes("--run-api")) runApi().catch(() => { console.error(JSON.stringify({ result: "SYNTHETIC_TEAM_FAILED", stage, diagnostic: safeDiagnosis ?? "NON_HTTP_ASSERTION_OR_RUNTIME" })); process.exitCode = 1; });
else preflight();

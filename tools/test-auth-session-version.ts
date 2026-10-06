import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import {
  AuthSessionInvalid,
  passwordSessionVersion,
  validatePasswordSession,
} from "../src/lib/auth-session-version";
import type { JWT } from "next-auth/jwt";

// Synthetic records only: no Prisma/auth options/env imports or external calls.
const id = "synthetic-session-user";
const initial = "synthetic-initial-hash";
const changed = "synthetic-changed-hash";
const version = passwordSessionVersion(id, initial);
const token = { id, authSessionVersion: version, role: "ANALYST" } as JWT;
const readInitial = async () => ({ passwordHash: initial, role: "ANALYST" as const });

async function main() {
  assert.equal((await validatePasswordSession(token, readInitial)).id, id);
  assert.equal((await validatePasswordSession({} as JWT, readInitial, {
    id, authSessionVersion: version,
  })).authSessionVersion, version);
  assert.notEqual(passwordSessionVersion("different-user", initial), version);
  for (const candidate of [undefined, "", "invalid", "0".repeat(64)]) {
    await assert.rejects(validatePasswordSession({ ...token, authSessionVersion: candidate }, readInitial), AuthSessionInvalid);
  }
  await assert.rejects(validatePasswordSession(token, async () => ({ passwordHash: changed })), AuthSessionInvalid);
  await assert.rejects(validatePasswordSession(token, async () => null), AuthSessionInvalid);
  await assert.rejects(validatePasswordSession(token, async () => ({ passwordHash: null })), AuthSessionInvalid);
  await assert.rejects(validatePasswordSession(token, async () => { throw new Error("synthetic private diagnostic"); }), {
    name: "AuthSessionInvalid", message: "Authentication session is no longer valid",
  });
  await assert.rejects(validatePasswordSession(token, async () => ({ passwordHash: changed }), {
    id, authSessionVersion: version,
  }), AuthSessionInvalid); // Password changed between authorize and JWT issuance.
  const refreshed = await validatePasswordSession(token, async () => ({ passwordHash: initial, role: "PARTNER" }));
  assert.equal(refreshed.role, "PARTNER");

  // Exercise the installed NextAuth 4 session handler with mocks. Its null-token
  // behavior is unsuitable; callback rejection must clean cookies and omit a session.
  const require = createRequire(import.meta.url);
  const handler = require(path.join(path.dirname(require.resolve("next-auth")), "core/routes/session.js")).default;
  async function handlerResult(revoked: boolean) {
    let encoded = 0;
    let cleaned = 0;
    let projected = 0;
    const result = await handler({
      sessionStore: {
        value: "synthetic-cookie",
        clean: () => { cleaned++; return [{ name: "synthetic-cookie", value: "", options: { maxAge: 0 } }]; },
        chunk: () => [],
      },
      options: {
        session: { strategy: "jwt", maxAge: 3600 },
        jwt: { decode: async () => token, encode: async () => { encoded++; return "synthetic-encoded"; } },
        callbacks: {
          jwt: ({ token: incoming }: { token: JWT }) => validatePasswordSession(incoming,
            async () => ({ passwordHash: revoked ? changed : initial, role: "ANALYST" })),
          session: ({ session, token: valid }: { session: { user: Record<string, unknown> }; token: JWT }) => {
            projected++;
            return { ...session, user: { ...session.user, id: valid.id, role: valid.role } };
          },
        },
        events: {},
        logger: { error: (code: string, error: Error) => {
          assert.equal(code, "JWT_SESSION_ERROR");
          assert.equal(error.message, "Authentication session is no longer valid");
        } },
      },
    });
    return { result, encoded, cleaned, projected };
  }
  const valid = await handlerResult(false);
  assert.equal(valid.projected, 1);
  assert.equal(valid.encoded, 1);
  assert.equal(valid.cleaned, 0);
  assert.equal(valid.result.body.user.id, id);
  assert.equal(JSON.stringify(valid.result.body).includes(version), false);
  const revoked = await handlerResult(true);
  assert.deepEqual(revoked.result.body, {});
  assert.equal(revoked.cleaned, 1);
  assert.equal(revoked.encoded, 0);
  assert.equal(revoked.projected, 0);
  assert.equal(revoked.result.cookies[0].options.maxAge, 0);
  console.log("PASS auth session revocation: synthetic records and installed NextAuth handler");
}

main().catch(() => {
  // Assertions can include compared values; avoid dumping them into shared logs.
  console.error("FAIL auth session revocation");
  process.exitCode = 1;
});

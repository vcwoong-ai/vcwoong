import { createHash, timingSafeEqual } from "node:crypto";
import type { JWT } from "next-auth/jwt";

/** Server-only revocation marker; never expose it through the Session callback. */
export function passwordSessionVersion(userId: string, passwordHash: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["dealmind-password-session-v1", userId, passwordHash]))
    .digest("hex");
}

export class AuthSessionInvalid extends Error {
  constructor() {
    super("Authentication session is no longer valid");
    this.name = "AuthSessionInvalid";
  }
}

interface SessionUser {
  passwordHash: string | null;
  role?: JWT["role"];
}

function matchesVersion(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && /^[a-f0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

/** Every session read checks the DB; client session-update data is deliberately ignored. */
export async function validatePasswordSession(
  token: JWT,
  readUser: (id: string) => Promise<SessionUser | null>,
  signedInUser?: { id: string; authSessionVersion?: string }
): Promise<JWT> {
  const id = signedInUser?.id ?? token.id;
  if (typeof id !== "string" || !id) throw new AuthSessionInvalid();
  let user: SessionUser | null;
  try {
    user = await readUser(id);
  } catch {
    // Do not pass database diagnostics or user data into NextAuth's error logger.
    throw new AuthSessionInvalid();
  }
  if (!user?.passwordHash) throw new AuthSessionInvalid();
  const expected = passwordSessionVersion(id, user.passwordHash);
  const presented = signedInUser ? signedInUser.authSessionVersion : token.authSessionVersion;
  if (!matchesVersion(presented, expected)) throw new AuthSessionInvalid();
  return { ...token, id, role: user.role, authSessionVersion: expected };
}

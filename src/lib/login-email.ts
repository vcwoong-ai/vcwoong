import { prisma } from "@/lib/prisma";

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** PostgreSQL/SQLite compatible, parameterized lookup of legacy mixed-case emails.
 * Two results suffice to detect ambiguity; never choose an account by row order.
 * Existing account identifiers, passwords and permissions are not rewritten.
 */
export async function findLoginEmailCandidates(email: string): Promise<Array<{ id: string }>> {
  return prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User"
    WHERE LOWER("email") = ${normalizeLoginEmail(email)}
    LIMIT 2
  `;
}

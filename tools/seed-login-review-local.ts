/** Keeps one explicitly synthetic, non-admin local account for user review. Never production. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db", "local SQLite only");
  const db = new PrismaClient();
  const email = "Login.Review.20261001@Example.com";
  const name = "로그인 테스트 전용 (합성 계정)";
  const password = "LocalLogin2026!";
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      assert.equal(existing.name, name, "refuse to overwrite an unrelated account");
      assert(existing.passwordHash && await bcrypt.compare(password, existing.passwordHash));
      assert.equal(existing.role, "ANALYST");
    } else {
      await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 12), role: "ANALYST" } });
    }
    console.log("Local review fixture ready: Login.Review.20261001@Example.com (ANALYST)");
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Offline only: derive expected PostgreSQL DDL without opening a database.
// This repair is deliberately bound to the current schema, not a generic migrator.
const prismaCli = process.env.DEALMIND_PRISMA_CLI ?? resolve("node_modules/prisma/build/index.js");
const generated = execFileSync(process.execPath, [prismaCli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
const statements = (sql: string) => sql.replace(/^--[^\n]*\r?\n/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
const peTarget = (sql: string) => {
  const direct = sql.match(/^CREATE (?:TABLE|TYPE) "((?:MA|PE|Ma)[^"]+)"/);
  const index = sql.match(/^CREATE (?:UNIQUE )?INDEX "[^"]+" ON "((?:MA|PE)[^"]+)"/);
  const foreignKey = sql.match(/^ALTER TABLE "((?:MA|PE)[^"]+)" ADD CONSTRAINT/);
  return Boolean(direct || index || foreignKey);
};
const expected = statements(generated).filter(peTarget);
const patch = statements(readFileSync("prisma/patches/2026-10-02-repair-missing-pe-schema.sql", "utf8"));
assert.equal(patch[0], "BEGIN");
assert.equal(patch.at(-1), "COMMIT");
assert.deepEqual(patch.slice(1, 4), ["SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '60s'", "SET LOCAL search_path = public"]);
assert.deepEqual(patch.slice(4, -1), expected, "repair DDL must match canonical Prisma schema exactly");
assert.equal(expected.filter((s) => s.startsWith("CREATE TABLE")).length, 15);
assert.equal(expected.filter((s) => s.startsWith("CREATE TYPE")).length, 19);
assert.equal(expected.length, 94);
assert(expected.every(peTarget), "only missing PE objects may be changed");
assert(expected.every((s) => !/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|REVOKE)\b/.test(s.replace(/ON UPDATE CASCADE/g, "").replace(/ON DELETE (CASCADE|RESTRICT|SET NULL)/g, ""))), "no data mutation or permission change (FK actions are definitions)");
console.log("PASS: 15 PE tables, 19 enums, 94 canonical additive DDL statements; transaction and timeouts; no existing-table/data/permission mutation.");

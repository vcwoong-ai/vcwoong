/**
 * DB 접근 계층. 운영은 PostgreSQL(Neon 등), 로컬·테스트는 PGlite(설치 없는 내장 Postgres).
 * DATABASE_URL 이 "pglite:" 로 시작하면 PGlite 를 쓴다.
 * 스키마는 첫 쿼리 때 CREATE TABLE IF NOT EXISTS 로 자동 생성한다 — 배포 후 마이그레이션 단계가 없다.
 */
import { env } from "./env";

type Row = Record<string, unknown>;
type Runner = (text: string, params: unknown[]) => Promise<Row[]>;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS malls (
  mall_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token TEXT NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  script_no TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS surveys (
  mall_id TEXT PRIMARY KEY REFERENCES malls(mall_id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  allow_other BOOLEAN NOT NULL DEFAULT TRUE,
  randomize BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS responses (
  id BIGSERIAL PRIMARY KEY,
  mall_id TEXT NOT NULL REFERENCES malls(mall_id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  answer_label TEXT NOT NULL,
  other_text TEXT,
  amount INTEGER,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mall_id, order_id)
);
CREATE INDEX IF NOT EXISTS responses_mall_created ON responses (mall_id, created_at DESC);
CREATE TABLE IF NOT EXISTS billing_orders (
  order_id TEXT PRIMARY KEY,
  mall_id TEXT NOT NULL REFERENCES malls(mall_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let runnerPromise: Promise<Runner> | null = null;

async function createRunner(): Promise<Runner> {
  const url = env.databaseUrl;
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = url.slice("pglite:".length);
    const db = dir === "memory" ? new PGlite() : new PGlite(dir);
    await db.exec(SCHEMA);
    return async (text, params) => (await db.query<Row>(text, params as never[])).rows;
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 5, idle_timeout: 20, prepare: false });
  await sql.unsafe(SCHEMA);
  return async (text, params) => (await sql.unsafe(text, params as never[])) as unknown as Row[];
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!runnerPromise) {
    runnerPromise = createRunner().catch((e) => {
      runnerPromise = null;
      throw e;
    });
  }
  const run = await runnerPromise;
  return (await run(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

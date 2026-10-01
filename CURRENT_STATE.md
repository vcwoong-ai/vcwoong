# PE production schema repair — 2026-10-02

## Authorization update — 2026-10-02

The user explicitly approved production recovery, revoked the earlier instruction requiring separate approval before DB/env/schema changes, and granted full access for this project. That earlier approval restriction is superseded. Proceed with necessary project changes without requesting the same authorization again. This does not itself expand the task into destructive resets, credential disclosure, or unrelated financial transactions.

## Current result — 2026-10-02 06:41 KST

RECOVERED. The prepared additive PE transaction was applied to main/neondb; 15 tables/19 enums/153 columns/41 constraints/49 indexes verified. Existing column/index hashes and User/Deal/Report counts 7/18/28 unchanged. Fresh recovery branch `br-billowing-sunset-ah5g7faz` (no compute), parent timestamp `2026-10-01T21:37:05Z`; existing snapshot retained. Production authenticated dashboard and PE list render, including 390px without overflow. Browser console error query empty. Refreshed 30-minute Vercel error view contains only pre-repair errors, latest 06:31:02 KST. Production data-write/PE detail flow is NOT VERIFIED (no PE deals). No app redeploy; production remains a5796bb. Exit Draft PR #128 remains separate. Details: docs/pe-schema-repair/README.md. Entries below describe earlier stages and are superseded where they say pending or no production application.

- Branch: `codex/pe-production-schema-repair`, baseline HEAD/main `a5796bbff127e0398e042baff04aa3acb75d429c`.
- Separate worktree: `D:/Dealmind-pe-schema-repair`. Existing `D:/Dealmind` branch, user servers, local SQLite and build outputs preserved. This checkout does not include uncommitted work from other environments.
- User requested resolution of the reported production PE/dashboard failure. Necessary targeted repair is authorized; engine, permission and billing semantics remain protected.
- Confirmed prior runtime evidence: Prisma P2021, `public.MADeal` missing on both old and current production deployments. Inspected Neon source main/neondb contains 24 existing tables and lacks all 15 PE tables and 19 PE enums.
- Read-only checks this turn: fetch main; inspect existing PE SQL patches; Vercel production DATABASE_URL metadata; Neon connector project discovery; Vercel integration resource inventory.
- Login resolved: authenticated Neon console identifies `neon-red-mountain` / `holy-haze-98999891`. Connector access to this project works.
- Target blocker: Vercel DATABASE_URL is Sensitive and is not returned by the environment APIs. Vercel integration resources are empty. User confirmation that this project main/neondb is the DealMind production DB is pending. No source-main DDL/data changes made.
- Recovery snapshot created: `snap-little-rice-ahj3hrf1` at `2026-10-01T16:20:55Z`; no expiration supplied.
- Isolated existing-project child `br-fancy-darkness-ahdiqj97` received the exact 94-statement additive repair successfully. Existing columns/enums/constraints/indexes are unchanged. Schema diff has zero removed lines.
- Isolated fixtures proved FK/unique constraints and QoE/evidence/review defaults; intentional exception rolled back all fixtures, verified zero rows afterward. Source data fingerprints captured without publishing contents.
- Next: confirm production project/branch/database target; read catalogs only; compare required PE schema; verify recovery point; rehearse only missing additive DDL on an isolated branch of that same project; apply verified repair; validate authenticated dashboard, PE and VC read flows and fresh runtime errors.
- Existing SQL patch presence is not proof of production application. Do not blindly execute all patches, initialize/seed production, hide failure as empty data, or use READY as authenticated app PASS.
- Results: offline repair DDL vs canonical Prisma PASS; tsc PASS after generating this worktree's independent PostgreSQL Prisma client; lint PASS; test:vc-contradiction-decision PASS (15), test:pe-committee-pack PASS (6), test:pe-ic-signoff PASS (5); diff check PASS. Initial tsc/lint attempts failed due to missing worktree dependencies/client; fixed without changing original checkout. Next lint auto-installed dependencies; its unintended package.json/package-lock.json edits were restored to HEAD. No dependency changes remain.
- Production application/runtime recovery/390px after repair NOT VERIFIED (target confirmation pending); full test:all/build not repeated for this SQL-only repair.
- Local changes: repair SQL, offline verifier, rehearsal docs/proof and this record. SQL SHA256 `80B791E378CA3C39E4BC1A06DE7050F568F2337841BE6D580D39651FE7F042AB`.
- No source-main DB/env/billing change, commit/push/PR/app deployment. Snapshot and isolated Neon branch are the only cloud mutations. Original checkout and servers preserved.

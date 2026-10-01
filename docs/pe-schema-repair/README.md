# PE schema repair rehearsal — 2026-10-02

## Production recovery completed — 2026-10-02 06:41 KST

The user explicitly approved recovery and revoked the prior DB/env/schema approval restriction, granting full project access. The earlier pending-approval statements below are historical and superseded. Necessary DB/env/schema work within the project may proceed under this authorization without asking the same question again.

- Applied the exact rehearsed additive SQL to `holy-haze-98999891` / `br-round-brook-ahohaqtt` / `neondb` in one transaction. Applied SQL SHA256 (before trailing blank-line normalization) is `80B791E378CA3C39E4BC1A06DE7050F568F2337841BE6D580D39651FE7F042AB`.
- Final catalog: 15 PE tables, 19 enums, 153 columns, 41 constraints, 49 indexes. Existing column/index hashes match before/after. User/Deal/Report counts remain 7/18/28. No production fixture records were inserted.
- Snapshot creation hit the snapshot-count limit. Existing `snap-little-rice-ahj3hrf1` was retained. A fresh no-compute recovery branch `br-billowing-sunset-ah5g7faz` was created from main, parent LSN `0/4A743F0`, parent timestamp `2026-10-01T21:37:05Z`. Although the create call returned 401, console and list_branches confirmed the branch is ready; no duplicate branch was created.
- Actual authenticated production `/dashboard`, `/ma-deals`, and the existing VC `/deals` list now render. PE empty state matches the actual MADeal count of 0. Both routes passed 390px overflow/error checks; browser console error query was empty.
- Refreshed Vercel error-filter view at 06:41 KST shows only the seven pre-repair dashboard errors (latest 06:31:02). No post-repair error was present in the inspected 30-minute window. This is a bounded check, not a future uptime guarantee.
- Existing production deployment remains `dpl_Gj7zY1Z88V1czynHdFkvxEA2tLmC` / `a5796bb`. No app redeploy or environment/billing change was needed. Actual production recovery confirms this Neon branch is the application's current DB target.
- Offline canonical DDL verifier rerun: PASS. Production PE detail/write workflows are NOT VERIFIED because no PE deals exist; do not infer all PE functions pass from the empty list. Earlier isolated schema/constraint/default tests remain documented below.
- Private production screenshots are kept under ignored `screenshots/pe-recovery/`; do not publish customer content in a PR.

Status: RECOVERED / production dashboard and PE list verified. Exit-simulation Draft PR #128 is separate and was not merged by this repair.

## Current incident recheck — 2026-10-02 06:31 KST

The authenticated Vercel browser logs show a fresh /dashboard failure at 06:31:02.276 KST:
Prisma P2021, `prisma.mADeal.count()`, `public.MADeal does not exist`, digest `1406821838`.
The request detail identifies production deployment `dpl_Gj7zY1Z88V1czynHdFkvxEA2tLmC`, main,
and host `www.dealmind.space`. A 200 response does not indicate successful Server Components rendering.
The connected logs API returned 403; these findings came from the authenticated Vercel browser instead.
Current production error screenshot is retained locally as `current-production-error.png` and is not published.
No production DDL, environment, code, merge, or deployment change was made in this incident recheck.
The repair below remains prepared, unapplied, and subject to explicit production schema approval.
Before application, recheck the actual production DB target, catalogs, and a fresh recovery point.

The authenticated dashboard and PE list fail with Prisma P2021 because MADeal is absent. The inspected Neon main/neondb also lacks all 15 PE tables and all 19 PE enums required by the deployed Prisma schema. Existing VC/auth/billing schema is present.

## Target and recovery

- Project visible in the authenticated console: `neon-red-mountain` / `holy-haze-98999891`.
- Source branch: `br-round-brook-ahohaqtt`, database `neondb`.
- Vercel production DATABASE_URL is Sensitive and cannot be retrieved by the environment APIs. Project-to-production mapping awaits user confirmation; no production DDL has been applied.
- Pre-change snapshot: `snap-little-rice-ahj3hrf1`, created `2026-10-01T16:20:55Z`. No expiration supplied. Project history retention is 21600 seconds; this is not the lifetime of the manual snapshot.
- Isolated child: `br-fancy-darkness-ahdiqj97`, `codex-pe-schema-rehearsal-20261002`. Same existing project; no new application, production database or Vercel project.
- Restore is an incident action requiring review of intervening writes. Prefer restoring the snapshot to a separate recovery branch first; do not overwrite production or drop new tables automatically.

## Exact change

`prisma/patches/2026-10-02-repair-missing-pe-schema.sql` contains only the missing PE objects generated from baseline main `a5796bb` and current `prisma/schema.prisma`. Existing September PE patch files were inspected as the historical source. Their effect is consolidated to the current schema, without changing engine or workflow semantics.

The repair adds 15 tables, 153 columns, 19 enums, 41 constraints (15 primary keys and 26 foreign keys), and 49 indexes (including the 15 primary-key indexes). There is no update to existing VC/auth/billing columns or data. QoE default APPROVED and review default NOT_REVIEWED match existing schema; no fabricated readiness or approval is introduced.

The SQL is atomic with 5-second lock timeout and 60-second statement timeout. It intentionally fails on existing objects rather than silently masking drift. Do not run it against partially migrated databases or run it again after successful application. Re-read catalogs before applying.

## Actual results

| Check | Result |
|---|---|
| Read-only source catalog | PASS: 24 existing tables, no PE tables |
| Isolated 94-statement DDL transaction | PASS |
| Source vs child full schema diff | PASS: additions only; zero removed lines |
| Existing columns/enums/constraints/indexes byte comparison | PASS: unchanged |
| FK rejects nonexistent user | PASS, isolated fixture |
| Unique financial period rejects duplicate | PASS, isolated fixture |
| QoE/evidence/review defaults | PASS, existing schema values |
| Expected rollback followed by zero fixture rows | PASS |
| Offline repair vs current Prisma generated DDL | PASS |
| tsc / lint | PASS after independent worktree dependencies/client setup |
| Shared VC contradiction / PE committee / PE signoff tests | PASS: 15 / 6 / 5 checks |
| Git diff check | PASS |
| Production target mapping/application/authenticated recovery | NOT VERIFIED: confirmation pending |

Commands: `node D:/Dealmind/node_modules/prisma/build/index.js migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`; `DEALMIND_PRISMA_CLI=D:/Dealmind/node_modules/prisma/build/index.js node D:/Dealmind/node_modules/tsx/dist/cli.mjs tools/test-pe-schema-repair.ts`. The second command uses PowerShell `$env:DEALMIND_PRISMA_CLI` syntax on Windows. Neither opens a DB. Neon catalog, transaction, schema comparison and snapshot tools were used with explicit project/branch/database IDs.

The fixture SQL intentionally raises EXPECTED_ROLLBACK after assertions; the tool reports that exception as an error, which is expected. A subsequent query confirmed zero MADeal, review and adjustment rows. No test data was inserted into source main.

No production environment, billing, auth roles, app code, deployment or existing data was changed. The existing app deployment stays at `a5796bb`.

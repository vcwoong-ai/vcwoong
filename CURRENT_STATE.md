# Current state — 2026-10-02

## Latest verification

- PR #131 code head 9bee1b4: Preview READY and authenticated read-only report verified at 1440/390; no page overflow, eligibility guide and evidence-table interaction confirmed.
- Fresh test:report-table-series / tsc / lint / isolated optimized build PASS. Existing report lacks chart-eligible input (forecast column and missing units), so actual FY chart is NOT VERIFIED.
- Local npm start again rejected by execution tool: blocked by policy, no detail. Full synthetic browser E2E remains blocked. No alternate launch used.
- No application code, operational data, settings, merge or production deployment changed in this verification. Details: docs/report-visualization-followup.md.

## Previous follow-up

- Branch codex/report-visualization-coverage; base main 9764833a81a7b0320637c4b7e877f1f7dbdc8465. Exact HEAD: git rev-parse HEAD.
- Relative FY chart labels without inferred calendar years; collapsible eligibility explanation; targeted/browser tests; diagnostic-only gate reproduction.
- PASS: test:report-table-series, test:all, tsc --noEmit, lint, optimized build, diff check. Logs: screenshots/.
- PASS reproduction: npx.cmd tsx tools/repro-vc-low-confidence-gate.ts. LOW claim -> HIGH dimension -> empty positive drivers -> gate rejection. Engine unchanged; policy correction needs separate approval.
- New worktree SQLite only: file:./dev.db. Initial db push failed creating the absent DB; after creating an empty local prisma/dev.db, db push succeeded. No production data/env/schema/billing changes.
- Browser 1440/390 E2E NOT VERIFIED: npm.cmd run start -- --hostname 127.0.0.1 --port 3003 rejected by execution policy (blocked by policy, no detailed reason). No alternative launch attempted.
- Draft PR only for this follow-up. PR 130 previously merged/deployed at 9764833; original worktrees preserved.

## Previous branch record (historical)

- Branch: codex/workspace-ux-reliability; base main a5796bb. Current exact HEAD: git rev-parse HEAD.
- Scope: internal list distributions, source-preserving report table charts, evidence table, navigation, brand mark, display/login-response fixes.
- Other worktrees and ports 3000/3001 preserved. Review app: localhost:3003, isolated SQLite prisma/dev.db, synthetic fixtures only.
- User revoked prior separate DB/env/schema permission restriction. No production writes, account changes or payment changes performed in this branch/task.
- PASS: npm.cmd run test:all; npm.cmd run test:login-email-e2e; npm.cmd run test:site-review-e2e (75 checks + chart/table assertions); npx.cmd tsc --noEmit; npm.cmd run lint; npm.cmd run build; git diff --check.
- Build used DEALMIND_LOCAL_REVIEW=1 (separate .next-local-review), DATABASE_URL=file:./dev.db. Browser tests ran against dev server, not optimized build. No external paid calls.
- Local screenshots/logs: screenshots/. Private account/integration findings also stay there and must not be published to the public repository.
- Review fixture: tools/local-input/preview.json (local-only, ignored). No real account credentials are stored in it.
- Pending: user ownership/retention answer for duplicate login account, account cleanup selection, external service setup and security remediation. UI change is not a claim that production login or integrations are fixed.
- No merge/production deployment of these changes. Draft PR for review.

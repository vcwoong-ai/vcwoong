# Current state — 2026-10-02 — evidence confidence guard

- Branch: codex/evidence-confidence-guard. Base main/initial HEAD: 9764833a81a7b0320637c4b7e877f1f7dbdc8465. Exact current HEAD: git rev-parse HEAD.
- Scope: LOW-only evidence confidence correction, stored-snapshot read guard in canonical VC loader, regression tests and documentation. Existing branches/worktrees preserved.
- PASS: baseline related tests; new regression RED before fix / GREEN after fix; final npm.cmd run test:all (VC/PE), npx.cmd tsc --noEmit, npm.cmd run lint, npm.cmd run build, git diff --check.
- Local build only: DATABASE_URL=file:./dev.db, local-only auth secret. No production DB/env/schema writes, AI calls or paid requests.
- NOT VERIFIED: browser E2E, 1440/390 screenshots, production behavior. Prior server launch was rejected by the execution tool as blocked by policy; exact policy cause is unknown. No alternate launch attempted.
- Approval: user continued the explained minimal confidence-fix work. Separate branch commit/push and Draft PR covered by existing authorization. No merge or production deployment in this task.
- Remaining: Draft PR review and authenticated browser verification before release. PR #131 visualization and #128 exit simulation remain separate.
- Details: docs/evidence-confidence-guard.md. Local-only logs: screenshots/confidence-*.log.

## Historical state (before this branch)

# Current state — 2026-10-02

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

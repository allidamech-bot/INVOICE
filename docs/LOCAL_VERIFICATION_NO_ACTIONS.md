# LOUREX — Local release verification and safe GitHub branch QA

Read-only, branch-scoped GitHub Actions workflows are retained. The local release verifier must **not** reject their existence: it runs `tests/local-verification-no-actions.test.mjs` as an early safety/manifest preflight. That test rejects dangerous triggers, production deployments, secrets usage, and unscoped push branches. A green automated check (or an absent check) is **not** a substitute for final-HEAD local signoff.

## Prepare on Windows / Linux / macOS

Node.js 24.x, Git with origin/main fetched, and npm are required. Run from the repository root:

```sh
npm ci
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium webkit
node scripts/verify-local.mjs
```

A local signoff may take significantly longer than the former parallel hosted matrix because all required suites now run serially. On Linux install Playwright system libraries with `npx playwright install-deps chromium webkit` if missing.
Playwright is installed without changing package.json or the lockfile. It is NOT uploaded as a GitHub artifact.

## Mandatory before merge

Default verification runs the safe-workflow preflight, `npm audit --audit-level=high`, `scripts/security-check.mjs`, TypeScript, production build, every changed PR top-level test contract, the Batch 7 tests, and ten permanent stock-issue, invoice-void, sales-return, accounting, reporting, AI-isolation and two-device cloud-race contracts. It also runs the current Chromium/WebKit QA shards and iPad/mobile/editor stability suites. A failure or missing dependency blocks local signoff. Keep full console output and the tested commit SHA in the Pull Request.

`node scripts/verify-local.mjs --quick` is for development ONLY and does not run browsers. Do not merge based on a quick pass.
`node scripts/verify-local.mjs --legacy` also runs old diagnostic suites (reported separately and historically non-blocking).

Feature branch → PR → final-head local verification → recorded manual signoff → merge. Do not bypass or weaken security, WebKit, iPad or mobile tests.

Required status checks and branch protection were not audited by this change. If obsolete contexts block a verified merge, only an authorized repository admin should reconcile them; do not bypass an active, relevant required check.

This release-gate fix does not modify Vercel deployment or domain settings and does not edit application behavior, Firebase rules or financial data.

# LOUREX — Local PR verification without GitHub Actions

All GitHub Actions YAML workflows have been removed. GitHub PRs now have **no automated CI status**, and an absence of checks must never be interpreted as a PASS.

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

Default verification runs `npm audit --audit-level=high`, `scripts/security-check.mjs`, TypeScript, production build, every changed PR top-level test contract plus the Batch 7 tests, and the previous current Chromium/WebKit QA shards, iPad/mobile/editor stability suites. A failure or missing dependency blocks local signoff. Keep full console output and the tested commit SHA in the Pull Request.

`node scripts/verify-local.mjs --quick` is for development ONLY and does not run browsers. Do not merge based on a quick pass.
`node scripts/verify-local.mjs --legacy` also runs old diagnostic suites (reported separately and historically non-blocking).

Feature branch → PR → final-head local verification → recorded manual signoff → merge. Do not bypass or weaken security, WebKit, iPad or mobile tests.

Existing required GitHub status checks or branch protection may still refer to removed workflows. GitHub App access here cannot change account-level settings; an authorized repository admin must remove obsolete required status contexts if they block a verified merge.

Vercel deployment and domain settings are not modified. An external CI provider can be added later with explicit approval and after reviewing its free tier.

# Batch 8 — one-click remote verification, no laptop or GitHub Actions

## Purpose

This is an **opt-in** workflow for a user with an iPhone and an eligible GitHub personal account. It does not use GitHub Actions, require a local computer, change the production Vercel app, or modify accounting. Codespaces uses separate compute/storage quotas from GitHub Actions. Free usage depends on the user's personal plan and remaining allowance; if GitHub presents paid usage, do not proceed.

## Start on an iPhone

1. Open [Launch LOUREX Batch 8 QA Codespace](https://codespaces.new/allidamech-bot/INVOICE/tree/feat/b08-part3-grounded-cfo-report-context) in Safari while signed into GitHub.
2. Select the **2-core** machine (if prompted), with the repository branch `feat/b08-part3-grounded-cfo-report-context`, and choose **Create codespace**. Prefer the VS Code **browser** editor; no local installation.
3. When creation completes, `.devcontainer/devcontainer.json` automatically runs `scripts/b08-codespaces-qa.sh` using the official Node 24 image. It creates independent temporary checkouts and verifies **PR #644, #645 and #646 sequentially** at immutable commit SHAs, stopping on the first failure.
4. Full logs are saved under `~/lourex-b08-qa/`; the brief status file is `~/lourex-b08-qa/SUMMARY.txt`. The script attempts to post only status and exact tested SHA to each PR using the Codespace's existing GitHub CLI authentication, if available. If it cannot comment, use the summary file or a screenshot to share the result.
5. **Stop the Codespace after use**, so free compute capacity is not consumed unnecessarily. Do not interpret creation or lack of errors as QA success. Only exact `B08-QA-PASS` for all three PRs, with logs, can proceed to manual review and ordered merging. Do not publish production from this environment.

## Strict requirements

- The script refuses to run if `origin/main` has moved from the reviewed baseline; investigate and restack rather than disabling that check.
- The required gate is `node scripts/verify-local.mjs` without `--quick`, including security, typecheck, build, contracts, current Chromium/WebKit, iPad/mobile suites. Playwright is installed without changing the lockfile.
- Costs could arise only if the user's free Codespaces allowance is exceeded *and* billing is enabled; examine the Codespaces creation billing indicator before confirming.
- Successful verification does **not** merge any PR, make direct main commits, deploy Vercel or authorize financial postings.
- If the third PR receives new commits after a Codespace starts, its exact final head is different and must be reverified.

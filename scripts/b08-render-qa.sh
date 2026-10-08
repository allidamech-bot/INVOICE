#!/usr/bin/env bash
# LOUREX Batch 8 isolated, read-only QA gate for Render free Docker build.
# No GitHub Actions, no push, no merge, no Vercel deploy, no private data.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO="https://github.com/allidamech-bot/INVOICE.git"
CURRENT_BRANCH="feat/b08-part3-grounded-cfo-report-context"
EXPECTED_MAIN="4cc8d2b47bbcebdba9bf7d8cbf66662474920eb3"
declare -a NUMBERS=(644 645 646)
declare -a REFS=("dd276f0004afdeed5c9be801d4bd3ecde849986c" "4c8a4c3049621c70e236c615575dfc8487456dd0" "")
echo "LOUREX-B08-RENDER-QA START UTC=$(date -u +%FT%TZ)"
echo "B08-NODE $(node --version)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]];then
  echo "B08-QA-BLOCKED: Node 24 required";exit 30
fi
if ! git clone --single-branch --branch "$CURRENT_BRANCH" --depth 80 "$REPO" /tmp/lourex-b08 ;then
  echo "B08-QA-BLOCKED: public GitHub clone failed";exit 31
fi
cd /tmp/lourex-b08
git fetch --no-tags --depth 120 origin main:refs/remotes/origin/main
if [[ "$(git rev-parse origin/main)" != "$EXPECTED_MAIN" ]];then
  echo "B08-QA-BLOCKED: origin/main changed. Re-review/rebase all stacked PRs.";exit 32
fi
REFS[2]="$(git rev-parse HEAD)"
echo "B08-QA-BRANCH-HEAD PR646=${REFS[2]}"
for i in 0 1 2;do
  number="${NUMBERS[$i]}"
  sha="${REFS[$i]}"
  worktree="/tmp/lourex-b08-test-${number}"
  echo "B08-QA-START PR #${number} SHA=${sha} UTC=$(date -u +%FT%TZ)"
  git worktree add --detach "$worktree" "$sha"
  cd "$worktree"
  if ! npm ci --no-audit --no-fund;then echo "B08-QA-FAIL PR #${number}: npm ci";exit 40;fi
  if ! npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0;then
    echo "B08-QA-FAIL PR #${number}: install Playwright";exit 41
  fi
  echo "B08-QA-RUN PR #${number}: full local security, typecheck, build, contract, Chromium, WebKit"
  if node scripts/verify-local.mjs;then
    echo "B08-QA-PASS PR #${number} SHA=${sha} UTC=$(date -u +%FT%TZ)"
  else
    code="$?"
    echo "B08-QA-FAIL PR #${number} SHA=${sha} EXIT=${code} UTC=$(date -u +%FT%TZ)"
    exit "$code"
  fi
  cd /tmp/lourex-b08
  git worktree remove --force "$worktree"
done
echo "B08-QA-ALL-PASS: all three exact heads passed original complete local verification."
echo "B08-QA-END UTC=$(date -u +%FT%TZ) — no merge, no deployment of LOUREX."

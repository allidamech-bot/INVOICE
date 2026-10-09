#!/usr/bin/env bash
# LOUREX Batch 9 isolated free Render release gate. No production deployment.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO=https://github.com/allidamech-bot/INVOICE.git
BRANCH=feat/b09-operational-integration-audit
BASELINE=b31b919a11b3a9ba97abee4f8a7255fca1c38ee1
B09_EXPECTED_SHA="${B09_EXPECTED_SHA:-}"
echo "B09-QA-START EXPECTED_SHA=$B09_EXPECTED_SHA UTC=$(date -u +%FT%TZ)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]];then
  echo "B09-QA-FAIL: Node.js 24 is required";exit 30
fi
git clone --single-branch --branch "$BRANCH" --depth 90 "$REPO" /tmp/lourex-b09
cd /tmp/lourex-b09
git fetch --no-tags --depth 90 origin main:refs/remotes/origin/main
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
echo "B09-QA-CHECK HEAD=$HEAD_SHA MAIN=$MAIN_SHA"
if [[ -n "$B09_EXPECTED_SHA" && "$HEAD_SHA" != "$B09_EXPECTED_SHA" ]];then
  echo "B09-QA-FAIL: expected exact PR HEAD $B09_EXPECTED_SHA but found $HEAD_SHA";exit 31
fi
if [[ "$MAIN_SHA" != "$BASELINE" ]];then
  echo "B09-QA-FAIL: origin/main changed, review and retest current baseline";exit 32
fi
if ! git merge-base --is-ancestor "$MAIN_SHA" "$HEAD_SHA";then
  echo "B09-QA-FAIL: PR HEAD not based on reviewed main";exit 33
fi
echo "B09-QA-INSTALL npm ci / pinned Playwright"
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0
echo "B09-QA-RUN full security + typecheck + production build + all PR contracts + Chromium/WebKit"
if node scripts/verify-local.mjs;then
  echo "B09-QA-PASS PR #647 SHA=$HEAD_SHA MAIN=$MAIN_SHA UTC=$(date -u +%FT%TZ)"
else
  status="$?"
  echo "B09-QA-FAIL PR #647 SHA=$HEAD_SHA EXIT=$status UTC=$(date -u +%FT%TZ)"
  exit "$status"
fi
echo "B09-QA-ALL-PASS SHA=$HEAD_SHA"

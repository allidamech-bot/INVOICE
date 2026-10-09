#!/usr/bin/env bash
# LOUREX Batch 9.2 isolated release QA; never runs production deployment.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO="https://github.com/allidamech-bot/INVOICE.git"
BRANCH="feat/b09-part2-ai-party-approval-scope"
EXPECTED_MAIN="2d9d8ca87e29b2f5642a0bee2e4890b771175857"
EXPECTED_HEAD="${B09P2_EXPECTED_SHA:-}"
echo "B09P2-QA-START EXPECTED_HEAD=$EXPECTED_HEAD UTC=$(date -u +%FT%TZ)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]];then echo "B09P2-QA-FAIL: require Node 24";exit 30;fi
# Render runtime envVars are not guaranteed to be Docker build ARGs.
# Verify the exact checked-out source files against Docker build context instead.
if [[ ! -d /tmp/b09p2-reviewed-source/src ]];then echo "B09P2-QA-FAIL: checked source context missing";exit 31;fi
git clone --depth 90 --branch "$BRANCH" "$REPO" /tmp/lourex-b09p2
cd /tmp/lourex-b09p2
git fetch --depth 90 origin main:refs/remotes/origin/main
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
echo "B09P2-QA-SHA HEAD=$HEAD_SHA MAIN=$MAIN_SHA"
if [[ -n "$EXPECTED_HEAD" && "$HEAD_SHA" != "$EXPECTED_HEAD" ]];then
  echo "B09P2-QA-FAIL: unexpected source revision";exit 32
fi
for file in   src/lib/ai-approved-party-patch.ts   src/lib/ai-tool-actions.ts   src/lib/ai-tool-orchestrator.ts   tests/b09-ai-party-approval-consistency.test.mjs   scripts/b09p2-render-qa.sh   Dockerfile.b09p2-qa;do
  if ! cmp -s "/tmp/b09p2-reviewed-source/$file" "/tmp/lourex-b09p2/$file";then
    echo "B09P2-QA-FAIL: source context differs from git checkout: $file";exit 35
  fi
done
echo "B09P2-QA-SOURCE-CONTENT-VERIFIED HEAD=$HEAD_SHA against Render git build context"
if [[ "$MAIN_SHA" != "$EXPECTED_MAIN" ]];then echo "B09P2-QA-FAIL: main changed; review baseline before merge";exit 33;fi
git merge-base --is-ancestor "$MAIN_SHA" "$HEAD_SHA" || { echo "B09P2-QA-FAIL: branch not based on reviewed main";exit 34; }
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0
echo "B09P2-QA-RUN original full Node24/security/typecheck/build/contracts + Chromium/WebKit"
if node scripts/verify-local.mjs;then
  echo "B09P2-QA-PASS HEAD=$HEAD_SHA MAIN=$MAIN_SHA UTC=$(date -u +%FT%TZ)"
else
  result="$?"
  echo "B09P2-QA-FAIL HEAD=$HEAD_SHA EXIT=$result UTC=$(date -u +%FT%TZ)"
  exit "$result"
fi
echo "B09P2-QA-ALL-PASS SHA=$HEAD_SHA"

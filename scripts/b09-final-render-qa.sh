#!/usr/bin/env bash
# Batch 9 final acceptance only; do not deploy the production LOUREX application.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO="https://github.com/allidamech-bot/INVOICE.git"
BRANCH="feat/b09-closeout-runtime-integrity"
EXPECTED_BASE="3da1fb3075b6d67115fae9169a8e4177d8e352b9"
echo "B09-FINAL-QA-START UTC=$(date -u +%FT%TZ)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]];then
  echo "B09-FINAL-QA-FAIL: require Node 24";exit 30
fi
git clone --single-branch --depth 100 --branch "$BRANCH" "$REPO" /tmp/lourex-b09final
cd /tmp/lourex-b09final
git fetch --no-tags --depth 100 origin main:refs/remotes/origin/main
HEAD_SHA="$(git rev-parse HEAD)"
BASE_SHA="$(git rev-parse origin/main)"
echo "B09-FINAL-QA-CHECK HEAD=$HEAD_SHA BASE=$BASE_SHA"
if [[ "$BASE_SHA" != "$EXPECTED_BASE" ]];then echo "B09-FINAL-QA-FAIL: main baseline changed";exit 31;fi
git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" || { echo "B09-FINAL-QA-FAIL: branch ancestry";exit 32; }
# Build context comes from the pinned Render deploy commit.
# If the branch advances during clone, fail instead of testing a different revision.
while IFS= read -r -d '' file;do
  if ! cmp -s "$file" "/tmp/b09final-build-source/$file";then
    echo "B09-FINAL-QA-FAIL: mismatched tracked source $file";exit 33
  fi
done < <(git ls-files -z)
echo "B09-FINAL-QA-SOURCE-PARITY HEAD=$HEAD_SHA"
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0
echo "B09-FINAL-QA-RUN full mandatory QA including Chromium and WebKit"
if node scripts/verify-local.mjs;then
  echo "B09-FINAL-QA-PASS HEAD=$HEAD_SHA BASE=$BASE_SHA UTC=$(date -u +%FT%TZ)"
else
  exit_code="$?"
  echo "B09-FINAL-QA-FAIL HEAD=$HEAD_SHA EXIT=$exit_code UTC=$(date -u +%FT%TZ)"
  exit "$exit_code"
fi
echo "B09-FINAL-QA-ALL-PASS SHA=$HEAD_SHA"

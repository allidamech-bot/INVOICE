#!/usr/bin/env bash
# LOUREX Batch 10: isolated final release QA. This is NOT a production deployment.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO="https://github.com/allidamech-bot/INVOICE.git"
BRANCH="feat/b10-final-release-stock-consistency"
BASELINE="c6be7eb49503c11e6370107a7f585d2912ef5d8e"
echo "B10-FINAL-QA-START UTC=$(date -u +%FT%TZ)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo "B10-FINAL-QA-FAIL: require Node 24"; exit 30
fi
git clone --no-tags --depth 120 --branch "$BRANCH" "$REPO" /tmp/lourex-b10final
cd /tmp/lourex-b10final
git fetch --no-tags --depth 120 origin main:refs/remotes/origin/main
HEAD_SHA="$(git rev-parse HEAD)"
BASE_SHA="$(git rev-parse origin/main)"
echo "B10-FINAL-QA-CHECK HEAD=$HEAD_SHA BASE=$BASE_SHA"
if [[ "$BASE_SHA" != "$BASELINE" ]]; then
  echo "B10-FINAL-QA-FAIL: approved main baseline changed"; exit 31
fi
git merge-base --is-ancestor "$BASELINE" "$HEAD_SHA" || {
  echo "B10-FINAL-QA-FAIL: branch ancestry"; exit 32;
}
while IFS= read -r -d '' file; do
  if ! cmp -s "$file" "/tmp/b10final-build-source/$file"; then
    echo "B10-FINAL-QA-FAIL: mismatched tracked source $file"; exit 33
  fi
done < <(git ls-files -z)
echo "B10-FINAL-QA-SOURCE-PARITY HEAD=$HEAD_SHA"
npm ci --no-audit --no-fund
# Browser binary version matches the immutable free runner Docker image.
npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0
echo "B10-FINAL-QA-RUN Node24 full mandatory Chromium/WebKit"
if node scripts/verify-local.mjs; then
  echo "B10-FINAL-QA-PASS HEAD=$HEAD_SHA BASE=$BASE_SHA UTC=$(date -u +%FT%TZ)"
else
  result="$?"
  echo "B10-FINAL-QA-FAIL HEAD=$HEAD_SHA EXIT=$result UTC=$(date -u +%FT%TZ)"
  exit "$result"
fi
echo "B10-FINAL-QA-ALL-PASS SHA=$HEAD_SHA"

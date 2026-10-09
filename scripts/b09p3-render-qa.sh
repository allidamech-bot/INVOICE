#!/usr/bin/env bash
# Full production-equivalent release test only; no GitHub Actions or application deployment.
set -Eeuo pipefail
export CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
REPO="https://github.com/allidamech-bot/INVOICE.git"
BRANCH="feat/b09-part3-inventory-asof-provenance"
BASELINE="3d93dd27c63da1bc9426694fed9eb2b08c1c787e"
echo "B09P3-QA-START UTC=$(date -u +%FT%TZ)"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]];then
  echo 'B09P3-QA-FAIL: Node 24 required';exit 30
fi
git clone --depth 100 --branch "$BRANCH" "$REPO" /tmp/lourex-b09p3
cd /tmp/lourex-b09p3
git fetch --depth 100 origin main:refs/remotes/origin/main
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
echo "B09P3-QA-HEAD $HEAD_SHA BASE $MAIN_SHA"
if [[ "$MAIN_SHA" != "$BASELINE" ]];then
  echo 'B09P3-QA-FAIL: main changed';exit 31
fi
if ! git merge-base --is-ancestor "$BASELINE" "$HEAD_SHA";then
  echo 'B09P3-QA-FAIL: unexpected branch ancestry';exit 32
fi
# Render's Docker build environment may not expose runtime envVars. Validate every
# Git-tracked source against the immutable Render build context, not merely HEAD.
while IFS= read -r -d '' file;do
  if ! cmp -s "$file" "/tmp/b09p3-reviewed-source/$file";then
    echo "B09P3-QA-FAIL: Docker build context mismatch: $file";exit 33
  fi
done < <(git ls-files -z)
echo "B09P3-QA-SOURCE-PARITY HEAD=$HEAD_SHA"
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.55.0
if node scripts/verify-local.mjs;then
  echo "B09P3-QA-PASS HEAD=$HEAD_SHA BASE=$MAIN_SHA UTC=$(date -u +%FT%TZ)"
else
  code="$?"
  echo "B09P3-QA-FAIL HEAD=$HEAD_SHA EXIT=$code UTC=$(date -u +%FT%TZ)"
  exit "$code"
fi
echo "B09P3-QA-ALL-PASS SHA=$HEAD_SHA"

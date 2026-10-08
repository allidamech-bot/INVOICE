#!/usr/bin/env bash
# One-time Codespaces QA for the stacked Batch 8 feature pull requests.
# This script runs tests only. It never merges, deploys, edits source, or uses GitHub Actions.
set -Eeuo pipefail

REPO="allidamech-bot/INVOICE"
BASE_DIR="${HOME}/lourex-b08-qa"
WORKTREE_BASE="${HOME}/.cache/lourex-b08-worktrees"
mkdir -p "${BASE_DIR}" "${WORKTREE_BASE}"
ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"
git fetch origin main

EXPECTED_MAIN="4cc8d2b47bbcebdba9bf7d8cbf66662474920eb3"
ACTUAL_MAIN="$(git rev-parse origin/main)"
if [[ "${EXPECTED_MAIN}" != "${ACTUAL_MAIN}" ]]; then
  printf '%s\n' "STOP: origin/main moved; require review of the new base before QA." > "${BASE_DIR}/SUMMARY.txt"
  exit 1
fi

# The first two refs are the exact reviewed, immutable draft heads.
# The final ref is the Codespace's actual checked-out branch commit, including this QA script.
PR_NUMBERS=(644 645 646)
REFS=(
  "dd276f0004afdeed5c9be801d4bd3ecde849986c"
  "4c8a4c3049621c70e236c615575dfc8487456dd0"
  "$(git rev-parse HEAD)"
)
declare -a STATES=("NOT_RUN" "NOT_RUN" "NOT_RUN")
printf '%s\n' "LOUREX Batch 8 Codespaces QA" "No GitHub Actions, no merge, no deployment." > "${BASE_DIR}/SUMMARY.txt"

report_status(){
  local number="$1" sha="$2" state="$3" log="$4"
  echo "B08-QA-${state}: PR #${number} HEAD ${sha}" | tee -a "${BASE_DIR}/SUMMARY.txt"
  # Authenticated GitHub Codespaces usually provides a gh identity. Reporting
  # just the status/SHA is safe; detailed execution logs remain private here.
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh pr comment "${number}" -R "${REPO}" --body "LOUREX **Codespaces local-only QA**: **${state}** at exact tested commit \`${sha}\`. Required gate: \`node scripts/verify-local.mjs\` (Node 24, contracts, build, security, Chromium and WebKit). Local console log saved in Codespace at \`${log}\`. No GitHub Actions, deployments or merges." >/dev/null 2>&1 || true
  fi
}

for i in 0 1 2; do
  pr="${PR_NUMBERS[$i]}"
  sha="${REFS[$i]}"
  dir="${WORKTREE_BASE}/pr-${pr}"
  log="${BASE_DIR}/PR${pr}-${sha:0:10}.log"
  if [[ -d "${dir}" ]]; then
    git worktree remove --force "${dir}" || true
  fi
  git worktree add --detach "${dir}" "${sha}"
  echo "BEGIN PR #${pr} @ ${sha}: $(date -u +%FT%TZ)" | tee -a "${BASE_DIR}/SUMMARY.txt"

  # All tools are installed inside the temporary checkout. Browser runtime
  # dependencies are provisioned once, then Playwright's shared cache reused.
  if (
    set -Eeuo pipefail
    cd "${dir}"
    test "$(node -p 'process.versions.node.split(".")[0]')" = "24"
    npm ci
    npm install --no-save --package-lock=false playwright@1.55.0
    if [[ ! -e "${BASE_DIR}/browsers-ready" ]]; then
      sudo npx playwright install-deps chromium webkit
      npx playwright install chromium webkit
      touch "${BASE_DIR}/browsers-ready"
    fi
    node scripts/verify-local.mjs
  ) > "${log}" 2>&1; then
    STATES[$i]="PASS"
    report_status "${pr}" "${sha}" PASS "${log}"
    git worktree remove --force "${dir}"
  else
    STATES[$i]="FAIL"
    report_status "${pr}" "${sha}" FAIL "${log}"
    echo "Full failure log: ${log}" | tee -a "${BASE_DIR}/SUMMARY.txt"
    echo "B08-QA-STOPPED on PR #${pr}. Later PRs not tested." | tee -a "${BASE_DIR}/SUMMARY.txt"
    # Preserve failed checkout and log for diagnosis. Never merge or publish.
    exit 1
  fi
done

echo "B08-QA-ALL-PASS. All three exact heads passed the full local Node 24 and Chromium/WebKit release gate." | tee -a "${BASE_DIR}/SUMMARY.txt"
echo "Manual review and ordered merge still required. No deployment was performed." | tee -a "${BASE_DIR}/SUMMARY.txt"

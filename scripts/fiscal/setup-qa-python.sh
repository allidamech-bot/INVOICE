#!/usr/bin/env bash
# Existing standard Linux QA runner only. No production dependencies or resources.
set -euo pipefail
: "${RUNNER_TEMP:?QA runner temporary directory required}"
: "${GITHUB_ENV:?QA runner environment file required}"
if [ "$(id -u)" -eq 0 ]; then SUDO=(); else SUDO=(sudo); fi
# Retry the complete signed-index/update + install cycle on mirror sync or
# transient connectivity errors. Never accept a stale/partially failed update.
apt_ready=0
for attempt in 1 2 3; do
  if "${SUDO[@]}" apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=25 -o Acquire::https::Timeout=25 -o APT::Update::Error-Mode=any update &&
     "${SUDO[@]}" apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=25 -o Acquire::https::Timeout=25 install -y python3-venv libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-noto-core fonts-dejavu-core; then
    apt_ready=1
    break
  fi
  echo "Fiscal QA package installation attempt $attempt failed" >&2
  if [ "$attempt" -lt 3 ]; then sleep "$((attempt * 15))"; fi
done
if [ "$apt_ready" -ne 1 ]; then
  echo "Fiscal QA dependencies unavailable; failing closed" >&2
  exit 1
fi
python3 -m venv "$RUNNER_TEMP/lourex-fiscal-python"
python="$RUNNER_TEMP/lourex-fiscal-python/bin/python"
"$python" -m pip install --disable-pip-version-check -r scripts/fiscal/requirements-pdfa.txt
"$python" -m pip check
echo "LOUREX_FISCAL_PYTHON=$python" >> "$GITHUB_ENV"

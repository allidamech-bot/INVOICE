#!/usr/bin/env bash
# Existing standard Linux QA runner only. No production dependencies or resources.
set -euo pipefail
: "${RUNNER_TEMP:?QA runner temporary directory required}"
: "${GITHUB_ENV:?QA runner environment file required}"
sudo apt-get update
sudo apt-get install -y python3-venv libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-noto-core fonts-dejavu-core
python3 -m venv "$RUNNER_TEMP/lourex-fiscal-python"
python="$RUNNER_TEMP/lourex-fiscal-python/bin/python"
"$python" -m pip install --disable-pip-version-check -r scripts/fiscal/requirements-pdfa.txt
"$python" -m pip check
echo "LOUREX_FISCAL_PYTHON=$python" >> "$GITHUB_ENV"

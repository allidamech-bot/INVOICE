#!/usr/bin/env bash
# Bounded retry of a QA-only dependency installation command.
set -euo pipefail
if [ "$#" -eq 0 ]; then exit 2; fi
for attempt in 1 2 3; do
  if "$@"; then exit 0; fi
  echo "QA dependency installation attempt $attempt failed: $1" >&2
  if [ "$attempt" -lt 3 ]; then sleep "$((attempt * 15))"; fi
done
exit 1

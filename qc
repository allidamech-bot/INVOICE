#!/usr/bin/env bash
# Collect fixed, non-sensitive diagnostics from the previous local run; no tests rerun.
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
[[ "$(git branch --show-current)" == "feat/fiscal-batch2-remaining-settlements" ]] || { echo "Wrong branch"; exit 1; }
log=/tmp/lourex-final-5f140ecbc70f.log
[[ -f "$log" ]] || { echo "Previous log not found; do not rerun the full suite."; exit 1; }
report="$(mktemp /tmp/lourex-browser-report-XXXXX)"
python3 - "$log" >"$report" <<'PY'
import re, sys, pathlib
file = pathlib.Path(sys.argv[1])
raw = file.read_text(errors='replace')
text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', raw)
print("### Local browser QA diagnostic (existing run, no rerun)")
print("Tested commit: 5f140ecbc70f8d58d5bd345c06994edc19ba34ad")
print("Only fixed test identifiers, error classes, counters and source locations are reported.")
print()
pattern = re.compile(r'^\[LOUREX mandatory browser QA FAIL\] ([a-z0-9-]+) / (tests/visual/run-[a-z0-9.-]+\.cjs):', re.M)
last = 0
for hit in pattern.finditer(text):
    section = text[last:hit.start()]
    # Ignore unrelated success summaries; capture error class and test source location.
    markers = []
    for label, regex in [
        ('browser/page crash', r'\[QA browser crash\]|Page crashed|page\.on.crash'),
        ('closed page/context/browser', r'Target page, context or browser has been closed'),
        ('process timeout', r'ETIMEDOUT'),
        ('Playwright timeout', r'TimeoutError|Timeout \d+ms exceeded'),
        ('assertion failure', r'AssertionError|ERR_ASSERTION'),
        ('runtime page error', r'\[QA pageerror\]'),
        ('browser launch failure', r'browserType\.launch:|Host system is missing dependencies')
    ]:
        if re.search(regex, section, re.I): markers.append(label)
    if 'ETIMEDOUT' in text[hit.end():text.find('\n',hit.end())]: markers.append('process timeout')
    locations=[]
    for loc in re.findall(r'(tests/visual/run-[a-z0-9.-]+\.cjs:\d+:\d+)',section):
        if loc.startswith(hit.group(2)+':') and loc not in locations: locations.append(loc)
    print("- "+hit.group(1)+" / "+hit.group(2)+": "+(", ".join(dict.fromkeys(markers)) or "unclassified")+
          ("; "+", ".join(locations[-6:]) if locations else ""))
    last=hit.end()
print()
for name in ('memory.events','memory.max','memory.peak'):
    path=pathlib.Path('/sys/fs/cgroup')/name
    try:
        value=path.read_text().strip()
        if re.fullmatch(r'[a-z0-9_\s]+',value): print(name+': '+value.replace('\n', '; '))
    except OSError: pass
try:
    stat=__import__('os').statvfs('/dev/shm')
    print('Shared memory capacity MiB: '+str(stat.f_blocks*stat.f_frsize//1048576))
except OSError: pass
for label in ('tests','pass','fail','skipped'):
    values=re.findall(r'^\s*[#ℹ]\s+'+label+r'\s+(\d+)\s*$',text,re.M)
    if values:print(label+' counters: '+', '.join(values[-8:]))
print("Raw logs remain in Codespaces.")
PY
cat "$report"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  if gh pr comment 1287 -R allidamech-bot/INVOICE --body-file "$report"; then
    echo "DIAGNOSTIC SENT"
  else
    echo "Send a screenshot of the report above."
  fi
else
  echo "Send a screenshot of the report above."
fi

# Draft deletion outcome — 22 October 2026

Baseline: `8f6c676d647d6d23bee06eb339a74c20619830ee` (#954).
Integrated with `b1ea8d10a0bc99b8f3a2349ddafdd396e738f4b7` (#953/#956/#957)
before final validation; their seven AI source/test files are preserved exactly.

## Confirmed failure paths

The real App delete handler awaited persistence then unconditionally displayed
"Draft deleted." The existing merge correctly retained a document edited or
issued by an earlier queued save, so the user received success while the row
still existed. No deletion event was generated for the retained record.

A second case lost the intervening draft edit: the delete branch's concurrency
check compared timestamps/status/revision, allowing changed content with an
unchanged timestamp to be removed. A confirmation left open during a completed
edit could also delete the newer version without review. Each of these paths
was reproduced by failing runtime regressions before correction.

## Limited correction

- Include the existing canonical document-content comparison in the stale
  delete retention check. This protects changed content even when timestamps
  match and keeps prior issued/revision protections.
- Reuse that same comparison before saving to reject a confirmation opened
  against different document content, requiring a fresh review of the row.
- After persistence, verify the account view is still available and belongs
  to the same signed-in UID before confirming any outcome.
- Inspect the full current vault for the target ID. If the document remains,
  close the stale confirmation and report that it was not deleted, requiring
  the user to review the current row before another attempt.
- Report success only when the target is absent. Normal deletion and audit
  creation retain the existing path; failed CAS still reports failure.

Tests execute both original App.persist and App.deleteDocument methods with
real scope/merge/audit functions and a synthetic local CAS adapter. They cover
retained draft/final rows, matching timestamps with changed content, stale open
confirmations, normal deletion, failed writes and session changes after the local commit. They do
not constitute a new physical-device or live Firebase concurrency acceptance.

## Browser CI environment

On head `9b6402e4`, owner-browser jobs `119772434907` and `119778915871`
both exhausted the 15-minute job limit downloading OS packages from
`azure.archive.ubuntu.com`; browser tests never started. The browser job now
uses Microsoft's `mcr.microsoft.com/playwright:v1.56.1-noble` image with
preinstalled browsers and system libraries. Its version matches the unchanged
`playwright@1.56.1` npm install. Only the redundant browser/dependency install
step is removed; all Chromium/WebKit, viewport, language, assertions and
artifact steps remain. The trusted-server job is unchanged.
The credit-note VAT job used the same slow installation step; it now uses the
same matching image, preserving every accounting test and browser assertion.
The container exposed Git's ownership guard in the release-script dry-run
test. A synthetic repository reproduced the refusal and verified that trusting
only its exact checkout path resolves it. The VAT job explicitly adds its own
`GITHUB_WORKSPACE` to Git's safe-directory list; no wildcard or release guard
is relaxed, and the original release test remains unchanged.

Reference: https://github.com/microsoft/playwright/blob/v1.56.1/docs/src/ci.md
and https://github.com/microsoft/playwright/blob/v1.56.1/docs/src/docker.md.

## Data impact

No schema, migration, financial calculations, period policy, Firebase rules or
deployment changes. No cleanup of existing data. Retained documents keep their
latest content and get no false deletion event; normal deletion gets one event.
The existing vault audit remains business history, not a new signed ledger.

# Batch 9 — Operational integration audit and release contract

Status: SCOPING / NOT QA-VERIFIED. This document does not certify implementation or release readiness.

## Scope and sequence

1. Trace sales-order acceptance -> partial delivery -> stock issue -> invoice draft -> collection. Confirm that document identities, source links, quantities, currency and company boundaries remain consistent; no double posting on retries.
2. Trace RFQ -> supplier quotation -> purchase order -> partial GRN -> supplier invoice matching -> approved receipt/posting -> payment. Check quantity, cost and supplier provenance and idempotency.
3. Trace both workflows into inventory available/incoming/reserved quantities, finance, CFO and reports. Reconcile against deterministic source records; surface missing-cost and incomplete-profitability warnings rather than fabricate totals.
4. Audit AI command previews and approval gates for the above workflows: stale revisions, cross-company records, ambiguous item matching, unsupported commands and failed tool execution must never silently mutate records.
5. Verify Arabic/English, RTL/LTR, light/dark and representative mobile/tablet/desktop behavior, with special focus on Safari/WebKit PDF export and overlays. Automated WebKit is not physical-device evidence.

## Execution constraints

- Repository: allidamech-bot/INVOICE only. Feature branch -> PR -> verified gates -> merge commit; never push to main directly.
- Preserve approved UI and existing engines; no architectural rewrite or unrelated package installation.
- No GitHub Actions, paid QA credits, production deploy, or invented PASS.
- Execute Node 24 deterministic tests, build/type checks and complete Chromium + WebKit release gate on an available free runner; retain exact full logs and SHA.
- Do not merge until final-head gates are fully successful and the PR is mergeable.

## Initial findings

Existing Batch 7 and Batch 8 PRs cover substantial individual sales, purchasing, inventory and CFO integrity paths. Batch 9 must inspect current implementation and tests before adding overlapping behavior. No functional code changes or QA claims are included in this scoping commit.

## Acceptance evidence to capture per part

- Baseline SHA, changed paths, affected workflow and exact defect reproduction.
- Focused deterministic tests plus regressions, browser cases and complete command/log evidence.
- Remaining limitations separated from verified passes.
- PR number, final head SHA, successful release-gate marker and merge SHA only after observed completion.

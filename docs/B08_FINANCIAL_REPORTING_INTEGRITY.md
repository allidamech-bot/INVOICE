# Batch 8 / Part 1 — Financial report source and cost integrity

Baseline: `main` `4cc8d2b47bbcebdba9bf7d8cbf66662474920eb3` (Batch 7 merged).
Scope: **management profitability reporting only**. No change to commercial posting, customer/supplier balances, VAT, COGS, GL, synchronization, PDF templates or production deployment.

## Confirmed findings and fixes

1. **Overhead attribution when a product cost is missing:** `lineAllocations` assigned internal shipping/other overhead only after validating the line cost. If an earlier line had no cost, its overhead could be shifted onto a later costed line, understating that other product's gross profit. The allocator now advances overhead for every line, but still withholds cost/profit/margin for a line with missing unit cost. Reversal signs and deterministic cent rounding remain unchanged.
2. **Credit-note source authority across report periods:** the Profitability screen previously date-filtered the raw document list before dimensional reporting, admitting orphan/unaccounted final credits and potentially losing an otherwise valid February credit whose originating invoice was issued in January. The screen now applies the existing canonical `financialDocuments` accounting predicate **before** the date filter. It additionally requires a valid ISO issue date; no malformed/undated final invoice enters a month report.
3. **Invalid internal expenses:** the profit engine previously treated an explicitly malformed or negative internal shipping/other expense as zero and could mark the financial result complete. It now marks the profit evidence incomplete, while preserving blank/omitted historical fields as zero. Product dimensions also withhold profit when their invoice's internal expense evidence is invalid; report and editor warnings do not claim that zero item costs are missing.
4. **Normalized report periods:** all profitability dimensions use the same canonical normalized period, including reversed date bounds, while retaining credit notes matched against their earlier source invoices.
5. The existing currency separation and gross-profit/unknown-cost withholding policy are retained. Management gross profit is not statutory profit and does not claim automatic inventory COGS.

## Added deterministic contracts

`tests/b08-profitability-report-integrity.test.mjs`:
- missing-cost line cannot transfer its proportional overhead to a costed product;
- missing-cost order independence, completed aggregate totals;
- signed cost and internal overhead allocations for a reversed credit note;
- accounted credit notes retain their source match across period boundaries; orphan and invalid-date credits excluded;
- screen uses canonical source filter before period validation.
- normalized dates in every profitability dimension, including customer performance;
- malformed internal expenses withhold all profit and margin while blank legacy fields retain zero defaults;
- editor and reports warn about invalid internal costs rather than reporting zero missing costs.

## Status and acceptance

Implementation committed to the feature branch; **QA not yet signed off**.

Required before merge: Node 24 `npm ci`, `node scripts/verify-local.mjs` at the **final PR HEAD**, including dependency audit, security, TypeScript, production build, all changed contracts and Chromium/WebKit release shards. Preserve the test logs and commit SHA in the PR. No GitHub Actions, hosted CI, deployment, or direct `main` commits. The existence of a Draft PR is not release approval.

Future Part 2 is cost/profit evidence and drill-down validation; Part 3 is CFO/report action context under explicit user approvals. Both require separate scoped review; do not silently treat old similarly numbered roadmaps as authority.

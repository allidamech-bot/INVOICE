# Batch 8 / Part 3 — CFO and contextual financial explanation integrity

This is a **stacked Draft change** based on Batch 8 Part 2 PR #645, which in turn depends on Part 1 PR #644. This is not approved for main or production without final mandatory local QA.

## Why this is needed

LOUREX already implements a deterministic Advisor V2, a CFO brief, and a contextual 'Explain report' action. The relevant shortcoming was **trust**, not a missing AI screen:

1. The Advisor V2 `missing-profit-costs` health signal was driven only by a *today* `missingCostItems` count. If every item had a cost but an internal expense was malformed, the financial engine correctly withheld month-to-date profit under Batch 8 Part 1; Advisor V2 could still present a Healthy status or fail to explain the withheld margin.
2. Advisor evidence was truncated to its first 32 ordinary currency/account rows, potentially dropping the actual evidence referenced by health warnings.
3. The contextual report prompt did not explicitly distinguish missing item costs from other invalid cost evidence, and relied on upstream data to have blanked untrusted gross-profit fields.

## Scoped remediation

- Use the deterministic `finance.monthToDate[].profitComplete` status as well as today's missing-item count for the CFO cost-quality warning. The evidence is currency-specific and the health result is at least `Watch` if gross profit is withheld.
- Prioritize records referenced by health signals before applying the existing bounded 32-evidence budget.
- Contextual `Explain report` questions include only bounded complete JSON rows, separate currencies, and an explicit cost-evidence label. A gross-profit field is forcibly blank when `profitComplete` is false; the assistant must not infer withheld margins or make financial postings.
- CFO remediation recommendations now cover invalid *internal expense* values, not only missing product unit costs.
- Correct the editor's misleading known-cost subtotal display when an internal expense is invalid; show a repair message instead of an unverified cost, and flag missing/invalid cost evidence in the year-to-date guidance and monthly report labels.
- Preserve the existing CFO UI, read-only assistant, separate currencies, no implicit FX, protected posting and personal/redacted scope.

## Tests and release requirements

`tests/b08-cfo-report-context.test.mjs` adds 6 tests for:
1. CFO warning despite zero missing item unit costs when recorded internal expenses are invalid.
2. Personal scope redaction with invalid-cost finance evidence.
3. Bounded explain-report context never leaking a withheld profit value.
4. Multi-currency omission being explicit and source JSON never being truncated mid-object.
5. Health-referenced evidence receiving priority before the 32-row cap.
6. Invalid internal expenses cannot appear as a trusted editor cost; management/YTD reports use accurate warnings.

An isolated execution of the source-extracted contextual-report function, including the existing Batch 4 fixture, passed. **This does not substitute for the full repository build, automated tests, or Chromium/WebKit QA.**

`node scripts/verify-local.mjs` must pass on Node 24 on the final feature commit after Part 1 and Part 2 are merged in reviewed order. The exact tested SHAs/logs must be attached to the respective PRs before merge. The assistant's local runtime has Node 22 and github.com DNS is blocked; the alternative Vercel Sandbox attempt was forbidden (403). **Do not merge while required release verification is missing.**

No GitHub Actions, no changes to `main`, no hosted preview/production deployment, no new packages and no schema changes.

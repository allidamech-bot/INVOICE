# LOUREX Batch 8 / Part 2 — supplier profitability provenance

Base: Part 1 Draft PR #644 at `dd276f0004afdeed5c9be801d4bd3ecde849986c`. This is **stacked work**, not an independent change ready to merge into main.

## Audited finding

The existing management report attributed an invoice line to the supplier from the most recent posted purchase of a similar saved item. It did not require the purchase and live supplier account to share the invoice's workspace and branch. It also accepted invalid calendar dates, and could choose a recent purchase with no usable supplier identity over an older attributable purchase.

This can produce a misleading *supplier attribution* even when the currency-separated gross-profit arithmetic is correct.

## Implemented mitigation

- Restrict saved-product matching and posted purchase evidence to the invoice's **exact workspace and branch**.
- Treat historical unscoped records conservatively: two unscoped records can still match, but a record without scope does not prove provenance for a scoped document.
- Ignore posted purchases with invalid or future (relative to invoice date) purchase dates, and purchases without an identifiable supplier snapshot.
- Use a live supplier display name only when that supplier record belongs to the same workspace/branch as the qualifying purchase; otherwise use the purchase's supplier snapshot.
- Explain in EN/AR that this remains a *latest-posted-purchase heuristic*, not proof of inventory lot traceability, stock cost allocation, or statutory COGS.
- Do not change posted transactions, item cost, money arithmetic, currencies, inventory ledgers, databases or permissions.

## Regression tests

`tests/b08-supplier-profit-provenance.test.mjs` adds six source contracts for:
1. Ignore more recent posted purchases in other workspaces/branches.
2. Ignore saved-item matches outside the document scope without hiding revenue.
3. Exclude invalid/future/anonymous supplier purchase evidence.
4. Prevent live supplier names leaking across branches for an otherwise valid snapshot attribution.
5. Preserve compatibility between legacy unscoped records while not trusting an unscoped purchase for a scoped invoice.
6. Select the in-scope catalog item even when another workspace has the same product description.

Source-extracted logic checks with minimal fixtures passed. **Full repository tests NOT RUN.** Node 24, installed dependencies, complete browser assets, and GitHub-network checkout are unavailable in this assistant's local runtime. Vercel Sandbox creation was denied (403).

## Signoff

This PR must remain a **Draft**, targeting the Part 1 feature branch, until:
- PR #644 passes `node scripts/verify-local.mjs` with Node 24 and Chromium/WebKit and is merged;
- Part 2 branch is refreshed against merged `main` (or rebased in reviewed order);
- `node scripts/verify-local.mjs` passes at final Part 2 HEAD with logs, checked changes and exact SHA; and
- explicit merge review approves.

No GitHub Actions, no deployment and no main commits.

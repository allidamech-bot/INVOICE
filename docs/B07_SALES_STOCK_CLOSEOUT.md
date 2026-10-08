# Batch 7 — Final commercial workflow closeout: confirmed delivery → explicit stock issue

This step extends the accepted Sales Order → confirmed physical delivery → partial invoice → collection workflow with an **explicit, manually approved SKU/warehouse stock issue**.

## Operational contract

- Physical delivery is confirmed and immutable before stock can be issued.
- Owner/admin separately approves stock issuance, specifying an active warehouse and an active catalog SKU **for each confirmed delivery line**. No SKU is inferred from description.
- Unit and physical delivered quantities must match the confirmed delivery proof. The available warehouse balance must cover every movement. No negative warehouse stock is allowed.
- Posting uses deterministic movement IDs for every confirmed delivery line. Repeating posting is idempotent; unrelated movements, missing proof, changed SKU or warehouse, modified timestamps and concurrent/offline ID collisions are rejected.
- The encrypted vault merge validates immutable source records, stock balances, and ledger continuity. Manual adjustment cannot reverse this protected issue; any future correction requires an explicit reviewed replacement workflow.
- Stock posting does not itself issue an invoice, enter Accounts Receivable, collect payment, calculate COGS or post a General Ledger entry.
- Existing supplier purchase posting and vendor liabilities remain separate. Sales invoices and payments continue to use canonical receivables and collections.

## Verification

- `tests/b07-sales-stock-issue.test.mjs` includes real posted supplier purchase receipt → physical Delivery Note confirmation → precise SKU-level stock issue → partial invoice issuance → complete payment. Also verifies stock shortage, unsupported SKU, wrong warehouse, stale revision, repeat posting and offline cross-device tampering.
- Verify Node 24 TypeScript, build and regression tests using `node scripts/verify-local.mjs --quick` and `node --test tests/b07-sales-stock-issue.test.mjs`. For release, run the complete local Playwright browser verification, preserving Chromium and WebKit, without GitHub Actions.

This finishes **Option A: operational trading finance** scope; it does not claim double-entry GL, statutory statements, automatic COGS or tax filings.

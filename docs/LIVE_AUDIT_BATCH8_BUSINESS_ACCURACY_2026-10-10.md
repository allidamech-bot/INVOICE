# Live audit remediation — Batch 8: business data accuracy

Repository: `allidamech-bot/INVOICE`. Parent: Batch 7, `4a4ebd08515f2e656de479147b2418ffdc91d83c` (draft #690). One consolidated feature branch: `audit/live-remediation-batch8-20261010`. No merge, deployment, production-data write, dependency addition or accounting rearchitecture.

## Confirmed defects and changes

| Audit item | Confirmed behavior before | Candidate behavior |
|---|---|---|
| AI-ASOF-001 | Advisor's historical report called the current CRM projection. Later creation, update or deletion could change a past report. | Optional day cutoff replays recorded CRM events before projecting their latest known version. Later deletions do not erase earlier opportunities. Current Pipeline callers keep their existing no-cutoff behavior. |
| AI-ASOF-002 | The advisor preferred `business.asOf` but copied finance totals and evidence from a different `finance.asOf`. | Rebuild mismatched finance from the same scoped vault at the advisor cutoff; expose the alignment in limitations. Initial AiCopilot context explicitly passes the business date to finance. Invalid advisor/CRM cutoff dates fail explicitly. |
| Historical inventory | Advisor included master products created after the cutoff and could invent historical zero-stock warnings. | Exclude known future-created products from the advisor's stock projection; preserve legacy products without a creation timestamp. |
| UX-PAY-001 | Global Search collection picker silently truncated invoices to the newest 20; its search input was disabled. | Search all eligible invoices by number, English/Arabic customer name, currency or date; show the matching count. Existing scrollable collection list remains the owner. |
| UX-PAY-002 | The picker included fully paid/credited invoices and omitted balance/settlement state. | Use `invoicePaymentSummary` with payments and credit notes. Show canonical remaining balance, unpaid/partially settled status and overdue indication. Exclude settled, draft, voided, credit-note, future-issued and invalid-date documents. |
| Collection interaction | Arrow navigation only queried general search results. | Query results inside the owning panel including the collection list. Opening/back/Escape restore search focus and clear the previous collection query. Recheck invoice eligibility before navigation; canonical payment validation remains posting authority. |

## Deterministic evidence

Before rebuilding the candidate, the new advisor/CRM tests run against the previous emitted modules reproduced four temporal failures: won count changed by a later event, a backdated late event appeared before it was recorded, EUR 900 future sales and later USD collection contaminated the cutoff, and a future CRM opportunity entered the report.

`tests/audit-batch8-business-accuracy.test.mjs` checks:

- CRM prior versions, later deletion, future creation, day boundary, malformed dates and immutable inputs.
- Mismatched versus aligned advisor dates, future invoice/payment exclusion, evidence consistency, Personal scope redaction and future product exclusion.
- Actual final emitted GlobalSearch component in a small VM with mocked rendering/DOM: 55 original invoices plus credit/future/invalid examples, oldest invoice discovery, Arabic/English filtering and copy, canonical partial balances, empty search results, enabled input, keyboard list selection and Escape.
- A newly settled invoice cannot navigate from a stale picker; `normalizePaymentRecord` rejects overcollection including future recorded settlements. Presentation state is not payment authority.
- Reference purchase 10 units at USD 8 plus USD 20 freight; sell/issue 4 units at USD 20 with USD 10 cost; receive USD 30, pay supplier USD 25, incur EUR 7 expense. Expected stock: 6; sales: USD 80; cost: USD 40; gross profit: USD 40; receivable: USD 50; payable: USD 75; allocated USD cash net: USD 5; separate EUR outflow: EUR 7. Linked treasury rows are not counted twice.
- Purchase reversal restores stock quantity and prior EUR saved cost; repeated posting/reversal and duplicate treasury allocation are rejected.

The prior advisor fixture in `ai-advisor-data-v2-batch2.test.mjs` now explicitly dates its CRM payload/event at its fixed historical cutoff instead of the machine's current time. Its existing amount, currency and action assertions remain intact. The two existing AI client source contracts now require `business.asOf` as the third finance argument, preserving their scoped-vault/privacy assertions. No tests are removed, skipped or weakened.

The full existing suite also covers quotation acceptance/Sales Order, linked delivery and invoice conversion/collection, RFQ/supplier quotation/Purchase Order/goods receipt/matched supplier invoice posting/payment, reversal, credits, inventory, treasury, receivables/payables, chronology, currency separation and output VAT. These are deterministic synthetic checks, not an assertion that every live UI step was exercised in a browser.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: completed; the final build was additionally rerun step-by-step from the exact package build chain to trace the service-worker manifest.
- Focused advisor/CRM/selector cases: **18 passed**, including **12 new Batch 8 tests**.
- Separate final production-bundle checks: **4 passed**.
- Final `node --test tests/*.test.mjs`: **2,326 passed**, 0 failed, 0 skipped, 0 cancelled. Build finished before tests; no parallel build/test regeneration.
- `git diff --check`: passed.

The first full run reported two source-contract assertions still expecting the old two-argument finance call; both now require the aligned cutoff. It also observed a missing v482 stylesheet URL in the generated service-worker manifest. Re-executing the exact build chain with per-stage inspection showed the URL inserted at `v347-startup-finalize` and retained through the final voice hash step; the separate cache check and complete rerun passed. No service-worker source change was made and no root-cause claim is made for the earlier artifact inconsistency. Retain this as a clean-build reproducibility observation for final acceptance rather than inventing a fix.

Final traced `dist/sw.js` SHA-256: `37f4b7c06ef299a4944fe0d92aec45f40d4a4d2a393a948b031451aa1eb1bc3d`.

## Scope and remaining acceptance

- CRM is replayed from its existing event history. Other historical operational projections use current vault records with their existing cutoff rules, not a complete historical version of every document/master record. The advisor explicitly carries this limitation; current company/product metadata can reflect later edits. This batch does not introduce a full event-sourced accounting model.
- The collection list has no hidden 20-row cap. It searches the existing local records; no server pagination or new data store is introduced. Large-record browser performance and actual focus/scroll layout remain acceptance work.
- Option A operational finance remains the scope. Output VAT only; purchase/input VAT is unsupported. No CoA, general ledger, legal posting, Trial Balance or Balance Sheet is added or implied.
- Desktop visual acceptance, screenshots, actual browser keyboard/focus behavior and end-to-end live UI workflow acceptance remain open. The published site is not this candidate; no new preview deployment is authorized here. Physical iPhone/iPad testing remains excluded by the user.
- Approval for merge/deployment remains separate. This report records verified code/runtime behavior and explicitly leaves untested visual/live acceptance open for Batch 9.

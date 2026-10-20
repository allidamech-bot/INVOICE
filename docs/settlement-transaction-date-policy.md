# Settlement reporting date policy

Approved by the owner through delegated decision on 20 October 2026.

Customer receipts and supplier payments affect recomputed balances and reports on their transaction date. Their creation/update timestamps remain unchanged audit metadata. Treasury allocations and bank/cash ledger balances use the movement date, so later allocation does not shift cash into a different period or double-count the source payment.

| Case (USD200 settlement) | Report through 10 October | Effect |
| --- | --- | --- |
| Transaction 5 October, entered 5 October | Included | Customer/supplier debt decreases by 200; cash changes once |
| Transaction 5 October, entered 20 October | Included | Same economic result; audit still records entry on 20 October |
| Transaction 25 October, entered 5 October | Excluded | No effect before 25 October |
| Supplier payment 5 October, voided 22 October | Included before 22 October; excluded from 22 October | Original record and cancellation reason remain inspectable |

Reconciliation is an audit action, not a cash transaction: a reconciliation recorded on 20 October cannot mark the 10 October view reconciled. Voiding uses the recorded cancellation date. This change does not alter purchase posting recognition, expense-report cutoffs, tax calculation, invoice values, source IDs or stored timestamps.

## Compatibility and release boundary

Historical recomputed supplier-payment and treasury results can change for backdated transactions entered later. Current undated totals are unchanged. Existing customer AR transaction-date behavior is retained. Old supplier/treasury creation-date expectations are corrected specifically under this approved decision, not relaxed generically.

The application has no verified fiscal-period lock or immutable published-report snapshot mechanism. Recomputed historical views must not be described as closed reports. Do not apply this release to a workflow requiring frozen published periods until controlled period close/reopen or versioned report retention is implemented and verified. Never silently overwrite a published report.

Regression: settlement-transaction-date-policy.test.mjs; audit-supplier-payables-asof.test.mjs; audit-treasury-void-history.test.mjs. Financial domain and full Node suites, TypeScript and build are required before merging. No production data migration or deployment is included.

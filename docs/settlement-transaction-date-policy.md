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

## 29 October 2026 — no cash recognition before the linked payment

A newly allocated customer receipt or supplier settlement must have a cash/bank
movement date **on or after the payment's original transaction date**, and that
source date must be valid. A bank entry dated earlier would make an as-of cash
report recognize money that AR/AP reports correctly do not recognize until the
payment's date. This is an implementation integrity guard under the already
approved 20 October transaction-date policy, not a new posting date convention.

The same check is performed by `appendTreasuryEntry` for normal saves and
new active offline/remote merges, and by the save-boundary verifier for newly
synchronized entries that were both posted **and voided** before sync (which
still affect historical as-of bank balances). Late entry is **not** prohibited:
for example a 5 October receipt recorded in the app on 20 October can still
be allocated with a movement date of 5 October; an allocation on 6 October
also remains valid. Only cash movement dated **before 5 October** is refused.

Previously stored bank movements (including historical voids) are not rewritten
or retroactively invalidated. This change does not grant production period-close
authority, modify existing bank balances, migrate actual money, or certify the
published finance reports and current user permissions. Existing closed-period
protection, immutable financial source evidence and same-release live QA remain
separate Plan A acceptance gates.

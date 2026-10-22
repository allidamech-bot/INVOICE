# Concurrent purchase posting continuity — 22 October 2026

Baseline: #966, `31a6b21ff922af010df84adf2616b1cd8b9db679`.

## Confirmed financial defect

A shared draft could be posted on one device while another device submitted a
stale edit, deletion or replacement posting. Existing posted-history guards
used the common base, where the purchase was still a draft. The draft conflict
guard deliberately deferred status transitions, so a valid local draft could
replace the newly posted remote record in the final merge.

For a service purchase without stock movements, the stock ledger did not expose
the downgrade. A synthetic reproduction changed a posted USD 100 supplier
liability into a draft and reduced the payable projection to no obligation.
Four runtime regressions failed before correction: stale edit, deletion,
replacement posting, and the actual App.persist queue. No real records were
used or inspected.

## Limited correction

Select purchases whose accepted latest state is posted/reversed while their
common base was a draft. Apply the existing posted-history retention and
immutability guards to these records against the final merged purchases.
Neither existing guard is replaced or loosened; no posting engine is added.

A rejected queued save does not reach a second local CAS or cloud scheduling.
The first posted record, one posting audit event and supplier liability remain.
Ordinary local posting, unrelated local changes, identical recorded replay,
and independent remote-only posted additions retain their existing behavior.
Existing reasoned-reversal validation remains authoritative.

## Verification and boundaries

Domain tests assert source immutability and payable amounts, explicitly with
zero inventory movements. The queue regression executes original App.persist
with real merge/scope/audit code and an isolated local CAS adapter, and verifies
one commit, one sync schedule, one posting event and the retained payable.

No formula, supplier payment, schema, migration, period policy, Firebase rule,
production configuration, customer data or deployment change. Already lost or
overwritten history is not reconstructed. Physical iPhone and every live-cloud
race are not claimed covered. Stale posting-confirmation baselines before the
handler begins are a separate path, not claimed fixed by this merge correction.

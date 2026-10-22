# Customer receipt deletion confirmation — 23 October 2026

Baseline: main `b1e77682b09d1ce9142098013e772424ea87c678` (#978).

## Confirmed defect

InvoicePaymentsPanel retains the selected payment in its deletion confirmation.
App.deletePayment previously deleted by ID against the latest vault but used
the old confirmation's amount, reference and invoice link for its deletion event.
If a receipt changed after opening confirmation, the old confirmation could
delete the newer receipt and record the wrong event details. A local synthetic
reproduction saved USD 40, corrected it to USD 60, then deleted USD 60 using the
old confirmation while payment-deleted recorded USD 40 and the old reference.

## Limited correction

Look up the current payment in the scoped vault before deleting. Reject a
missing payment or any changed content, ignoring updatedAt and normalizing
missing default/main scope. Build the existing deletion event from the accepted
current record. The permitted deletion workflow and balance formulas remain.
No supplier policy, UI, App.persist, vault-merge, AI file or schema change.

## Evidence and boundaries

Nine regression cases fail before correction: amount/reference/date/notes edits,
including unchanged timestamps, and a receipt already deleted. Tests execute the
original App.deletePayment and App.persist with actual merge/scope/audit code
and an isolated synthetic local CAS adapter. Positive controls verify ordinary
deletion, one accurate payment-deleted event, restored invoice balance, hidden
branch preservation, harmless timestamp/scope stamping and failed-CAS behavior.
An earlier queued edit remains protected by the existing payment merge guard.

The document-closing CI workflow runs the tests after its build. No production
data, Firebase rules, deployment, migration or historical audit repair. This
does not claim physical iPhone acceptance or every possible cloud race.

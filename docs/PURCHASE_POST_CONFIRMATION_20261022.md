# Purchase posting confirmation — 22 October 2026

Integration baseline: `008bed1318b8d1a6a800ecc94909b63dbd248403` (#969).
AI history and financial evidence updates are incorporated unchanged.

## Confirmed defect

OperationsPage captures reviewed posting values in its confirmation. A saved
draft could change or be deleted after opening the editor, but
App.postPurchaseRecord checked only whether an existing purchase was a draft.
It could replace newer saved values or recreate a deleted draft. A synthetic
service purchase changed from 2 × USD 50 to 2 × USD 75 while the old confirmation
still posted USD 100. This precedes the merge boundary protected by #968.

## Limited correction

Capture the saved purchase when opening its editor, separately from unsaved
editor values. New unsaved purchases use a null baseline. Copy that baseline
into the existing confirmation and pass it through the existing callback.
Before approval or persistence, compare it against the current scoped saved
purchase, ignoring updatedAt and normalizing missing default/main scope.
Reject changed, deleted, mismatched or missing baselines while retaining the
editor. The reviewed unsaved values remain the values posted after acceptance.

FinanceWorkspace and ProductsInventoryWorkspace change only their callback
type declarations. App.persist, vault-merge, posting formulas, approval policy,
inventory engine, AI files and Firebase rules are unchanged.

## Evidence and limits

Six regression cases failed before the correction. Tests execute original
OperationsPage methods and App.persist with the actual merge/scope/audit code
and synthetic data in an in-memory local CAS adapter. Check rejection without
an approval request, local write, sync schedule or success toast; preserve new
draft posting, unsaved editor changes, canonical scope and audit continuity.
CI runs these tests after its production build.

This fixes the saved state visible when the posting handler starts. It does
not claim to cover every subsequent live-cloud or queued-save race, restore
already overwritten records, or provide physical iPhone acceptance. No real
customer data, production settings, migrations or deployments are involved.

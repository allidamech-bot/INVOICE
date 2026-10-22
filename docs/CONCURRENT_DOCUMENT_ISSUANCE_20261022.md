# Concurrent document issuance — 22 October 2026

Baseline: merged #955, `f73093a495c98cd74d74071f3f1691f20176402f`.

## Confirmed defect

Two devices can start with the same stored draft and issue different content
under the same document ID. In `mergeDocuments`, the existing final-over-draft
priority protects a late draft autosave, and the draft-conflict guard protects
edits while the latest record is still a draft. Neither guarded two different
final versions when their common base was a draft. The generic final selection
silently chose the local version, replacing the already issued remote content.

Four new regression tests failed before the correction: proforma, invoice,
purchase-order, and the actual App.persist queue. The latter accepted a second
conflicting issue and its independent issuance event before the correction.
Same-timestamp transitions are included; timestamp difference is not authority.

## Limited correction

Inside the existing document merge, reject different final contents derived
from the same draft when existing void/higher-revision priority does not apply.
Reuse the established canonical comparison (ignores updatedAt and normalizes
legacy default/main scope), with a localized message to reopen Documents before
issuing. A rejected queued save does not reach local CAS or cloud scheduling;
the first issued record and its one event remain intact.

Normal issuance and identical-content issuance replay remain supported. Existing
stale-draft, voided-document and higher-revision priorities remain in place.
No new issuance engine, persistence API or accounting formula is introduced.

## Verification and boundaries

Focused tests run real merge/domain code. The queue regression executes the
original App.persist implementation with a synthetic local CAS adapter, and
checks stored content, event count, commit count and sync scheduling. No live
Firebase account, customer data, provider call or production service is used.
Source inputs remain unchanged after rejection. This does not certify physical
iPhone or every live-device race.

No migration, historical cleanup, schema, period policy, Firebase rules,
production configuration or deployment change. Previously overwritten versions
cannot be reconstructed by this guard; existing records are not rewritten.

Separate follow-up observation: when existing final-priority logic retains a
final record against a queued stale manual draft save, App.saveDocument can
still display its unsaved draft and a success toast. That editor/outcome path
is outside this narrowly scoped issuance correction and is not claimed fixed.

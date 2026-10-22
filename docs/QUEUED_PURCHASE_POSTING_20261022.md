# Queued purchase posting — 22 October 2026

Baseline: main `89b64fcf1d8cff58098e49d2f6db8d16bda8a20f` (#976).

## Confirmed defect

The posting handler can pass its saved-baseline check while an earlier draft
save is still queued. Once that save completes, the queued posting merges
against the newer draft. The draft conflict guard previously deferred all
status transitions, permitting the posting to replace accepted draft changes
or recreate a deleted draft.

A synthetic service purchase was confirmed at 2 × USD 50, then a queued save
accepted 2 × USD 75. Posting still succeeded at USD 100, producing a second
local CAS, sync schedule and a posting audit event after the newer draft edit.
Six regressions failed: cost, notes and deletion in the actual App.persist queue
and each corresponding direct merge. No live account or customer data was used.

## Limited correction

Inside the existing draft-purchase conflict guard, reject a local posting when
the latest draft differs from the common draft base or is absent. Ignore a
timestamp-only change and canonical default/main scope stamping for this check.
Other status-transition guards, formulas and the persistence API are unchanged.

This complements #976 (freshness before the handler starts) and #968 (retention
of a purchase already posted by another accepted write). It does not replace
either protection or add a posting engine. AI files are unchanged.

## Verification and boundaries

Queue tests execute the original UI confirmation and App.persist with actual
merge, scope and audit code and an isolated in-memory CAS adapter. Rejection
preserves the accepted draft edit/deletion, writes/schedules only the first
save, produces no posted event or success toast, and retains the editor.
Direct merge tests verify rejection leaves all source payloads unchanged.
A timestamp-only queued save remains compatible with a single posted payable.
Existing confirmation tests run in the document-closing CI workflow.

No schema, migration, Firebase rule, production setting or deployment change.
Already overwritten history is not reconstructed. This does not claim physical
iPhone acceptance or exhaustive coverage of every live-cloud concurrency path.

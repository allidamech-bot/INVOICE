# Concurrent draft save preservation — 21 October 2026

Baseline: `02f3e6a24dcbecf49cc822a76b6654230bb8cbf6` (merged #944).
Integrated on 22 October against `38cfca962d9af1cce284e69aa89e60b6ef6fe474`,
preserving the later AI work in #949, #951 and #952.

## Reproduced defect

The existing `mergeDocuments` shortcut recognized an unchanged local document
only by object identity. `App.persist` calls `applyWorkspaceScope`, which clones
document rows. A stale settings save therefore replaced an already saved draft
edit with the original text. A second, different draft edit also replaced the
first without reporting a conflict. Both were reproduced using synthetic data;
five new regression cases failed before this correction. Existing tests passed
because their unrelated intents reused the original document array directly.

## Limited correction

Compare actual document content as well as identity. Canonical default/main
scope matches existing legacy workspace semantics; an updatedAt-only change
is not a content edit. If local content is unchanged, preserve the latest row.
If both sides changed a draft differently, reject the whole save with an
Arabic/English error, including attempted issuance from that stale draft.
Identical concurrent content and edits to different documents remain accepted.

The existing priority for concurrently issued/voided documents and higher
revisions remains before the new draft-conflict guard. New document IDs and
#944's missing-draft protection are preserved. This does not implement a new
field-by-field merge policy or alter balance calculations.

## Verification and limits

The continuity suite covers cloned scope rows and legacy fields, no-op
timestamps, matching timestamps with different content, edited/issued stale
copies, independent and identical edits, and the original App save queue with
real domain functions and a synthetic local CAS adapter. Sources and rejected
inputs must remain unchanged; no second local commit or cloud sync is queued
for a rejected competing edit. Prior deletion/audit/backup cases also run.

The integrated run also exposed an existing clock-dependent purchase reversal
test: a reversal created at wall-clock time was asserted against 21 October.
The same failure reproduced on the earlier baseline without this draft fix.
Its synthetic reversal timestamp is now fixed at 20 October, retaining the
original before/after assertions and adding checks immediately before and on
the reversal date. No purchase/payable implementation or policy changed.

This does not recover edits lost before the correction or merge competing
document fields automatically. No schema, backfill, stored-data cleanup,
Firebase rule change, period activation or deployment. Real production/device
acceptance remains separate from these isolated regressions.

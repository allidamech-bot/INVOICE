# Draft deletion and audit continuity — 21 October 2026

Baseline: `e656ab101cd24677bed700587e1b90538711d6dc`.
Follow-up to overlap audit OVERLAP-07; not a reconstruction of the original forty items.

## Confirmed defect

`mergeDocuments` in `src/storage/vault-merge.ts` appended every intended
document absent from the latest snapshot, including a previously known draft
that another save had removed. `App.persist` calls `applyWorkspaceScope`, which
creates a document array even for an unrelated settings save. Consequently, the
array-identity shortcut did not protect this path: the old draft reappeared,
while its deletion audit event remained. This was reproduced with synthetic
data through the real scope/merge functions and the actual App save queue.

The deletion audit added in #933 remains useful and is preserved. The defect
is in the existing document merge, not duplicate audit generation or a second
accounting engine.

## Limited correction

For a draft present in the base but absent from the latest snapshot:

- An unchanged intended row stays deleted. Missing legacy default/main scope
  fields are compared with the same canonical scope as the existing workspace.
- A changed row, including attempted issuance, rejects the save with an
  Arabic/English error. The rejected input is not overwritten or saved.
- Genuinely new document IDs still append. Current records, concurrent edits,
  issued history and revision protections retain their existing paths.

Tests cover invoices, quotations and purchase orders, explicit/legacy scopes,
unrelated stale saves, queued stale autosave rejection, failed CAS then retry,
inactive branch preservation, new drafts, deliberate deletion, concurrent
retained edits and exact audit event preservation during portable backup
export/import. Reload normalization retains audit identity and scope; its
established defaulting of an empty nonfinancial event currency is unchanged.
The App queue tests substitute local storage/CAS only; they do not constitute
a live Firebase or real-browser concurrency test.

## Data impact and boundaries

No schema, migration, balance calculation or stored-record cleanup. Existing
resurrected records are not automatically removed because the system cannot
infer whether a later creation/edit was intentional. The change prevents the
reproduced future merge path. Rollback is a code revert; no migration to undo.
`documentEvents` remains the existing vault business history, not a new signed
or server-enforced append-only ledger. No production data, Firebase rules,
period activation or deployment is part of this change.

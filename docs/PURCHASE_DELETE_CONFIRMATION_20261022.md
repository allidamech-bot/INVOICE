# Purchase deletion confirmation — 22 October 2026

Baseline: `f63ea9abe75097cf1abe2396e52814abe9c84b20` (#964).
Integrated main through #958/#961–#964; their fourteen changed files matched
the main tree exactly before this correction.

## Confirmed defect

OperationsPage stores a purchase snapshot when its deletion confirmation opens.
App.deletePurchaseRecord checked the current status and inventory references,
then removed the current purchase by ID without checking that its content still
matched the confirmed snapshot. A completed intervening draft edit could thus
be deleted using the old confirmation. The merge's existing concurrent-purchase
guard cannot detect this case: its base is already the newly edited record.

Four failing runtime regressions reproduced completed notes/cost edits with
changed and unchanged timestamps. Both actual App.persist and the actual delete
handler run against real scope/merge/audit functions and a synthetic local CAS.

## Limited correction

Compare the confirmation snapshot with the current purchase before persistence.
Ignore updatedAt and canonicalize omitted default/main scope, consistently with
existing record scope semantics. On a content difference, reject with localized
instructions to reopen Operations and review before deleting. No second write,
sync scheduling, deletion event or success toast occurs on that path.

Ordinary deletion still records one deletion event. Failed CAS, posted-purchase
protection, inventory history protection, and preservation of hidden branches
retain the existing paths. Timestamp-only and default-scope stamping do not
require renewed review. Concurrent edits arriving after the handler starts
remain governed by the existing merge conflict guard.

No accounting, stock posting, balance formula, schema, migration, Firebase-rule,
production configuration or deployment change. No real accounts or customer
data were accessed. Already deleted data is not reconstructed. This synthetic
acceptance does not certify every live-device or physical-iPhone race.

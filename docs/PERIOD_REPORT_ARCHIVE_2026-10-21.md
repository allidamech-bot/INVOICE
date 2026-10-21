# Retained period report backup and restore continuity — Task 3C

Continues merged #923/#928/#929/#930 without changing accounting policy or
activating enrollment. Existing V2 local-copy envelopes now optionally include
a separately versioned `LOUREX_PERIOD_ARCHIVE_V1`. Older data-only V2 files remain
readable. Business schema 21 is unchanged.

Explicit account export reads all published report metadata and operation receipts
through fixed own-UID Firestore paths, paginated by document ID. It verifies every
report's bounded chunks, exact identities and SHA-256, and rechecks the permanent
control after collection. A concurrent commit/close/reopen aborts the export; it
never silently emits a partial history. All previous reports survive reopen and
republication and are included, together with actor, reason, time, source revision
and the audit generation chain.

Archive validation requires complete contiguous operations, unique identities,
all reports linked to their close events, unchanged revisions across close/reopen,
fresh commit revisions, matching publication/event times, increasing active cutoffs,
and the exact final boundary set. Snapshot hashes detect corruption; these checks
do not turn an editable file into a signed authority credential.

Recovery boundary: importing a local copy restores business data only, subject to
the current local and trusted server guards. The archived reports remain readable
evidence in the saved file; import neither writes historical reports nor recreates
server control, owner authority or enrollment. Original authoritative reports and
events remain in their immutable server namespaces. Disaster recovery that
re-creates lost server authority from a file is not implemented or claimed.

An explicit complete export requires connectivity to discover current retained
history. The existing 50 MB import limit is also enforced before export creates
a file; an oversized archive fails visibly without producing an incomplete copy.
This is a size/availability limit, not permission to prune retained history.

Independent review found an Important audit revision-chain gap. New RED cases
reproduced close/reopen revision jumps; the fix checks the preceding revision and
commit uniqueness. Publication-time mismatch was regraded Important because it
alters the reported closing time, and was fixed RED-to-GREEN in the same pass.
Active cutoff regression was also reproduced and fixed. The review's recovery
wording concern is explicitly settled by the boundary above.

Actual emulator acceptance exports both the original invoice-at-100 publication
and its corrected invoice-at-200 publication, with all six enroll/close/commit/
reopen/commit/close receipts. Importing an old business payload from that archive
cannot replace the newer closed history, and both server report hashes remain
unchanged. New unit cases cover archive corruption, missing/duplicate audit data,
actual file roundtrip, pagination beyond 100 receipts and pre-download size limits.

Rulings: preserve V2 compatibility through an optional separately versioned archive;
complete export requires current online history and retains the existing 50 MB
limit. Cost: offline or oversized complete exports are unavailable; no incomplete
archive is represented as complete. Imported evidence does not authorize server
history recovery; cost: rebuilding lost server authority needs a separately
designed and approved recovery process.

No live data, credentials, rules release or deployment was used.

Final local verification: complete production build and typecheck PASS; full Node
3,563/3,563 PASS; focused foundation/API/local/cloud/archive 91/91 PASS; actual
Firestore emulator 16/16 PASS; diff whitespace PASS. Existing backup contract
tests now require the archive argument; PIN-free, UID, local CAS, archive-before-
replacement and explicit-user-action assertions remain intact.

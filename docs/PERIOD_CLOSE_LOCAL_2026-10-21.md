# Closed-period local continuity — Task 3B

Continues #923, #928 and #929. No operational close/enrollment UI is enabled.
Task 3 remains open for retained historical-report backup/export and complete
continuity acceptance; Task 4 owner controls remain open.

The cloud reader verifies active report metadata, bounded chunks, SHA-256, exact
workspace/cutoff/report identity, verified account UID and unchanged server
control before retaining a device context. It reads only fixed own-UID report
paths. Full ISO calendar validation resolves the earlier Task 3A deferred minor.
Close/reopen control changes now notify the existing freshness watcher even if
the business manifest revision does not change.

Protection is device metadata separate from imported/exported business payload.
Local update and replacement CAS transactions compare the candidate against
the retained published projection before writing or archiving anything. Import
cannot erase the metadata; newer verified reopen can release a boundary. Valid
newer generations cannot be replaced by stale contexts or conflicting same-
generation contexts. A malformed advisory cache fails local saves closed and
can be repaired by fresh verified server context without replacing the draft.

First hydration and explicit cloud restore pass the independently verified
context separately from the incoming record. The transaction chooses the newest
verified context and installs data and protection atomically. Merely supplying
metadata on an imported record never grants authority. Cached boundaries are
only a local preflight: an offline device cannot learn an unseen close/reopen;
the trusted server still controls every authoritative publication.

New local tests cover closed-edit rejection at the shared ordinary/full-mutation
and backup-replacement writers, preserved drafts and archives, immutable context
on import, local CAS, monotonic reopen, conflicting contexts, malformed-cache
recovery, first-hydration atomicity, existing branch/company switching and open-
period business transactions. Existing AI bridge/account-isolation tests remain
part of the full suite; no independent browser closed-period AI acceptance is
claimed before the final Task 4 cycle. Cloud tests exercise report caching, ISO
dates and realtime control notification. Actual emulator exercises browser
report reads and create-only staging through owner rules and trusted publication.

Independent review found one Important issue: initial hydration installed data
and its protection in separate transactions. Two new RED cases reproduced
unprotected first hydration and acceptance of a mismatched initial payload.
The fix installs and validates both inside the same IndexedDB transaction. No
other Critical/Important findings were reported. No deferred minor remains in
this increment; the Task 3A calendar minor is resolved.

Ruling: cache active verified publications in local workspace metadata without
changing business schema 21. The cache cannot authorize cloud reopen. Cost: local
storage and guard computation grow with active snapshots; installation failure
blocks hydration rather than claiming protection. Complete retained-publication
backup/export remains a separate pending increment, so activation stays off.

No live credentials, rules release, deployment or production data were used.

Final acceptance: full Node suite 3,547/3,547 PASS; focused foundation/API/cloud/
local tests 75/75 PASS; actual Firestore emulator 16/16 PASS; complete production
build and typecheck PASS; diff whitespace check PASS. Existing data-URL storage
fixture resolves the new real dependency by absolute URL. Existing source
contracts now require the additional independently verified context argument;
their UID/archive/CAS assertions remain intact.

CI correction: the credit-treatment workflow failed because it required the
candidate to reproduce three failures from a frozen historical base. The current
candidate had zero of those failures. Replaced that historical comparison with
the entire current Node suite, without exclusions, tolerated failures or fixed
old commits. Existing focused finance and browser gates remain unchanged.

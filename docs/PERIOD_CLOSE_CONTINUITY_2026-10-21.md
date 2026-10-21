# Protected cloud transport — Task 3A

This increment continues merged #923/#928. Task 3 and original items 13–21
remain open; there is no enrollment UI, activation setting or production release.

The browser validates the fixed `period-generations-v1` manifest extension
before allocating or reading chunks, downloads only its authenticated UID's
immutable namespace, and rechecks the final manifest. Unknown namespaces fail.
Authoritative manifest and permanent enrollment-barrier reads require the server.

Enrolled uploads create new bounded stage chunks and metadata, obtain the
verified Firebase bearer, and send only operation identity and revision/control
CAS to `/api/workspace-commit`. Direct legacy publication is never a fallback.
Even explicit Keep This Device cannot bypass a protected stale revision.
The server remains the closed-period authority for every full-payload upload,
including backups, AI mutations and company/branch changes. Local drafts remain
recoverable; this increment does not claim to prevent local offline drafts.

A successful response or lost response is acknowledged only after an exact
server manifest hash match in the protected namespace, using existing local
revision/ancestry CAS. No staged, published or retained-report chunks are deleted.
Never-enrolled accounts retain their established transaction/history publication.

Verification: all 10 new transport assertions were observed RED before their
implementation, then GREEN; the existing 8 two-device tests pass. The existing
manifest-race fixture adds the newly introduced control-read dependency only;
its session-change and retained-chunk assertions are unchanged. The legacy
divergence expression remains intact with an additional protected-account guard.

Actual emulator verification: 16/16 passed, including a browser transport run
that reads through owner rules, stages through actual create-only Firestore
rules, publishes through the real trusted service, accepts a November operation,
rejects an October edit without changing the device draft, then permits the
correction after authorized reopen and retains the original publication.
Endpoint token verification is covered by the existing API test suite.

Fresh independent review found no Critical or Important issue. Deferred Minor:
client control-date syntax accepts impossible calendar dates; the server uses
full ISO calendar validation and rejects them, so protection stands. Cost:
malformed control can stage an unreferenced candidate before failing at server
validation. This should be aligned before final activation.

Ruling: split Task 3 into reviewable transport and remaining local/recovery
increments, preserving the approved accounting policy and leaving its checkboxes
open. Cost: no operational close feature until remaining continuity and UI gates.

No credentials were configured, and no live rules or deployment was performed.

Final local gates: typecheck PASS; full production build PASS; full Node suite
3,530/3,530 PASS; focused foundation/API/transport 58/58 PASS; emulator 16/16 PASS.
An initial run had three incomplete compiled assistant-runtime artifact failures
plus two transport-related source-fixture contracts. The contracts were preserved
and updated only for the added dependency; a complete production rebuild and
full rerun passed without assistant-source changes or weakened assertions.

Task 3B follow-up: the deferred calendar validation minor is resolved using the
shared ISO date validator, with a reproducing RED-to-GREEN case. See
`PERIOD_CLOSE_LOCAL_2026-10-21.md` for local protection and atomic hydration.

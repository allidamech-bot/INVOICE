# Trusted period server — Task 2

This implements the server portion of the approved period-close plan. It does
not activate a close UI, configure credentials, release Firebase rules, migrate
production data or complete checklist items 13–21. Client save/restore continuity
and end-to-end UI acceptance remain Tasks 3–4.

## Protocol and persistence

Public POST alias: `/api/workspace-commit`. A Vercel rewrite dispatches this to
an early deterministic branch in the existing `api/ai-core.js` function, which
lazy-loads `api/_accounting/workspace-handler.js`. No model, provider request,
AI context or AI rate-limit logic participates. This preserves the existing
12-function budget. The shared compiled TypeScript engines are packaged using
`includeFiles: dist/src/**`; no financial arithmetic is duplicated in the API.

Every request requires the existing verified Firebase bearer token, an own-UID
owner role, same-origin POST and the LOUREX request header. The body is bounded
to 16 KB, including streamed bytes; UTF-8 is decoded once after collecting bytes.
No caller-supplied UID, actor, path, role or arbitrary operation is accepted.

Commands carry `operation`, a 32-hex `opId`, `expectedRevision` and
`expectedGeneration`. `close` also requires company `workspaceId`, inclusive
`through` date and `reason`; `reopen` requires company and reason. `commit`
consumes the immutable staged metadata/chunks under that exact own-UID `opId`.
The additional explicit `enroll` command has generation zero and atomically
adopts the verified account into trusted publication before any close.

Server-owned account namespaces:

| Namespace | Purpose |
| --- | --- |
| `accounting/control` | Permanent enrollment barrier, control generation, current company boundaries and report IDs |
| `periodGenerations/{revision}/chunks` | Immutable validated workspace generations; clients cannot write here even before enrollment |
| `periodOperations/{opId}` | Idempotency fingerprint, result, verified actor, reason and server timestamp |
| `periodReports/{reportId}` and its `chunks` | Retained versioned source/report JSON, checksum, source revision, company, cutoff, reason and publication timestamp |
| `periodStaging/{opId}` and its `chunks` | Client-create-only bounded candidate transport; modification/deletion forbidden |

Enrollment first verifies the full legacy payload and copies it to a fresh
server-owned generation. A short transaction then checks the original revision
and checksum and atomically publishes the adopted manifest, control and receipt.
The manifest adds `chunkStorage: period-generations-v1`. A racing legacy chunk
edit cannot alter that independent verified copy. Missing/corrupt source chunks
leave enrollment absent. A concurrent manifest update makes adoption conflict.

Existing workspace/recovery reads remain UID-scoped. The rules preserve legacy
writes for accounts never enrolled. For an enrolled account, clients cannot edit
the workspace manifest, either legacy workspace/vault generation, recovery
history, control, operations, reports or server generations. A malformed control
does not restore legacy write access. Reopening clears a company boundary but
never removes enrollment or historical publications.

Source payloads retain the existing 45 MB limit and 180 KB chunks. Large bytes
are staged/copied outside the final transaction; only manifests, control, history,
publication metadata and receipt commit atomically. Published generation chunks
are never overwritten or deleted. Losing attempts can leave unreferenced chunks;
no unaudited garbage collector is introduced.

Both the control generation and current manifest revision/hash are rechecked at
commit. Duplicate retries return the stored result, including when an initially
empty receipt read is delayed until after the first request commits. A reused
operation ID with another command is rejected. Closed-state checks compare both
current/candidate data and the independently retained published snapshot, so
preexisting source drift cannot silently become a new baseline.

## Configuration and release boundary

`firebase-admin` is pinned to 14.5.0, server-side only. The production adapter
requires `LOUREX_PERIOD_SERVER_ENABLED=true` and `LOUREX_PERIOD_RULES_VERSION=1`,
plus a server credential through `GOOGLE_APPLICATION_CREDENTIALS` (ADC) or
`LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON` for project `lourex-invoice`. These are
private hosting settings, never browser configuration or repository files.
No credentials were obtained, configured or printed in this change.

The production adapter rejects emulator configuration and fails closed when
configuration is missing. These flags must not be enabled before reviewed rules
release and compatible client integration. In particular, the existing client
does not yet download the new `chunkStorage` namespace or route saves through the
trusted protocol: enrollment must remain unavailable to users until Task 3 lands.
The existing exact-commit/rules-checksum/live-backup release gate is unchanged.

Official API references consulted:
[Admin setup](https://firebase.google.com/docs/admin/setup),
[transactions](https://firebase.google.com/docs/firestore/manage-data/transactions),
[function packaging](https://vercel.com/docs/project-configuration/vercel-json).

## Verification

Local endpoint/format/auth tests and the actual Firestore emulator exercise
signed/invalid/expired/nonowner tokens, strict commands, bounded/hash-checked
chunks, Arabic request reasons, isolated roles and QR portal compatibility,
old-client writes, immutable staged and report data, stale devices, reopen and
retained versions, close/commit and close/reopen races, concurrent duplicate
requests, delayed receipt reads, corrupt enrollment and legacy-write adoption.

The initial rules test reproduced a direct client overwrite of the manifest.
Separate RED tests reproduced malformed Arabic streaming, acceptance of an
already-drifted source, the delayed duplicate conflict and corrupt enrollment.
Independent review confirmed the latter two Important findings; fixes preserve
all existing acceptance assertions. Final command results are recorded in the PR.

Implementation rulings: explicit enrollment uses immutable adoption instead of
freezing mutable legacy chunks in place; published generations have their own
always-server-owned namespace; HTTP transport reuses an existing function to
respect the established budget. Cost of the staged boundary: no operational
period-close protection until client continuity and owner controls are complete.

Final local verification on integrated main `85e094b7`:
- `npm run typecheck`: passed.
- `npm run build`: passed with final runtime owners.
- `node --test tests/*.test.mjs`: 3,520 passed, zero failures.
- Focused final compiled assistant runtime: 50 passed after a clean final build.
- Endpoint/foundation tests: 48 passed.
- Firestore emulator: 15 passed (11 trusted protocol, 4 existing rules cases).
- Rules release dry run: passed; no deployment or live rules write.

An earlier integrated run had three assistant runtime failures against incomplete
compiled runtime artifacts. Rebuilding the complete production pipeline restored
the final wrappers; focused and full reruns passed without changing assistant
source or weakening tests.

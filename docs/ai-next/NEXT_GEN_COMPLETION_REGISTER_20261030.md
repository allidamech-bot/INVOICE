# LOUREX AI Next — Continuous Completion Register

As of 2026-10-31. This is a code/evidence register, not an authorization to activate live AI or finance writes.

| Work package | Implementation | Synthetic tests | Browser/WebKit | Trusted persistence | Security acceptance | Production authorization | Active in production |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R00 architecture | Merged #1189 (documentation) | N/A | No | No | Open | No | No |
| R01 domain contracts | Merged #1190 | Previous focused tests passed | No | No | Synthetic only | No | No |
| R02 document evidence | Merged #1191 (injected parsing adapters) | Previous injected fixture tests passed | No real binary evidence | No | Synthetic only | No | No |
| R03 state and memory | Merged #1192 (single-process) | Previous focused tests passed | No | No | Synthetic only | No | No |
| R04 drafts and approvals | Merged #1193 (execution disabled) | Previous focused tests passed | No | No | Synthetic only | No | No |
| R05A eligibility/local intents/gateway/proposal guard | Merged #1194, 237a39c9 | 125/125 mocked regression; Vercel isolation passed | No | No | Mock boundary only | No | No |
| R05B trusted model catalog bridge | Merged #1195, 6c2bfd07774c | 134/134 offline checks; build safety passed | No | No | Open | No | No |
| R06A isolated new UI/view-model | Merged #1196, 23aa0dcf | 11/11 view-model checks; TS/Web build isolation passed | No | No | Open | No | No |
| R07A isolated Firestore CAS adapter | Merged #1197, 3f8bd285 | 118/118 scoped CAS regression; Vercel isolation passed | No | No | Open | No | No |
| R07B1 principal and membership boundary | Merged #1198, c548a469 | 57/57 auth regression, Vercel isolation passed | No | No | Open | No | No |
| R07B2 read-only local coordinator | Merged #1199, 66ad16b0 | 133/133 synthetic local regression, Vercel isolation passed | No | No | Open | No | No |
| R07B3 root server-only ACL reader | Merged #1200, 729b80ab | 44/44 scoped mock ACL tests; Vercel isolation passed | No | No | Open | No | No |
| R07C actual PDF/XLSX/XLS adapter browser fixtures | Merged #1201, d6e2871e | 26/26 R02 regression + real binary Chromium/WebKit PASS | Representative WebKit passed (not iPhone) | No | Open | No | No |
| R07D inactive Firestore review-draft CAS | Merged #1203, b6a96e8a | 84/84 scoped synthetic tests; Vercel isolation passed | No | No live backend | Open | No | No |
| R07E private original source-byte adapter | Merged #1204, 4ec65003 | 40/40 R02 cloud-object synthetic tests; Vercel isolation passed | No | No live bucket | Open | No | No |
| R07F explicit-consent memory CAS | Merged #1205, 1816f26b | 37/37 R03/consent regression; Vercel isolation passed | No | No live backend | Open | No | No |
| R07G bounded sharded conversation event storage | Merged #1207, 7cda1f0d | 44/44 R03/R07A/R07G tests; 325 events; CI/isolation PASS | No | Mocked Firestore only | Open | No | No |
| R07H actual Firestore Emulator transaction verification | Merged #1208, 71896d2b | 4/4 official Firestore Emulator + Firebase Admin acceptance PASS | No | Local emulator only, no live service | Open | No | No |
| R07I recent non-authoritative window + emulator restart recovery | Merged #1210, d8bf5f1d | 49/49 R03/R07G/R07I synthetic + 2 separate emulator phases PASS; Vercel isolation PASS | No | Local emulator export/import only | Open | No | No |
| R07J indexed O(1)-read event append | Merged #1212, 36d9a815 | 48/48 R03/R07G/R07J synthetic; 3/3 official Firestore Emulator; TypeScript/isolation PASS | No | Emulator only, no live store | Open | No | No |
| R07K local Controller/Advisor indexed compatibility | PR pending | Synthetic and Firestore Emulator pending | No | Emulator only | Open | No | No |

## Evidence boundary

The R05A gateway is a standalone TypeScript module; it has no active API endpoint and cannot send real prompts without a trusted injected transport. Its TrustedModelRecord booleans are required to be computed by **server authorization and provider billing/privacy checks**, never accepted from the browser or LLM. Passing mock tests is NOT proof of current free-tier account eligibility.

The storage choice, trusted membership resolver, real PDF and Excel binary adapters, OCR privacy approval, cross-instance CAS, signed durable approvals, financial-domain exactly-once operations, and iPhone Safari acceptance remain open. R04 financial execution remains disabled.

Deployment and provider configuration must remain unchanged. Check final PR SHA and CI before marking R05A merged.

## R05B additional privacy and billing boundary

R05B reads existing catalog helper results without inference, exposing only server-owned model metadata. It requires separate new-server provider privacy approval, account free verification, per-model verified zero-cost eligibility, and quota evidence. Existing production environment settings are not modified. Unknown authorization remains false. Actual server coordinator and tested provider invocation remain blocked.

## R06A browser and authority boundary

A standalone Arabic-first presentation component exists, with independent composer state, a capped message window, multiple file selection, status/coverage distinctions, draft line ID edits, undo/redo callbacks, memory controls, cancellation/retry and source-selection callbacks. It is deliberately not imported into the legacy app and its feature flag remains false. It cannot claim actual upload, save, authorized approval, persistent draft recovery, mobile Safari acceptance, or working provider integration without R07 authenticated endpoints and a browser/device test. No actual financial mutation methods are called by this component.

## R07A not-yet-accepted data durability

R07A provides an injected Firestore-compatible event CAS adapter capped to 300 events and 700,000 JSON bytes, with strict thread-scope key and compare-and-swap checks. It has not been run against live Firestore, backed up, shared across real devices, or authorized for production. Document-backed source objects, memory persistence, server membership authority, actual end-to-end coordinator and financial exactly-once mutation semantics remain blocked. See R07A_CAS_STORAGE_EVIDENCE_20261030.md.

## R07B1 authority gate

R07B1 extends existing signed Firebase identity verification into the R03 principal contract and requires independent server-only company and branch membership verification on every request. No live membership resolver is connected. The code is behind a disabled API flag and cannot be considered production authentication acceptance. See R07B_IDENTITY_MEMBERSHIP_EVIDENCE_20261030.md.

## R07B2 safe local-turn coordinator

R07B2 binds R07B1 authoritative scope construction to R03 event CAS and R05 deterministic local greetings and R04 unsaved draft creation. Only claims draft existence after injected server-only store confirms its exact revision hash. No API endpoint or production UI is connected; missing company membership and durable repositories remain deployment blockers. See R07B_LOCAL_COORDINATOR_EVIDENCE_20261030.md.

## R07B3 root ACL service

An inactive, read-only Firestore Admin-compatible membership adapter uses a new root collection outside the client-writable /users tree; its current production records, deployed rules and privileged IAM remain unverified. No client-side workspace directory is trusted to grant AI permissions, and no membership records are automatically provisioned. See R07B_ADMIN_ACL_SOURCE_EVIDENCE_20261030.md.

## R07C binary parsing evidence

Targeted real PDF.js and SheetJS browser fixtures use actual binary PDF/XLSX/XLS files with synthetic content. They test page and worksheet provenance in Chromium/WebKit without AI calls or customer data. OCR remains injected/uncertain and no financial drafts are eligible. See R07C_REAL_BINARY_ACCEPTANCE_20261030.md. Browser acceptance is not equivalent to iPhone device acceptance.

## R07 acceptance snapshot — verified October 30, 2026

Evidence: [R07C browser CI](https://github.com/allidamech-bot/INVOICE/actions/runs/41085645912) passed on tested branch SHA 3e713ca70aec6f81d27c140d1bddd9c7d158f412. The squash merge is d6e2871e954d7c25c4110ca90c6dcad9fa8754a4. No code changes were made after the successful tested SHA in that PR.

- T01: local greeting and no-provider response tested through isolated coordinator only. Production acceptance OPEN.
- T07: generated *real binary* PDF.js 35/35-page extraction and exact page indices in Chromium + WebKit PASS for the fixture; broad production document acceptance OPEN.
- T08: generated real binary PDF extracted more than 24,000 characters without truncation PASS for the fixture.
- T09: 8-page actual image-XObject PDF, OCR disabled or injected with one failed page, correctly blocked or marked incomplete in Chromium + WebKit. Real OCR quality and authorization BLOCKED.
- T10: actual XLSX and BIFF8 XLS with two sheets, repeated descriptions, physical blank rows, Arabic/Persian numeral source text and absent sales price; CSV quoted multiline and blank-row coverage passed in both browsers. Business-field mapping/review still OPEN.
- T22: authoritative encrypted cross-device persistent storage, revocation after restart and real two-device sessions BLOCKED.
- T23: WebKit R02 parsing fixture only, not full R06 interface or a physical iPhone. Full iPhone acceptance BLOCKED.
- T24: authenticated persistent server coordinator, sources, reviewed draft, approval and verified financial outcome end-to-end BLOCKED.

The root ACL reader R07B3 is only code with mocked Firestore. There are no approved or observed live membership records or deployed root-deny rule verification. R07A's single Firestore event-document adapter is not approved production storage. R07B2's injected draft store is synthetic. The full 24-test acceptance matrix is not complete, and all production feature flags remain OFF.

## Next critical engineering gate

Do not connect production HTTP or enable a live UI before proving: server-only ACL records with deployed rules/IAM, approved durable encrypted storage and retention/cost policy, secure source object storage, actual server coordinator with proper idempotent transactions, approved private inference providers, source completeness and reviewed draft persistence. An isolated pre-release browser acceptance is not permission to change financial data or financial rules. Finance writes remain disabled.

## R07D review-only draft storage

R07D introduces an inactive Firestore Admin-compatible, transaction-backed repository for unsaved quotation review drafts and guarded revision updates, with strict scope/turn identity and content integrity checks. Synthetic cross-instance tests do not prove real Firestore persistence; ACL, retention and IAM verification remain unclosed. See R07D_DRAFT_STORAGE_EVIDENCE_20261030.md.

## R07E private source bytes

R07E adds an inactive backend-compatible Google Cloud Storage object adapter to preserve original R02 uploaded bytes under a scope-bound hashed name. Its create-only generation preconditions prevent replacement on retry and read verifies full downloaded checksum. No live bucket, credentials, IAM, privacy policy or customer-data upload is authorized. See R07E_PRIVATE_SOURCE_OBJECTS_EVIDENCE_20261030.md.

## R07F explicit-consent memory

An inactive server-only Firestore-compatible memory backend reuses R03's explicit-consent APIs, scoped cross-thread access, expiration and revocation tombstones. Its strict CAS prevents reordering, rewriting approved memory and resurrecting revoked records; no live storage, rules, security policy or retention deletion procedure is approved. See R07F_CONSENTED_MEMORY_EVIDENCE_20261030.md.

## R07D–R07F verified code-only closure — October 30, 2026

- **R07D PR #1203**: code merged at b6a96e8a8f15533ac7fd5e2b12563d6ffdb07765, 84/84 offline tests, TypeScript and Vercel isolation PASS. Strict review-only draft create/replay and CAS edit; no live data store.
- **R07E PR #1204**: code merged at 4ec65003ecad5bb75d17ef3cfe18b20baba4dcac, 40/40 offline tests, TypeScript and isolation PASS. Immutable scope-keyed original-byte storage adapter with mocked GCS operations; no live bucket or privacy approval.
- **R07F PR #1205**: code merged at 1816f26b2189fef75f4288ee910e1782e708c382, 37/37 offline tests, TypeScript and isolation PASS. Explicit-consent memory CAS and revoked-content tombstones; no live consent or retention approval.

**R07 remains OPEN.** No new HTTP endpoint, enabled flag, deployed feature, approved server-only ACL, production Firebase/GCS data operation, real user file or live financial write was authorized or performed. No live data ever flows into the above synthetic suites. Tests do not close T22, T23 or T24. R07A retains the known 300-event / 700 KB proof-of-concept limit; inactive R07G bypasses that particular limit under synthetic tests, but is not approved for production long-conversation acceptance. A release needs verified deployed Firestore rules, independently provisioned server ACL, privileged IAM, approved retention/privacy/cost, actual cross-instance GCS/Firestore tests, source-to-review end-to-end, real provider policies, browser UI integration and physical iPhone Safari acceptance. No production deployment is authorized by merging code.

## R07G bounded long-thread storage candidate

R07G adds an inactive Firestore-compatible per-thread head plus contiguous event-shard adapter. It no longer uses R07A's 300-event single-document cap, while preserving R03's 20,000-event ceiling and explicit per-shard/head limits. Tests are mock-backed only; full R03 projection of prior history on every append is still a scaling/latency blocker. No live migration or Firebase read/write was authorized. See R07G_SHARDED_HISTORY_EVIDENCE_20261030.md.

## R07H real local Firestore Emulator gate

R07H performs the R07G sharded CAS path against official Firebase Admin + Firestore Emulator with strictly local `demo-` project guard. Real Cloud Firestore IAM, deployed security rules, retention, backup/recovery, multi-process deployment and live latency remain untested. See R07H_FIRESTORE_EMULATOR_EVIDENCE_20261031.md.

## R07G–R07H verified integration closure — October 31, 2026

- **R07G PR #1207** merged at 7cda1f0dbcba580f40e47936de19af7cdb41dad4 after 44/44 targeted R03/R07A/R07G synthetic checks, strict TypeScript and Vercel trace isolation succeeded. Tested 325 event append/replay across four bounded shard documents.
- **R07H PR #1208** merged at 71896d2b74bd4cc5a7563e76ece6b4a7a52339ff after 4/4 **official local Firestore Emulator** tests passed: 99 events across two Admin SDK clients, CAS conflict, isolated scope and corruption failure. The Firestore Emulator workflow passed with test project `demo-ai-next-r07h`, with no live access.

**Not accepted for production.** R03 still projects and verifies full history for every append; no proven latency/cost budget for large histories, no actual cross-process/physical-device test, Firestore rules/IAM verification, live membership provisioning, approved retention/backup and recovery, real provider eligibility, released UI or full T22/T24 acceptance. All flags remain OFF. Finance track untouched.

## R07I limited recent read and recovery candidate

R07I introduces read-only presentation tail retrieval of at most 128 events without claiming full replay security, plus local emulator process restart/export/import recovery. Neither changes authoritative R03 full-history writes or enables a live route. CI evidence pending; see R07I_RECENT_WINDOW_RECOVERY_EVIDENCE_20261031.md. T22/T24 and full append performance remain OPEN.

## R07I code/emulator closure — October 31, 2026

- **R07I PR #1210** merged at d8bf5f1d4291094e4dc1e5cbd1d573949363bad3. All five final-sha GitHub check jobs passed. The targeted full regression had 49/49 passing synthetic tests; real Firestore Emulator seed/export and restarted-import/verify phases passed 1/1 each.
- Important discovered/fixed defect: R07G's original insertion-order JSON chunk checksum falsely reported corruption after Firestore export/import, because nested map ordering changed. Replaced with deterministic recursive canonical JSON checksum (inactive backend, no production migration). Full R03 event chain validation remained mandatory.
- The 128-event recent window is strictly **non-authoritative display-only**; partial earlier history is not validated, and no mutation/approval/controller decision may use this view. Full R03 appends still re-read/replay the complete history and require R07J performance design and multi-process/service acceptance. Do not imply physical iPhone, live cloud IAM/rules, backup retention or production readiness.

## R07J indexed event append candidate

Standalone disabled indexed journal returns a narrow receipt instead of R03's full projection and avoids reading all previous events for every append. Persistent per-event and uniqueness index writes trade Firestore write volume for fewer reads. No API or coordinator integration, no migration, no live IAM/security/cost acceptance. Tests pending; see R07J_INDEXED_APPEND_EVIDENCE_20261031.md.

## R07J indexed append code-only closure — October 31, 2026

- **PR #1212** merged at 36d9a815c9c76f1d60ebdfe7b6a0db8b8b2a4b87 after 48/48 targeted R03/R07G/R07J synthetic tests and 3/3 official local Firestore Emulator tests; four SHA-bound GitHub check jobs passed.
- Bounded-read test ran **320 sequential synthetic messages** and verified no more than ten mock document reads per append; full R03 replay audit reconstructed all 321 events. Distinct Firebase Admin app clients proved transactional indexed CAS, replay, head scope isolation and event corruption rejection on the emulator.
- **Implementation NOT activated:** completely separate root collection, no legacy migrations or real Firebase/finance writes. `R07J_INDEXED_APPEND_ACTIVE=false`. The optimized method returns a narrow durable receipt, **not** the full R03 snapshot; coordinator/view-model integration and complete operational-read recovery remain OPEN. IAM/ACL, event-index repair, real cloud costs/latency, retention/backup and iPhone tests are also open. No production deployment permitted.

## R07K compatibility bridge pending

R07K binds the existing R07B2 local coordinator to the R07J indexed journal through a full-history-auditing compatibility bridge; preserves R03 semantics at a significant full-replay performance cost. It is not a live route or a production speed claim. Unsaved quotation storage stays isolated. See R07K_INDEXED_COORDINATOR_COMPAT_EVIDENCE_20261031.md.

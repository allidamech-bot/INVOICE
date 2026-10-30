# LOUREX AI Next — Continuous Completion Register

As of 2026-10-30. This is a code/evidence register, not an authorization to activate live AI or finance writes.

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
| R07C actual PDF/XLSX/XLS adapter browser fixtures | PR pending | Real binary browser CI pending | Pending representative WebKit | No | Open | No | No |

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

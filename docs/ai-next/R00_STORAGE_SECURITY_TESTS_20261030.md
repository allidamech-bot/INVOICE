# LOUREX AI Next Generation — R00 Storage, Security, Privacy and Acceptance Design

- Work package: R00
- Date: 2026-10-30
- Baseline commit: 7e8b0c34bb7db07d99b254bd96c500af5caa03d3
- Status: DESIGN PROPOSAL / REVIEW REQUIRED; not implemented
- Reference: R00_ARCHITECTURE_DECISIONS_20261030.md and R00_CONTRACTS_V1_20261030.md
- Governing plan: Conversation Rebuild Plan v1.1 supplied by owner

## A. Storage architecture and lifecycle

### A1. Logical authoritative storage (physical backing TBD in R01 integration research)

- ai_next_threads: scope, active task/version, safe title, timestamps; no credentials
- ai_next_turns: append-only turns with canonical server scope and unique request key
- ai_next_task_events: immutable ordered events, CAS state version and per-task checkpoints
- ai_next_task_snapshots: derived projections only; every snapshot identifies event sequence
- ai_next_source_objects: encrypted-at-rest original source bytes with sha256 and immutable objectId
- ai_next_document_manifests: page/sheet/segment accounting, parser version, per-source checksum
- ai_next_evidence: field-level source locators, extraction runs, statuses and corrections
- ai_next_drafts: revisioned, scope-bound unsaved working documents and edit history
- ai_next_approval_receipts: server-authored, one-shot, scope-/revision-/source-bound grants and revocation tombstones
- ai_next_operation_ledger: immutable operation IDs, expected versions, before/after verification and reconciliation states
- ai_next_memory: scoped, consent-aware facts with original source pointers, TTL and deletion metadata
- ai_next_diagnostics: metadata-only correlation IDs, stage durations, failure codes, no payloads

**Physical implementation caution:** do NOT select existing Firestore user subcollections as server-only safe by default. The inspected firestore.rules allows existing owner-authenticated writes beneath a generic users/{uid}/{collectionId}/... path, so AI-next execution/approval records placed there would require additional explicit controls or a different database/storage boundary. This is a security gate, not permission to alter finance rules. Choose a durable provider only after proving backend authority, transactional uniqueness/CAS, account isolation, encryption, cost and non-interference with production.

**Suggested physical strategy to investigate:** use existing Firebase identity, separate server-only AI-next persistence with deny-by-default client permissions and indexed transaction-capable records. Binary objects must be stored out-of-line (not as oversized Firestore documents); content-addressed checksum, encryption, upload validation and per-account quotas. An isolated Firebase project/bucket or compatible server database may avoid touching financial rules but can add cost/ops. Do not select until feasibility, privacy and free-tier constraints are verified. Browser IndexedDB AES-GCM cache may improve offline UI, but cannot be the authoritative cross-device source or approval ledger.

### A2. Authoritative write transaction

1. Verify Firebase ID token, identity and authoritative account/workspace/branch permission server-side.
2. Resolve task/thread and expected event sequence under CAS.
3. Normalize/validate request and source handles; assign an operation-scoped idempotency key.
4. Persist attempted transition and immutable checkpoint (or refuse if invalid).
5. Resolve tool authority; require fresh approval receipt and business revision for execute.
6. Reserve unique operation ID in durable ledger, then call an existing guarded financial domain adapter.
7. Verify the resulting financial record identity and revision; append ExecutionVerified and consume approval atomically wherever supported.
8. If process dies between write and verification, record needs_reconciliation and query existing data by operation ID/known result; do NOT reissue blindly.
9. Return confirmed status only after verification.

**Cross-store atomicity caveat:** when financial vault and AI-next ledger are not in the same transaction, exactly-once execution is impossible to claim without a domain-level idempotency marker / authoritative lookup. R04 must prove this invariant for each allowed mutation; otherwise those mutations remain blocked. No modifications to the financial core are authorized as a shortcut.

### A3. Source processing and evidence completeness

Process each attachment independently: upload -> validate magic bytes/MIME/size -> checksum -> immutable store -> discover page/sheet counts -> extract text/OCR -> table/row index -> compare manifested expected/observed segments -> validate business fields -> emit Coverage.

- Each page records processing attempts and result status, including blank or failed scans.
- Each table row has a stable locator; duplicate product names do NOT imply duplicate row IDs.
- Corrected files are separate versioned sources linked to original facts and explicit replacement mapping.
- An OCR confidence score cannot prove table-row completeness. For unsafe bulk conversion, require human review or an independent structure check.
- Unknown prices/units/currency are explicit missing fields, never filled from supplier cost or a different record.
- The entire byte source persists across prompt truncation. Limited prompt windows never truncate an existing quote or silently remove rows.
- A long PDF, many attachments or unparseable page may emit partial evidence for user review, but no completed-source claim.
- Resource caps still required for decompression bombs, excessively large images, unsafe formulas, zip traversal and excessive sheet dimensions; respond with a precise blocked reason and affected segment instead of silently reducing scope.
- CSV/Excel formula injection must be rendered as inert text, not executable HTML, and spreadsheet formulas must not execute during ingestion.

### A4. Retention, deletion and encryption policy (owner decision pending)

- Default for R00/R01: synthetic test data only; no storage of real customer documents by the new service.
- Proposed classification: public/synthetic, internal business, confidential financial/identity.
- Server encrypted at rest, TLS in transit, least-privilege service credentials; tenant-specific logical boundaries and scoped object access.
- Raw source retained only for an explicitly documented purpose and time; model prompts retain no unnecessary extracted raw content in diagnostics. Retrieval returns only authorized segments, not whole-files indiscriminately.
- Separate settings for conversation history, persistent knowledge, document attachment retention and backup/restore. Default memory promotion is NOT automatic. Long-term user-approved knowledge requires exact consent, source, owner and expiry.
- Deletion cascades references, stored objects, cached previews and scheduled processing. Audit legally necessary for a financial operation should retain minimum metadata under separately approved policy; do not promise deletion of existing financial ledger records.
- Actual TTL, export, residency, hosting country, recovery objectives, cloud costs and vendor agreement remain unapproved; resolve before storing live business files.

## B. Security design and access boundaries

### B1. Trust model

Trusted: verified Firebase ID token, server-side account/workspace/branch membership, actual finance domain authorization, stored task event/approval ledger.

Untrusted: natural language input, attachment content (including embedded instructions), metadata and filenames, model output, client-side "approved" flags, URL IDs, UI modes, imported historical state and logs sourced from providers.

Checks must be performed for EVERY nested request and object retrieval (including threads -> attachments, task -> draft, draft -> customer). Avoid insecure direct object references; scope is derived from verified identity and server-side membership, not accepted from query params.

### B2. Approval and policy

- Advisor is read-only regardless of model suggestions.
- Controller prepares but cannot issue/sell/post by inference alone.
- Existing financial permission checks and approval steps are mandatory; never relax them for smoother AI UX.
- Client-level operator selection must not gain custom-claim authority. The inspected existing API role verifier accepts only trusted role claims and has a backward-compat owner fallback for signed-in UID; do not treat this fallback as a new employee membership system.
- Existing financial boundaries (including period locking, VAT, stock movements, original PDF generation and accounting policies) remain untouched.
- Revised draft -> invalidate prior review and approval. Source change, rate/price/unit change, actor or branch change -> invalidate.
- Expired/rejected/revoked approvals have durable tombstones. Restore of old history cannot reanimate execution rights.
- The model cannot generate its own tool privileges or specify a different company.

### B3. Upload and prompt-injection controls

Validate signatures, MIME, supported codecs, size, page count, maximum expanded size, and filename escaping. Prevent remote fetch of arbitrary embedded document URLs by default. Sanitize or disable active PDF actions, spreadsheet formula execution and unsafe preview script execution. Separate extracted document data from system instructions with strict structured tool envelopes. Treat any model-proposed action as tainted until validated against source and scope. No upload may cause execution simply by carrying imperative language.

### B4. Model/data privacy controls

Eligibility order MUST be:
1. Task capability and source modality compatibility.
2. Verifiable current account/model availability.
3. Free-zero-price or separately owner-approved billed inference.
4. Business-data/privacy destination allowlist.
5. Model output contract and context/attachment limits.
6. Current health/timeout/rate budget.

Reject with explicit categories: not_configured, not_eligible, unsupported_capability, privacy_blocked, rate_limited, timeout, network_failure, invalid_response, temporary_unavailable.

Metadata/catalog discovery MAY occur without business prompts when permitted, but does not authorize private prompt routing. Provider health is advisory, not evidence that an account has free quota. Limit attempts and request budgets; no infinite fallback and no bypass of account-wide 429s. Prefer deterministic parsers and local rules for simple greetings, navigation and validated arithmetic. Do not enable paid inference, share private business data with extra providers, or update credentials in R00.

### B5. Diagnostics

Log only request ID, per-stage code/duration, model/provider ID when eligible, hashed object/ref identifiers (avoid reversible sensitive references), error category, retry count, source coverage counts and code/commit version. No keys, bearer tokens, business texts, extracted rows, personal identifiers, raw model responses, document names containing client names or customer amounts. Logs are scoped to authorized diagnostic owner and have bounded retention. Performance measurement must distinguish local UI, network, provider, parsing and final response time.

## C. Acceptance fixtures and test strategy

### C1. Synthetic fixture inventory (create in R01/R02; nothing live)

- F01-ArabicGreetings: short Arabic greetings, colloquial variants, English and bilingual follow-ups.
- F02-DialogueContext: 100+ turns with corrections, topic switch, ambiguous "الثاني", and same-thread references.
- F03-PDF24K: selectable-text PDF with >=24,000 characters, manifest of expected segments.
- F04-PDF35: 35-page selectable-text PDF with distinctive markers on every page.
- F05-Scanned8: 8-page image PDF including one illegible page and partial-table test.
- F06-10Files: ten heterogeneous attachments with unique source markers and one duplicate filename.
- F07-Workbook: multi-sheet XLSX/CSV with repeated product names, blank selling prices, merged cells, formula-like text, Arabic/Persian digits and mixed currencies.
- F08-PriceCorrected: a second document that modifies source row quantities/prices without duplicating lines; controlled matching references.
- F09-PackUnits: carton, piece, kg and mixed-unit cases; explicit packaging metadata and missing conversion blockers.
- F10-QuoteDraft: synthetic customer, 6 line IDs, evidence, revisions, missing prices, invalid unit/currency, undo/redo.
- F11-Router: mocked providers with zero-cost eligible, privacy-denied, bad schema, 429 model/account level, timeout, unsupported PDF/vision and all providers offline.
- F12-Access: two distinct synthetic UIDs/accounts, two companies, branches, expired role claim and attempted resource-ID swapping.
- F13-Crash: cancellation before write, during write, after unknown commit, duplicate POST, stale approval and revoked approval.
- F14-Mobile: iPhone Safari keyboard input, multi-file picker, preview, navigation/reload, focus and memory pressure; test with browser instrumentation, not only unit mocks.
- F15-LongRows: 120+ rows with row-end sentinels plus explicit limit behavior; separate AI source extraction from approved financial editor limit.

All fixture data must be synthetic, version-controlled or reproducibly generated, and carry SHA/checksum expectations. No real customer/supplier document use without explicit separate owner authorization.

### C2. T01–T24 evidence mapping

| Acceptance IDs | Primary module | Mandatory evidence |
| --- | --- | --- |
| T01–T04 | Coordinator / intent evaluation | Expected intents, dialect/bilingual cases, local timing vs provider timing |
| T05–T06 | State/memory/reference resolution | 100+ turn trace, stable IDs, ambiguity denial |
| T07–T11 | Document engine | Page/row manifest, extraction diffs, partial/blocked handling, ten-source isolation |
| T12–T14 | Source matching / pricing | Correction provenance, blank prices and unit equality invariants |
| T15–T16 | Draft tools | Exact draft revisions, all untouched lines, no vault mutation |
| T17–T18 | Router/recovery | Error categories, eligible bounded fallback, preserved checkpoints |
| T19–T21 | Execution and approval | CAS/idempotency, blocked expired/revoked approval, no duplicate writes |
| T22 | Persistence/recovery | Browser reload/device switch with exact tenant scope and revoked authority |
| T23 | iPhone Safari / accessibility | Real device or approved representative instrumented acceptance, keyboard/files/preview |
| T24 | Full E2E | Complete source -> grounded unsaved quote -> exact review -> explicit approval gate -> verified outcome (synthetic only until authorized) |

For every test retain: identifier, fixture hash, expected, actual, commit SHA, pass/fail, log/artifact path, known limitations, reviewer and execution environment. Include at least one negative or malformed case per applicable positive test. CI pass on mocked paths is required but not sufficient for real device acceptance.

### C3. Quality thresholds (provisional)

- T01 local simple response p95 <= 3 seconds under explicitly documented device/network/test setup; separate offline/local and AI provider paths.
- Observed real task progress p95 <= 5 seconds where supported, not simulated spinners.
- All financial deterministic fixtures exact, decimal-based, currency-separated.
- 100% accounted pages/rows OR explicit partial/blocked status; do not count a blocked large source as complete success.
- Zero accepted duplicate financial execution, unauthorized writes, crossed scope, stale approval use or silent substituted source.
- Zero indefinite loading: each stage emits finite timeout/terminal/recoverable state.
- All critical iPhone Safari cases pass; supported OS/browser versions documented during R06.
- Provider scores and actual latency are measured over useful cohorts; no ungrounded guarantee for third-party uptime.

### C4. Execution gates and cost discipline

R00: documentation review only, no real data or AI calls.

R01: strict schema validators + pure transition engine + negative state/scope/idempotency tests. No financial integration.

R02: local/synthetic full-document parsing, per-page/sheet evidence and resume. No business writes. No repeated expensive inference.

R03: coordinator, memory, source selection, durable store proof and state recovery. Use mocked inference.

R04: typed adapters, draft versions, approval one-shot semantics; only synthetic/sandbox financial domain data. If cross-store dedup cannot be proven, keep writes disabled.

R05: mocked provider routing, catalog eligibility and bounded fallbacks; optional one approved synthetic live smoke only after provider/privacy verification.

R06: new interface behind disabled flag; performance/accessibility/iPhone Safari checks, no legacy patch-script copying.

R07: full integration, CI and E2E on approved environment, shadow read-only evaluation, security and privacy acceptance, migration/rollback rehearsal, explicit owner release decision.

Do not run the full suite repeatedly on unchanged code. Preserve fixture, SHA and CI links as evidence. PR only; never auto merge.

## D. R01 implementation dependency map and file scope

- R01 depends on R00 architectural and storage security approval.
- Proposed new-only files: src/ai-next/domain/*, src/ai-next/contracts/*, src/ai-next/evals/*, tests/ai-next/*, optionally api/ai-next/* stubs (not active).
- R01 implements pure schema validators, state transition reducer, identifiers, referential scope checks, cancellation semantics, idempotency contracts and deterministic event fixtures.
- No imports of financial write functions in R01.
- Prohibited in R01: firestore.rules, financial services, src/lib/operations.ts, src/lib/documents.ts, src/lib/money.ts, active provider router, legacy AiConversationWorkspace.tsx, legacy build patch scripts, production settings, Vercel credentials.
- PR acceptance: versioned contracts tested, invalid states denied, no write gateway reachable, no legacy behavior change, types/build/target CI green and review outcome documented.

## E. R00 review blockers and unresolved choices

**BLOCKER-01 — missing blueprint:** named 2026-10-30 architecture blueprint not found in the inspected GitHub tree; obtain/compare it before claiming final architectural alignment.

**BLOCKER-02 — durable authoritative store permissions:** no currently inspected evidence of a ready isolated, transactional server-only AI-next data store. The existing broad Firestore owner-write rule is incompatible with assuming server-only approvals for new subcollections. Resolve physical choice and implement proof before allowing durable execution.

**BLOCKER-03 — cross-store mutation idempotency:** financial core and new AI task ledger cannot be assumed atomic. R04 must prove dedup/reconciliation through existing guarded hooks, otherwise keep financial mutations disabled in new gateway.

**DECISION-04 — privacy/retention:** owner has not approved provider expansion, document persistence/retention, cross-device data residency or live source transfer. Defaults remain synthetic/no new live data.

**DECISION-05 — deployment behavior:** feature flag disabled, never modify production, and do not merge or deploy until owner explicitly accepts the relevant phase.

Once these are reconciled, R00 can be marked reviewed/approved and R01 can begin independently on a new feature branch. This R00 document does not itself close the approval gate.

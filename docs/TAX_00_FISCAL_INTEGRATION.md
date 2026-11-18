# TAX-00 — Fiscal integration architecture and audit register

Baseline: main 8c1e84d8f484575dcab8410a0400cdf500dcafb2.
Scope: international invoicing remains the ordinary path; Saudi FATOORA is a separately enabled fiscal jurisdiction. This branch is a foundation, NOT production compliance, onboarding, or approval.

## Confirmed source findings
| Source | Current behavior | Required correction |
|---|---|---|
| src/types.ts, src/lib/workspaces.ts | Company and branch IDs, per-company numbering, locally scoped documents | Bind fiscal identity to trusted server-side tenant, legal establishment and EGS unit; never accept a client-claimed scope |
| src/app/App.tsx (665–680, 776–777, 903) | Local reserve/save/convert, approval and stock posting, revisions, voiding, output | Central trusted fiscal issuance; protect all paths, including AI, imports, restores and sync. Commit business effects once; prevent premature standard invoice delivery |
| src/lib/money.ts, src/lib/tax-vat.ts | BigInt decimal calculations, one document-wide tax rate, Output VAT only | Preserve legacy totals; version fiscal line/category calculation, discount allocation, rounding, currency and tax snapshots; reconcile sales and purchases |
| src/lib/document-lifecycle.ts | Commercial credit-note capacity and mutable revision lifecycle | Separate fiscal adjustment rules and original references; support full/partial paid-invoice credits, debit notes and refunds independently; never rewrite an issued fiscal document |
| src/cloud/plain-workspace.ts, firestore.rules (57–70) | Local-first workspace sync, UID-scoped rules and broad own-account reads/writes, protected period enrollment | Dedicated server-only fiscal ledger, commands, keys and artifacts; no raw credentials under any client-readable namespace; immutable records and transactional idempotency |
| src/lib/secure-share.ts, src/cloud/secure-share-owner.ts | Commercial sharing QR and public snapshot | Separate optional sharing QR from statutory TLV QR; do not label a portal link as a ZATCA verification code |
| src/components/SettingsModal.tsx, ReportsPage.tsx, TaxVatCenter.tsx | Existing settings and VAT report owners | Extend these locations rather than adding duplicate navigation, reporting or styles |
| scripts/verify-local.mjs, docs/LOCAL_VERIFICATION_NO_ACTIONS.md | Existing mandatory local release gate | Add focused fiscal regression and sandbox checks to the gate; no production writes or weaker checks |

The public site at https://invoice-three-puce.vercel.app/ responded to read-only retrieval earlier with a startup fallback message. Authentication-protected layout, deployed commit/rules and actual Firebase data have not been verified. Source findings must not be misrepresented as proven production exploits.

## Invariants and initial implementation
- src/lib/fiscal-routing.ts is the pure routing contract. Server resolves verified issuer and applicability, not the customer's country, currency, QR selection or a browser switch. Unresolved applicability or required invoice classification blocks fiscal issuance; quotes and ancillary documents do not themselves submit as fiscal invoices. A receipt or quote can still trigger a separate legal invoice obligation.
- Phase 1 generation and Phase 2 integration are distinct, with no invented approval. For Phase 2, standard documents follow clearance before delivery, simplified documents follow reporting; exceptions, retry and outage rules must be verified against current ZATCA instructions. Saudi exports and zero-rated transactions are not automatically out of scope. An international commercial document does not establish compliance in other jurisdictions.
- Route selection is not issuance authorization. The resolver is intentionally not wired into the existing app; no production behavior is changed. Verify owner/employee authorization, tenant membership, applicability, transaction classification, fiscal identity and enrollment before exposing an issue action.
- Separate compliance and production credentials by tenant and EGS unit, encrypt with managed keys, restrict access to server services, redact logs, rotate/revoke, and never include private keys/OTP/CSID secrets in browser storage or backups. No external API calls from client.
- Reserve UUID/ICV/previous invoice hash in a durable server-controlled sequence per EGS; persist signed XML, clearance/reporting response, timestamps, idempotency key, audit trail and authoritative totals. Distinguish transport ambiguity, accepted with warnings, rejected and confirmed outcomes. Reconcile crashes before retry; do not issue twice.
- Standard delivery is gated on actual clearance. Simplified issuance requires compliant signed XML/QR and a durable, deadline-aware reporting queue. Make operational statuses explicit; never show success merely because the client saved a document.
- Preserve commercial templates and original business outputs; generate compliant statutory Arabic fields and XML or PDF/A-3 with embedded XML as required, including credit/debit notes. Preserve historical documents exactly. Do not silently backfill or submit old commercial documents.
- Operational release: isolated synthetic tenant; mock/emulator race and failure tests; SDK validation; Sandbox then Simulation; credential onboarding in eligible production only after explicit owner authorization. No real taxpayer values, test invoices or secrets in repository.

## Staged execution
1. TAX-00/01: audit register, route foundation, regression baseline; inspect editor/output/restore/AI boundaries and eliminate only confirmed conflicting ownership.
2. TAX-02/03: verified tax profile, line tax model and exact arithmetic; versioned snapshots and backwards compatibility.
3. TAX-04/05: central issuance, document lifecycle and isolated server ledger; server enforcement, reconciliation, auth and race tests.
4. TAX-06/07: EGS onboarding, CSR, compliance CSID/checks, production CSID; XML, signature, QR, clearance/reporting and durable jobs.
5. TAX-08/09: purchase and VAT reports, existing Settings / Documents / Reports UI, localized states and document design; international regression.
6. TAX-10/11: mandatory local release verifier, real browser QA (Chromium/WebKit), SDK and sandbox/simulation evidence, owner-approved controlled production pilot. No merge or activation until each required gate is proven.

## Official requirements baseline
- https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx
- https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx?lang=en
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/Security-Requirements.aspx
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx

SDK validation does not establish live ZATCA acceptance. Recheck the current technical standards, data dictionary, security specifications and API contracts before building the adapter.

## TAX-04 increment — Phase-2 lifecycle contract

Added src/lib/fiscal-issuance.ts and executable tests. It models prepared, queued, submitting, uncertain, retryable, rejected, cleared and reported states, with version checks, per-attempt correlation, immutable invoice identifiers, artifact and snapshot digests, fixed reporting deadline and output selection. First previous-invoice hash follows BR-KSA-26; later hashes use canonical SHA-256 base64. This is a pure transition module, not a server endpoint or proof of actual clearance. The caller must persist the verified artifact, EGS chain, document binding, outbox and state atomically, authenticate the actor, verify authority responses and perform version CAS in storage. State checks alone cannot prevent concurrent requests. No live API calls, new UI, rules or production changes.

Uncertain transport does not automatically replay; future adapter must reconcile and govern safe retry of the same immutable UUID/hash using authority behavior. Rejected records stay retained. Corrective re-issuance with distinct identifiers, simplified rejection remediation, clearance-disabled contingency (303), late reporting audit, phase-1 issuance, durable queue and actual cryptographic/SDK validation remain explicit release blockers. Reference: ZATCA detailed technical guideline and XML implementation standard BR-KSA-26.

Verification at f87701afcc4167a2b8f20ad6b610b05e75f234e0: standalone strict TypeScript compilation with noUncheckedIndexedAccess, all 26 focused fiscal tests passed on Node 22.16; all seven tested source/test GitHub blob hashes matched local test copies. Full project Node 24 release verifier and browser/Firestore emulator checks remain unexecuted. Keep draft unmerged.

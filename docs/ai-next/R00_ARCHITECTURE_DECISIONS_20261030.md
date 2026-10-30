# LOUREX AI Next Generation — R00 Architecture Decisions and Component Assessment

- Work package: R00 (documentation/design only)
- Date: 2026-10-30
- Repository: allidamech-bot/INVOICE
- Inspected baseline: 7e8b0c34bb7db07d99b254bd96c500af5caa03d3
- Plan: Conversation Rebuild Plan v1.1 (owner-supplied 2026-10-30)
- Status: PROPOSED FOR REVIEW; not a production approval; no R01 authorization
- Source limitation: LOUREX_AI_NEXT_GEN_ARCHITECTURE_BLUEPRINT_2026-10-30.md was NOT found in the inspected baseline tree. Any divergent decisions in that blueprint must be reconciled before R00 can be formally accepted.

## Executive architecture

One authoritative server-side turn/task coordinator owns all new conversation turns. The browser is a presentation and local-draft client, not an alternative orchestration authority. The coordinator manages: authenticated subject -> scope -> immutable user event -> reference resolution -> source retrieval -> typed task state -> optional eligible inference -> validated read/preparation tool -> user review -> approval authority -> existing financial adapter -> observed result. Advisor and Controller share this infrastructure and differ only in capability policy.

An immutable evidence store holds complete source bytes, normalized extractions, source manifests and provenance. LLM prompts consume bounded excerpts/selected evidence; never confuse excerpt coverage with actual source coverage. The existing financial core remains authoritative and untouched. AI may only interact through narrow existing read and approval-guarded business interfaces.

The replacement runs behind a disabled-by-default, owner-authorized feature flag and separate routes. The legacy conversation remains available until successful R07 acceptance and explicit release approval.

### Logical dependency graph

Client -> AI-next API/authn -> task coordinator -> evidence/context -> capability router -> validated tools -> existing guarded financial adapters.

Append-only scope-bound event/task records and source artifacts sit alongside the coordinator. Approval and execution ledgers are separate from raw model output. No LLM may write directly to financial persistence.

## Architecture decision records

### ADR-001 — Single authoritative coordinator

**Decision (proposed):** one durable coordinator, server-side for cross-device correctness. Every turn has a unique tenant scope, thread ID, turn ID, generation/sequence and idempotency key. A thread admits at most one ACTIVE mutating coordinator lease or optimistic-concurrency owner at a time; independent read-only tasks may run only if proven non-conflicting.

**Why:** current implementation contains a client-side kernel, a large intelligence runtime and multiple API-level analysis/planning routes. R01 must not recreate competing owners. Browser navigation/unmount must not silently change the committed state of a task. Cancellation is persisted, not merely an AbortController.

**Trade-off:** requires durable server storage and real auth; do not introduce live cross-device persistence before security rules are verified.

### ADR-002 — Event-sourced task checkpoints with materialized views

**Decision (proposed):** append immutable turn/task events, CAS versioned state snapshots and idempotency receipts; snapshot is a cache of event truth. Every user-visible progress status maps to an observed event (not an animation). Long tasks checkpoint per file/page/chunk. At-least-once transport is assumed; downstream mutation deduplicated by a durable unique operation key.

**Safety:** uncertainty after a mutation starts leads to NEEDS_RECONCILIATION / blocked execution and read-after-write verification; never blind retry an ambiguous financial write.

### ADR-003 — Separate source truth from prompt context

**Decision (proposed):** uploaded source bytes and completeness manifests are retained intact according to privacy policy, independently of extracted indexes, summaries and LLM-sized context. All consequential extraction facts contain evidence references and verification state. Missing source page/row -> partial/needs_review/blocked, never completed. Every source selection is explicit and persisted.

**Why:** current client extraction and API endpoints impose bounded extracted-text/context limits; these protections prevent some silent truncation today but do not deliver whole-document processing.

### ADR-004 — Shared infrastructure, separate authorization profiles

**Decision (proposed):** Advisor = read-only tool allowlist. Controller = reads + unsaved proposals + explicitly approved operations through existing guards. Conversation mode is not identity or financial authorization; verified Firebase account identity, trusted role and server-checked scope determine access. Personal and temporary scopes cannot issue business writes.

**Boundary:** no changes to accounting, inventory, VAT, reports/PDF, existing approval rules or the financial ledger.

### ADR-005 — Typed contracts and fail-closed semantics

**Decision (proposed):** all ten core contracts use schemaVersion = 1, explicit nullability, discriminated states, strict unknown-field handling on external tool boundary, and canonical IDs. Unknown, ambiguous, contradicted, source-incomplete and model-generated values are not verified values. Schema migrations must be additive or versioned and tested.

**Reference:** companion R00_CONTRACTS_V1_20261030.md.

### ADR-006 — Model gateway with strict privacy/cost eligibility

**Decision (proposed):** fail closed before routing for missing credential, unknown price, unapproved private-data destination, incompatible modality, unavailable account, expired quota or no compatible output contract. Known eligible free-tier models can be attempted with bounded budget and health-aware fallback. Do not send private prompts to newly approved providers merely because model metadata exists. No automatic paid inference or provider setting changes.

**Caution:** the current provider-pool documentation explicitly distinguishes catalog discovery from verified account-specific free eligibility and production activation.

### ADR-007 — Approvals are transaction-specific capabilities

**Decision (proposed):** an approval receipt binds verified actor/role/scope, exact immutable proposal hash, document/draft revision, source manifest hash, financial baseline/expected version, operation ID, expiry, and policy version. Revocation or edit permanently invalidates that receipt. Approval is not represented by an LLM utterance. Server revalidates scope, current records and permissions before executing using only the existing authorized financial application API/guards.

**Constraint:** R04 must not invent a second direct writer that bypasses current signed review protections.

### ADR-008 — AI-next persistence is isolated from finance

**Decision (proposed):** logical namespaced collections for AI-next conversations, tasks, evidence metadata, file objects, durable idempotency and approval receipts, separate from financial workspace/vault/ledger objects. Access through a verified server boundary only; deny generic client writes to execution/approval records. Encryption at rest, bounded retention, account deletion, and no secrets in AI logs.

**Open integration blocker:** current Firestore rules include a broad authenticated owner-write family below users/{uid}/...; adding AI-next collections under that path would NOT automatically yield server-only permissions. Before persistence implementation, evaluate an isolated backend/database or new explicitly scoped AI-only security rules without changing existing finance behavior. No rule modifications authorized by R00.

### ADR-009 — New UI is a view of the durable state

**Decision (proposed):** build a new React view isolated from legacy compiled UI patches. Draft editor and preview should reuse *verified* canonical financial preview/approved adapter semantics rather than clone document issuance. Throttle status updates; keep composition input independent of large message-tree renders; provide resilient iPhone Safari file/keyboard interaction. Never show completed status for an unverified operation.

### ADR-010 — No automatic migration or activation

**Decision (proposed):** build under feature/ai-next-* branches and distinct API namespace; initial mode disabled. In shadow mode use synthetic or owner-approved data, read-only, with no duplicate financial effects and no unauthorized model prompts. Do not migrate historical pending approvals. Revoke all legacy execution authority during any eventual history import. PR/CI completion is not release acceptance.

## Baseline component assessment (evidence, not final deletion permission)

| Component / path (baseline) | Decision | Rationale / integration boundary |
| --- | --- | --- |
| src/lib/ai-conversation-kernel.ts | REBUILD coordinator; KEEP reference semantics | Client kernel scopes account/workspace/branch/thread, tracks revisions and cancelled approvals, but not a single durable server task authority |
| src/lib/ai-intelligence-runtime.ts | REDESIGN / REBUILD orchestration | Large client runtime, ownership/cancel guards and multiple planning flows; extract tested behavior, not whole control plane |
| src/components/AiConversationWorkspace.tsx | REBUILD new UI | ~135 KB component; legacy remains until release |
| src/styles/ai-conversation-workspace.css and scripts/ai-*.mjs | DO NOT PORT AS ARCHITECTURE | ~230 KB CSS and ordered build patches; validate built runtime separately before migration |
| src/lib/ai-conversation-attachments.ts | REBUILD ingestion, KEEP validated MIME/safety concepts | Ten files, 16 MB batch, 12 MB doc, 2.6 MB image/scanned source, source extraction limits; needs durable full-source manifest |
| src/lib/ai-tool-client.ts and src/lib/ai-tool-orchestrator.ts | REDESIGN interfaces; KEEP verified business adapters | Typed tool registry, scope filters and source truncation guard; must move planning/execution boundary to server authority |
| src/lib/ai-conversation-kernel.ts / src/lib/ai-mission-runner.ts | REDESIGN durable lifecycle | Current missions detect uncertain/applying states and block successors; durable reconciliation remains necessary |
| src/storage/assistant-store.ts | REDESIGN history storage; KEEP encrypted local cache concept | AES-GCM, one write queue, 30 threads / 60 messages local limits; not evidence of durable cross-device history |
| src/storage/assistant-memory-store.ts | REDESIGN provenance + durable memory | AES-GCM, scope, 160 records, approved/manual tags; not a full multi-device source-bound knowledge model |
| src/lib/ai-document-approval-guard.ts and src/lib/ai-foundation-approval.ts | KEEP validated guard invariants | Revision/role/scope checks remain protected; actual adapter contract to be verified in R04 |
| src/lib/ai-workspace-model.ts and src/lib/ai-document-conversation.ts | REDESIGN draft integration; KEEP verified business rules | Exact draft revisions, editor commands and limits; no separate financial writer |
| api/ai-core.js / api/ai-conversation-v3.js / api/ai-advisor-v2.js | RETAIN legacy, NEW ai-next endpoints | Existing routes remain live; no in-place replacement during development |
| api/_ai/router.js | REDESIGN routing interface; KEEP privacy safeguards | Verified free-first/privacy gating concepts, bounded fallback; new eligibility contract required |
| api/_ai/firebase-auth.js | KEEP verified identity-verification behavior; REVALIDATE integration | Signed Firebase token and trusted role checks; never authorize based on client-submitted account/role |
| firestore.rules | KEEP finance authorization unchanged | Owner-scope rules exist, but do not assume new storage inherits server-only security |
| Existing financial modules (operations, inventory, documents, money, treasury, VAT) | KEEP unchanged | Read-only or existing guarded financial adapters only |
| New ai-next evidence/indexer, task journal, coordinator, observability and acceptance fixtures | NEW | Do not reuse partial legacy caches as canonical truth |

### Verified baseline constraints and implications

1. Current source parsing: src/lib/ai-conversation-attachments.ts provides MAX_CONVERSATION_ATTACHMENTS=10; total batch=16,000,000 bytes; document=12,000,000 bytes; binary/scans=2,600,000 bytes; readable source=120,000 chars but many extraction/review paths accept only 12,000 chars (special product list up to 72,000). This must not be relabeled as whole-document completion.
2. Current API: api/ai-conversation-v3.js requires Firebase auth, accepts max 10 sources and rejects a source extracted text over 12,000 chars; api/ai-core.js limits Controller sources per source to 12,000 and aggregate 72,000. R02 must decouple source storage from prompt envelopes rather than simply raise these API limits.
3. Current draft cap: src/lib/ai-document-limits.ts has 120 working quote lines and 20 generic model-planned lines. R02/R04 should support paged full-source extraction and distinguish verified source count from the *approved financial editor's* true limit; never silently increase financial persistence limits.
4. Current history: src/storage/assistant-store.ts locally encrypts 30 threads / 60 messages, with a 520-char provider-memory bound. This does not meet a complete persistent cross-device task state contract by itself.
5. Current role/approval: src/lib/ai-foundation-approval.ts binds actor/scope/payload/baseline and rejects altered or stale proposals; client-only signatures/caches are not sufficient future server-side financial authority.
6. Baseline component file sizes were inspected via GitHub tree for the exact commit; no live-user behavior, auth acceptance or deployment state is asserted from that inspection.

## Design-gate checklist

- [x] Target owners, components and boundaries proposed.
- [x] Legacy-finance noninterference and coexistence strategy established.
- [x] Typed contract list, task/evidence, privacy and storage strategy assigned to companion docs.
- [ ] Reconcile named architecture blueprint (not found at inspected baseline).
- [ ] Verify feasible AI-only server-authoritative persistence and protection against current owner-write Firestore rule.
- [ ] Owner reviews/approves R00 decisions and new privacy/retention defaults before R01.
- [ ] Confirm current main before creating R01 feature branch.

## Evidence links (read-only inspected baseline)

- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/package.json
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/src/lib/ai-conversation-attachments.ts
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/src/lib/ai-conversation-kernel.ts
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/src/storage/assistant-store.ts
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/src/lib/ai-foundation-approval.ts
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d3/firestore.rules
- https://github.com/allidamech-bot/INVOICE/blob/7e8b0c34bb7db07d99b254bd96c500af5caa03d/docs/LOUREX_AI_PROVIDER_POOL_20261029.md

# LOUREX AI Next — R03 Conversation State, Memory, Context, Security Acceptance

Date: 2026-10-30
Repository: allidamech-bot/INVOICE
Branch: feature/ai-next-r03-conversation-state
Draft PR: #1192, stacked on Draft PR #1191 (R02), #1190 (R01). R00 Draft PR #1189 is still unapproved.
Reference main SHA when started: 7e8b0c34bb7db07d99b254bd96c500af5caa03d3

## Actual delivery scope

- conversation-state/event-store.ts: event sequence, SHA-256 integrity chain, CAS version checks, idempotent replays, immutable thread projection, task ownership, cancellation/uncertain-outcome boundaries, and concurrent write control. In-memory synthetic atomic backend only; its lock is local to one Node/JS process, so it cannot be advertised as durable or distributed transaction-safe.
- conversation-state/auth-boundary.ts: server-only identity / workspace membership dependency contract. Rejects anonymous/expired/unsupported roles and cross-owner UID sharing. It is **NOT** wired to production Firebase and trusts only the injected server-side verifier and membership resolver, not browser role claims.
- conversation-state/knowledge.ts: consent-required opt-in memory, scoped cross-thread recall, TTL enforcement, revocation tombstones, exportable minimal audit metadata. No automatic promotion, no AI-created user preferences, no real account data. The test backend is RAM-only; real encrypted deletion/cross-device guarantees require a verified physical backend.
- conversation-state/context.ts: bounded LLM prompt window with explicit excluded message IDs and source pointers, preserving the full authoritative event ledger independently. Never claims complete-file reading from a source pointer; incomplete source/scan status requires new evidence verification. Resuming uncertain execution is reconciliation-first, not automatic retry.
- tests/ai-next/r03-conversation-state.test.mjs: synthetic idempotency, parallel races, stale CAS, log corruption, wrong branch/role/company, fake task execution, 100-message history, untrusted memory, revoke/expiry, unknown sources, identity/membership denial, safe resume.
- .github/workflows/ai-next-r03-conversation.yml: isolated R01+R02+R03 typecheck/compiler/tests with no AI calls.

## Invariants proven only at unit test level

1. Exact-key retries do not create duplicate event records or repeat task transitions; changed payload under same key is rejected.
2. Different concurrent events competing for the same revision cannot both commit in the synthetic serialized in-memory store.
3. Thread snapshots replay the complete synthetic event journal. A bounded prompt may omit older items but must report exactly which item IDs were not selected.
4. Full owner/account/company/branch/actor/role/authorization epoch is included in event store scope; same actor can opt into cross-thread memory only in matching organization/branch.
5. Deliberate memory consent is mandatory; revocation clears the stored synthetic content and leaves a tombstone to prevent revival with the same memory ID.
6. Missing/partial sources, OCR review, unknown financial writes and old unapproved checkpoint records cannot authorize an AI tool execution.
7. Synthetic hash chain detects accidental/unsanctioned corruption when recomputed against the existing event hash; **not cryptographic proof against a privileged attacker** able to rewrite the whole chain.

## Blocking concerns before real usage

- No physical production storage or authoritatively sealed checkpoint. A new AI-next storage provider is not selected: R00 must decide free-tier cost, residency, encryption, retention, destruction, transaction isolation and data ownership.
- DO NOT write server-authoritative approval/operation records under permissive existing Firestore users/{uid}/... wildcard rules. Do not change any existing financial/period-control rules without separate scope.
- No real trusted server account membership service; current product's single-owner UID architecture does not automatically support multiple principals sharing one vault.
- Memory and conversation data in synthetic adapters are **not encrypted at rest or durable**. No user data was passed through these adapters during this implementation.
- Logs/events can include full conversation text; before any production use, require secure scoped encryption, role-based access, deletion/export mechanisms, PII-safe diagnostics, and owner's consent.
- No new provider authorization or business private-data destination. Prompt context is explicitly bounded and not evidence that any scanned or 35-page document was entirely analyzed.
- No financial writes. R04 must separately prove one-shot approval and a domain-level idempotency/verification mechanism across the AI ledger and financial system. Otherwise write functions remain disabled.
- No UI hooks, actual multi-device network tests or iPhone Safari acceptance yet. Tests are synthetic, not a claim of production-grade continuity.

## Next gate

Keep the PR as Draft. Verify final SHA CI and report exact result, compare new-file diff, and obtain R00 architecture/storage/privacy owner approval before any production-backed R03 integration. No merge, deployment, new paid requests, or changes to the financial track without explicit approval.

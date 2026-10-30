# R07J — Isolated indexed constant-read append prototype

Reference: 2026-10-31, base main `0e3b90c64627ca7dc6e2134b0e192834f31a8305`.

**Activation OFF.** New separate root `aiNextIndexedEventThreadsV1`; no R07A/G automatic migration, no production Firebase route, no finance, provider or live data change.

## Durable design

- Trusted nine-field server-verified scope maps to SHA-256-hashed thread ID. A compact head stores revision, hash, chronology and last task/turn summary.
- Each accepted event creates an immutable sequence document, event-ID uniqueness index and per-idempotency-key receipt, in ONE Firestore transaction with head CAS; message IDs, turns and task states have scoped unique indexes.
- New event sealing and shape validation reuse R03's canonical hash and event body checks. The transaction validates turn existence/sequence, task transition policy, message uniqueness, event ID and idempotency replay before atomic writes. Firestore may retry the database callback; no model invocation or domain side effect is inside it.
- Normal append retrieves a bounded count of head/index/turn/task documents, regardless of historical length. **It does not perform full R03 history projection on write.** The return value is explicitly a narrow receipt (`authoritativeFullSnapshot:false`).
- Separate `auditFullHistory` reconstructs every event and verifies each canonical hash plus R03 projection and head invariants. Missing/corrupt events fail closed; it is an expensive recovery/audit path.

## Limitations and release gates

This is a feasibility architecture, not a production-ready drop-in for the existing `ScopedConversationLedger` which returns full projections and uses an `AtomicEventBackend` callback. No end-to-end server coordinator is wired to this interface. Secondary index integrity after a privileged out-of-band write is **not** proven by each fast append. Server-only Firestore IAM/root deny rules, ACL provision, crash/backup/restore, projection/read model and complete ID receipt recovery checks are not accepted. Idempotent messages may cost multiple Firestore document writes; measure real-world cost against slow full replay before choosing it. `MAX_R03_EVENTS=20,000` remains.

No real customer data, no private provider calls, no financial execution, no activation, no production deploy. Final tests exercise >300 messages under a strict mock read count plus real official Firestore Emulator CAS across distinct Admin clients. Real cloud latency, production IAM/cost, iPhone Safari and T22–T24 remain OPEN.

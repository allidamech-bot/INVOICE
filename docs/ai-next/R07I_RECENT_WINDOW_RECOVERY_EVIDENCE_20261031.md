# R07I — Bounded recent history and emulator restart recovery

Date: October 31, 2026. Starting main: `3549a8e7359582dcb783ea34f3435cbe016e1030`.

**Scope:** inactive server-only R07G experimental backend in `aiNextEventShardsV1`. No UI integration, production route, provider, finance, live database or rule change.

## Performance improvement

`readRecentWindow(canonicalServerAuthorizedScopeKey, requestedEvents)` caps requests at **128 events** and reads only shards overlapping the recent interval plus the head before/after. Each selected shard still checks content SHA-256, per-event scope/sequence/previous-hash chain and the head descriptor. Returned `completeHistory=false` explicitly signals that earlier shards were **not** read or checked; `authoritativeForMutation=false` is always returned.

The recent window is presentation-only and MUST NOT authorize an approval, task transition, mutation, idempotency replay, source audit or recover old operations. For those, use the R03 complete hash-verified authoritative event snapshot. The current R03 full replay still incurs O(history) time and Firestore reads on each append; this phase **does not solve the append bottleneck**. Existing bounded sharded write semantics and transaction CAS remain unchanged.

No long history was truncated. Tests assert fewer mock document reads for 221 events, strict limits, incomplete-history flags, corrupt recent-shard rejection and failing full reconstruction when an older shard is missing.

## Recovery evidence

Official Firestore Emulator is run twice as **separate processes** in CI: first seeds 105 synthetic events and exports emulator state, then stops fully. The next invocation imports that saved state and verifies all events, idempotent replay, an additional append, and complete order/hash. The local `demo-ai-next-r07h` and localhost host checks block accidental live Firebase access. This is emulator export/import evidence, **not production encrypted backup, Cloud Firestore disaster recovery, actual two-device testing or owner approval to retain customer data**.

Still open: R03 full replay CPU cost, production IAM/rules and root ACL provisioning, encryption/retention/deletion policy, real Cloud cost and latency, multi-process/service failover, true interrupted-transaction verification, live UI integration, physical iPhone Safari acceptance, T22/T24 and all financial execution.

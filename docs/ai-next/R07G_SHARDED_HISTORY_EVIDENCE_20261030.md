# LOUREX AI NEXT — R07G Sharded Event Backend

Date: October 30, 2026.
Starting main: 11430c622f15262735ddde8e11783acd7d9a035a.
Production activation: **OFF**. Financial track: unchanged.

## Engineering objective

R07A's single Firestore thread document has a hard limit of 300 events / 700 KB. R07G implements a **different, isolated root collection**, `aiNextEventShardsV1`, with per-thread head metadata and ordered chunk documents. It does **not** migrate or overwrite any R07A data. The existing R03 domain ledger and event contracts remain unchanged.

## Design and safety

- Stable, SHA-256-hashed complete nine-field authenticated scope maps to one head and deterministic shard names. Only a verified server-authorized identity may supply this full scope. No public browser endpoint or client Firestore access exists.
- A head lists ordered contiguous shard descriptors, their sequence ranges, previous/last event hashes and chunk checksums. Each chunk has a strict 96-event / 650 KB maximum. Head has a 250 KB bound; at most 1,024 chunks; the existing R03 domain still caps history at 20,000 events. **This is bounded sharding, not unlimited history.**
- Full read reconstructs every event from all shards in order, checks chunk digest, event sequence/hash continuity and the head before/after reading. A concurrent write yields a safe retry/conflict rather than silently dropping or reordering messages.
- Append invokes R03 domain action only once *outside* the Firestore retryable transaction, requires exactly one append and unchanged prefix, then commits the head and either the mutable tail or new chunk **atomically**. Historical chunks never change during ordinary appends. Conflicting head/tail revisions fail closed.
- A replay that does not append returns the original result without document writes after a transaction read of current authoritative head/tail.
- The hash chain detects corruption and lost history, but SHA-256 is **not** an HMAC protecting against an administrator with privileged database-write access.

## Acceptance evidence boundary

Tests run R03's actual event journaling for over 300 events and use independently instantiated adapters against a shared **synthetic Firestore transaction mock**. They cover replay, full history after shard rollover, concurrent writers, cross-company/scope isolation, missing or damaged historical chunks, head tampering, stored byte caps and illegal rewrites.

Important: these tests do **not** prove real Firestore cross-process consistency, live quotas, costs, long-history latency or recovery after a genuine server restart. R03 currently performs full history hash/projection verification on each append, so CPU cost and repeated shard reads increase with conversation length. The 20,000-event domain limit and 1,024-shard/head limits remain. A later indexed/snapshot projection migration requires separate design and compatibility checks; never claim full long-term scale or silently truncate history.

No live Firebase rules changes, ACL provisioning, paid providers, source uploads, production routes, settings changes, financial operations or deployment. T22/T24 remain BLOCKED until trusted storage/IAM, retention/restore and actual real-device tests.

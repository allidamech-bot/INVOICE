# R07A — Bounded Firestore Event-CAS Feasibility (NOT production accepted)

Date: 2026-10-30

## Evidence scope

New `R07ExperimentalFirestoreEventBackend` implements the existing R03 `AtomicEventBackend` against an injected, privileged, Firestore-compatible interface. It hashes the complete nine-field scope into an opaque top-level document ID. It rejects malformed scope keys, cross-company/branch/owner/role/authorization-epoch records, invalid revisions, same-revision content changes, stale baseline commits, and destructive non-append updates.

The R03 domain action is computed **once outside** Firestore SDK's retryable transaction callback; the transaction compares the authoritative full prior record before writing and fails closed if another instance won the race. Replay of a verified already-committed idempotency key returns without another write. Thread document sizes and event counts have strict caps.

## Known unclosed security and storage gates

- This is **not a production-ready durable store**. Tests use a shared in-process Firestore simulator with transactional serialization, not real Firebase servers, serverless cold starts or two actual remote devices.
- One thread document is capped at 700,000 UTF-8 JSON bytes and 300 events. It must be replaced by a proven sharded event schema, indexing, retention and pagination for real multi-hundred-turn threads; do not silently truncate.
- A root `aiNextEventThreadsV1` collection is separate from the client-writable `users/{uid}/...` namespace, and the checked-in Firestore rules have a default-deny catchall for root collections. **Deployed rules still need independent verification**. Server-side Admin SDK bypasses rules: trusted backend IAM and key management are mandatory.
- The R03 hash chain detects accidental alteration, not privileged tampering. Production needs authenticated integrity/backup controls, deletion/retention implementation, source bytes and evidence storage, memory revocation durability, quota/abuse control and cost estimates.
- The existing Firebase token verifier returns a verified UID/role, but there is **no authoritative validated company/branch membership reader** connected to the R03 `TrustedIdentityProvider`. Do not trust browser selections. No AI-next production HTTP endpoint has been registered.
- Absolutely no finance write, approval consumption or model/provider invocation is connected. R04 live writes remain false.
- No production rules, credentials, Vercel config, finance files or environment variables were modified.
- Authorization of any actual Firestore usage, paid quota, privacy/data retention and production rollout is separate. The adapter remains unimported by production routes.

## Acceptance

Offline R07A test: isolated Firestore emulator-compatible fake to prove optimistic CAS, cross-instance collision, hash tampering rejection, idempotency replay, invalid scope, document bounds. TypeScript and Vercel Node isolation must pass on final SHA. **Do not mark T22 PASS** until actual approved durable backend cross-session/device tests pass.

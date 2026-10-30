# LOUREX AI NEXT — R07D Scoped Firestore Draft CAS Evidence

Date: October 30, 2026. Initial main: 846934457154fdfb7e4948eff6fbbe2443b8d095.

## Implemented — isolated code only

`src/ai-next/storage/firestore-review-drafts.ts` implements R07B2 `TrustedDraftRepository` with an injected, privileged Firestore-compatible transaction client. It stores **review-only, unsaved quote draft objects** under an isolated top-level `aiNextReviewDraftsV1` collection, keyed by SHA-256 of the complete nine-field authenticated scope plus turn ID. It neither writes nor reads financial vault documents.

- Atomic create-if-absent and byte-bounded document guards (350,000 bytes), full stored content hash plus R04 immutable financial revision hash, exact draft scope/turn identity, allowed status `needs_review`, no approval receipts.
- Exact retries return the original sealed revision without overwriting it. Different revisions or payloads cannot silently reuse the same turn.
- An additional explicit compare-and-swap path saves **only R04 unsaved review editor revisions**. It requires matching expected revision and R04 revision hash, exact unchanging source manifest, monotonic timestamp, stable creation time, continuous edit-event history and a fresh revision. Any attempt to claim `saved`, `approved_for_execution` or financial issuance is blocked.
- No new HTTP route, Firebase Admin initialization, secrets, finance imports, client Firestore access, provider calls or production deployment.
- Synthetic tests simulate independently constructed adapters sharing one transactional mock database and a single R03 ledger with R07B2 local coordinator; they test replay, revision collision, cross-company isolation, tampering, corruption, concurrency and recovery.

## Production blockers — do not activate

1. **No live Firestore Admin backend, ACL records, deployment proof, credentials or server-only IAM verification.** Current Firebase deployed rules must be verified against client read/write and storage quotas before any use.
2. Firestore database rules and data residency/retention/backups, PII access, encryption-key management, restore and cleanup policy remain unapproved. SHA-256 is corruption detection, **not a MAC/security seal against a privileged DB attacker**.
3. R07A's proof-of-concept event store still has 300-event and 700 KB caps; no long-history sharding, real cross-device concurrency or restart test. These mocked tests are not durable persistence evidence.
4. R04 review and any later financial mutation require separate approvals; this adapter must never be reused as an invoice/purchase/treasury writer.
5. Source objects, consented memory, current ACL revision changes, real documents, UI hookup and physical iPhone Safari acceptance remain unverified.

Tests alone justify merging this **inactive code** only. Do not change production flags or declare R07 complete.

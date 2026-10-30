# LOUREX AI NEXT — R07F Consented Memory CAS

Reference date: 2026-10-30.
Starting main: 4ec65003ecad5bb75d17ef3cfe18b20baba4dcac.
Production activation: OFF.

## What exists

An inactive, server-only Firestore Admin-compatible backend for the existing R03 `ScopedKnowledgeService`. Memory can only be promoted by the existing explicit-consent API, never inferred from a model's answer. The backend uses a top-level server-owned `aiNextConsentedMemoryV1` collection and a SHA-256 document key derived from the eight-field knowledge authority (UID, account, company, branch, actor, role, scope type, authorization epoch). Thread ID is intentionally omitted, so explicitly approved memory can be retrieved across threads of the same exact scope.

Writes use a full-content baseline check in a Firestore transaction. The domain callback executes **once outside the retryable SDK callback**. New records must carry the R03 consent identity, source reference, owner, expiry and source actor. The store forbids rewriting already approved content, deleting/reordering records, changing approval metadata, or resurrecting a revoked tombstone. Revocation nulls stored content and preserves metadata for audit.

All reads validate the declared scope and stored SHA-256 content digest; retention and runtime expiry filtering are performed by the R03 service. A 200-record and 850 KB per-scope document bound limits Firestore document size. Real database quota/storage costs are not approved, and the one-document design is not intended to scale without a further migration.

## Explicit security limits

- No Firebase Admin initialization, credentials, live memory records or production routes. Existing Firestore rules under /users remain unchanged. Root deployed client-deny and IAM are **not verified**.
- This is not a backed-up, encrypted, fully deleted or GDPR-style erasure accepted service. Tombstoned consent metadata persists; retention/purge policy needs legal review, secure deletion and restore tests.
- SHA-256 checks are accidental-change detection, not an HMAC against an administrator or privileged attacker who can rewrite data and hash.
- Memory must not be automatically learned from entire conversations or private attachment contents; consent is a deliberate authenticated user action. No provider receives memory unless future explicit privacy and source policy approves it.
- These tests use a synthetic concurrent Firestore mock, not a real restart, two-device session or production retention validation.

Result: isolated, tested **code only**. T22/T24 and memory privacy/durability acceptance remain BLOCKED.

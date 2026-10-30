# LOUREX AI Next — R07B Authentication & Membership Boundary

Date: 2026-10-30
Starting main SHA: 3f8bd285ed71e9e891e5e015f6c02fc1067f9f92
Stage: R07B1 (isolated, server-only foundation)

## Implemented

- `api/_ai-next/firebase-principal.js`: delegates actual signature, issuer, audience, lifetime and role verification to the **existing** `verifyFirebaseIdToken`. Reads the same token's signed timestamps only after successful verification; rejects expired or mismatched tokens, invalid claims, and anonymous sessions. Never logs tokens.
- `src/ai-next/security/server-membership.ts`: validates a strict request envelope containing lookup identifiers only, rejects injected client role, owner, approvals and ACL fields; authorizes via the R03 `authorizeConversationRequest` and mandatory independently verified server-side membership lookup. Single-UID account policy is preserved; wrong or revoked company/branch access fails closed.
- Synthetic test cases cover wrong user, wrong account/company/branch, role spoofing, revocation, expired token, unavailable membership service and repeated authorization.
- No payment, storage, financial or provider calls; the new API remains disabled.

## Security boundary and explicit blockers

The test seam for token verification uses **synthetic stub verification** only. It does not prove a live Firebase token or production membership database works. In production the principal MUST call the default real signature verifier, and membership MUST be resolved from an authoritative, server-only ACL. **No implemented live ACL backend is connected yet.**

Existing Firestore `/users/{uid}/{collectionId}/...` is owner-client-writable; do not store server-only memberships, AI approvals, financial operations or idempotency authority under that broad path. An approved protected namespace and server credentials/IAM are still prerequisites.

No `/api/ai-next` route is registered, and the old assistant remains unchanged. R07B1 merge does not prove R07 authentication or storage acceptance. T22, cross-device persistence, and real multi-UID membership remain BLOCKED. Do not change finance track, production flags or hosting configuration to force green tests.

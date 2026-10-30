# LOUREX AI NEXT — R07B3 Trusted Company/Branch ACL Source

Date: October 30, 2026. Production release status: BLOCKED.

## Source finding

The current financial client owns `vault.workspaces` and `vault.branches`. Those entities can be changed by the signed-in owner's client, and the checked-in Firestore `/users/{uid}/{collectionId}/...` rule is broadly owner-writable. They are **not** independently trustworthy server-maintained AI approval or financial execution authorization data.

Existing `api/_ai/firebase-auth.js` can verify Firebase identity/role. The new R07B1 contract additionally requires independently server-owned account/company/branch authorization. A valid token alone never proves a requested company or branch.

## R07B3 implementation

Read-only Firestore Admin-compatible dependency `R07B3AdminMembershipStore` uses top-level `aiNextAuthMembershipsV1/{verifiedUid}` only. It never reads `/users/{uid}`, encrypted vault metadata, client-selected operator settings or model suggestions. Exact-match account, company, branch, active member state, signed principal role and authorization epoch are required. Malformed, duplicate or missing records are rejected. Credentials, token values, business records and model prompts are not logged.

The repository's checked-in `firestore.rules` includes a final catch-all deny, so this new collection has no **declared** client grant. This does NOT prove the currently deployed Firebase rules match; verify actual deployed rules and an attempted client read/write before using this authority. Firebase Admin bypasses client security rules, so backend IAM, secret storage, project ownership and authorized provisioning are separate controls.

## Critical activation blockers

1. No root membership documents have been created or verified in production. This PR has no provisioning or write pathway.
2. Real Firebase Admin SDK database setup (credential source, privileged service identity, deployment Node runtime) is not connected to the inactive AI-next API.
3. Live Firestore rules and root collection client-deny have not been observed, and privacy/data-residency/retention and free-tier operation costs have not been approved.
4. The current financial track remains unchanged. This code cannot grant new financial rights without a separate finance authorization review.
5. No source bytes, drafts, long threads, memory and operation-ledger real DB integration; no iPhone or cross-device proof, no production deployment.
6. No authenticated user token or customer file has been used. Tests are synthetic.

Result: this closes the **code interface** for sourcing company ACL without the unsafe user-subcollection shortcut. It does not close R07 trusted storage acceptance, T22, or T24.

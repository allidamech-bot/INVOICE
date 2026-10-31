# R07O — Unified R07M Unsaved Review-Edit over Local HTTP (Candidate)

Date: 2026-10-31
Scope: LOUREX AI Next Generation only
PR: #1244 (candidate; CI/merge acceptance pending)
Release/production: NOT AUTHORIZED. No live endpoint.

## Implemented boundary

The EXISTING unmounted R07O local-only preview handler now accepts the
`review_edit` operation, routing it directly to the EXISTING R07M
`acceptOfflineUnifiedReviewEdit` method. This does not create another
coordinator, event ledger, draft editor, database or public route.

The new verb is separately server-gated by the
`allowOfflineUnifiedReviewEdit:true` CONSTRUCTION option. A JSON request
cannot activate it. R07O retains strict local demo Firestore emulator,
loopback Origin and Fetch-Metadata, POST-only JSON, Bearer identity, no cookie,
limited size, no CORS and no-store responses. R07M and R07R each enforce
trusted identity and membership before sensitive edit/replay boundaries.

The existing R07O port offers an explicit user-triggered `reviewEdit`
method taking the full immutable request key, draft origin turn, revision and
hash. It performs no automatic retry. On ambiguous transport failure the
same caller-owned request may be retried with identical identity and
arguments, after R07D receipt-first reconciliation.

## What the local integration verifies

Tests use the official local Firestore Emulator with a synthetic ACL and
injected identity test signer. A synthetic R07P model fixture and
server-verified synthetic customer resolver prepare an UNSAVED quotation edit.

Focused scenarios:
- Server-switch denied even with a valid Bearer and valid review body.
- Real 127.0.0.1 HTTP round trip: one R07M unified task, one R07D receipt,
  one R07M receipt checkpoint and one final evidence-backed assistant reply.
- Same-key HTTP replay yields original applied revision without another
  synthetic interpretation or duplicate draft mutation.
- Simulated lost HTTP response ACK, then exact-key recovery.
- Changed request payload and foreign branch deny further mutation.
- Membership revocation denies even an already committed request replay.
- Existing R07O greeting, preview and transport security regression remains.
- TypeScript and production isolation verifier required in SHA-bound CI.

## Limitations

These are NOT live Firebase signature, deployed Firestore rules/IAM,
two-device commercial sessions, iPhone Safari, real-language NLU performance,
provider privacy/zero-cost eligibility or production rollout.

`R07O_PUBLIC_ENDPOINT_ENABLED=false` and
`R07O_UNIFIED_REVIEW_PUBLICLY_ENABLED=false` remain unchanged.
No `api/` route, Vercel, finance module, financial mutation, Firebase
permissions, production credentials or feature flags are changed.

T22/T23/T24 and physical iPhone Safari remain OPEN. Do not mark TESTED
until *exact PR head* GitHub CI succeeds and do not mark MERGED until
GitHub reports the PR merged and `main` is reverified.

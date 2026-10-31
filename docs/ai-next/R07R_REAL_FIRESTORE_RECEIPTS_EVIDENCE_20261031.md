# R07R — Official Firestore Emulator Atomic Receipt Evidence

Reference: October 31, 2026. The production app and real Firebase backend remain untouched.

## Tested objective

Verify the merged PR #1235's unsaved AI review edit request receipt and draft revision within **real local Firestore Emulator transactions**, using two independent Firebase Admin SDK clients with one explicit demo-only project. Unlike earlier transaction mocks, this exercises official Firestore SDK reads, Firestore transaction retries and durable shared document visibility.

Five scenarios:

1. Scope-bound draft edit + receipt are both committed and visible from independent Admin clients after simulated lost acknowledgement. No financial document is issued.
2. Concurrent same-key edits commit only one revision and one immutable receipt, with one replayed success.
3. Concurrent different-key edits from one base revision reject the stale loser without lost update.
4. Receipt for an earlier revision remains consistent with the latest draft, while changed payload fingerprint for the same key is rejected.
5. A foreign company cannot read another company's receipt, and tampering with the stored applied hash fails closed.

## Explicit limitations

The test uses synthetic quotation fields and a local Firestore Emulator, not a provisioned QA Firebase project. Firebase Admin SDK bypasses Firestore client security rules; this does NOT prove deployed rules, service-account IAM, retention, encryption, real cross-device sessions, real provider-model reasoning or an iPhone Safari experience. T22/T23/T24 remain OPEN.

No production flags, finance files, Firebase IAM, live credentials, model calls, customer data, Vercel configuration, financial invoice/posting or accounting writes were changed. Final GitHub PR-head actions and exact test counts are the evidence; do not claim success before their completion.

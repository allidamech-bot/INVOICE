# R07M — Receipt-Verified Unsaved Review Edit Chat Reply (Disabled)

Date: October 31, 2026. The only new code lives in the existing isolated R07MFastLocalCoordinator; no alternate Controller and no production mount.

## Concrete safety improvement

R07M previously responded to a synthetic semantic turn with a correct **planning-only** assistant message saying no edit had been applied. A later R07R/R07D review edit may legitimately commit, and #1237/#1238 can recover the R07M checkpoint after lost acknowledgement. However there was no distinct, verified user-visible confirmation.

The new explicitly OFF-BY-DEFAULT server-only `publishOfflineVerifiedReviewReply` method:
1. Rechecks the authentic principal, active membership and R07M turn/task.
2. Reads the exact R07D unsaved review edit receipt and idempotently establishes the #1237 R07M checkpoint.
3. Requires a fully sealed R07J history containing the matching completed task and receipt checkpoint.
4. Appends a *second*, immutable assistant message with a deterministic ID, safely stating only that review draft revision N was applied. It warns that later revisions may exist and explicitly denies issuance/financial save. No inferred line quantity, approval or posting is ever claimed.
5. Re-audits the stored history before returning a verified reply.
6. Recovers if the receipt/checkpoint was committed but the response was lost; a second Firebase Admin client can retry without re-editing a draft, running a model or duplicating the message.
7. Refuses to insert a previously missing reply for an old turn after a newer turn has been accepted. Existing confirmations can still be idempotently replayed.

The original semantic planning-only reply and its `semanticOutcome:'proposal_only'` contract remain unchanged. After a later confirmation supersedes the materialized last assistant message, the proposal-only API resolves its **own** original message from audited history instead of claiming that it executed the review edit.

## Limitations and release boundary

This is an **additive audit-backed chat acknowledgement**, NOT yet the single integrated Controller task lifecycle. The provisional planning response remains visible in the audit log; a future design must model one unified review-edit task and normalized user-visible state, avoiding the two-message UX. The two Firestore roots are not in one transaction, and neither official emulator coverage nor Admin SDK testing proves production IAM/Firestore rules. User-facing reply confirmation is not linked to actual financial document issuance and cannot approve/save/post. Existing T22/T23/T24, real model, production permission, physical iPhone Safari and security gates remain OPEN.

## Required CI

- Synthetic tests: no receipt => no claimed success; original planning-only API remains accurate; audit then confirmation; separate-instance crash restart; concurrent same-request dedup; later revision safety; out-of-order refusal; revoked memberships and corrupted receipts.
- Official local Firestore Emulator: independent Firebase Admin SDK clients publish/recover a second assistant message; two concurrent clients yield exactly one.
- Strict TypeScript; existing R07M/R07R regression; finance and deployment isolation.

All feature flags remain false by default; production, financial track, live Firebase and paid inference untouched.

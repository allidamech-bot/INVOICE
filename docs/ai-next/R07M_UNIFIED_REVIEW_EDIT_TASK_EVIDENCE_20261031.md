# R07M Unified Unsaved Review-Edit Task — Candidate Evidence

Date: 2026-10-31
PR: #1240
Scope: LOUREX AI Next Generation only
Activation: OFF (explicit server-only offline fixture dependency injection)
Production release: NOT authorized

## Actual engineering change

A new method `R07MFastLocalCoordinator.acceptOfflineUnifiedReviewEdit()`
uses the existing R07M request index, immutable R07J journal, R07R
guarded preparation, and R07D transaction-backed review receipt.

A new task type `unsaved_review_edit` is created only for requests entering
this explicitly disabled offline entry. Existing `semantic_proposal_only`
tasks, including historical turns from PRs #1232–#1239, are unchanged.
There is one user message and at most one final assistant message for each
successful new unified task; the interim planning-only message is not
published as though it were the result of the edit.

Request identity is journaled first. Before calling R07R, the coordinator
seals an immutable request-binding checkpoint containing the fingerprint of
the request envelope, origin draft turn, expected revision and expected hash.
A changed payload under the same request key cannot repurpose an accepted task.

The bridge uses the existing R07D atomic edit receipt. The coordinator reads
and verifies that receipt before appending its R07J receipt checkpoint, and
checks it again before publishing the final assistant message. The task is
only marked completed after that message is journaled. Lost acknowledgements
are reconciled from saved receipt and audited journal evidence. Replays use
the original applied draft revision and hash, not a newer draft's revision.

Ambiguous or unresolved offline synthetic plans have a conservative
clarification response; the text does not claim an unobserved financial
or draft mutation. Security denial/corrupt evidence fails closed.

## Interruption boundaries

1. Before turn acceptance: no mutation.
2. After turn acceptance/user message: same sealed request key resumes.
3. After request-binding checkpoint: changed payload rejected.
4. After R07D atomic commit but before R07M checkpoint: receipt-first
   recovery; do not re-run successful edit.
5. After R07M checkpoint but before final message: verify receipt and
   append one reply.
6. After final assistant message but before terminal task event: verify
   persisted evidence and complete the original task.
7. After terminal completion: audited historical replay, without inference.

R07D and R07M remain two independent transaction roots; this design does
NOT claim one atomic distributed transaction. Concurrent conflicting
interpretations or unresolved states are NOT equivalent to proven
exactly-once semantic inference. Production authorization, deployed
Firestore rules/IAM and private inference remain separate gates.

## Focused test coverage

Synthetic: single-turn success, exact-key and payload collisions, restart
after R07D commit, restart after R07M checkpoint and reply, concurrent same
key, role revocation, foreign branch, old proposal-type isolation, stale
draft revision, and no-edit clarification.

Official local Firestore Emulator: independently constructed Admin SDK clients
perform unified replay and recover after a deliberately lost R07D
acknowledgement. This is emulator-only; not cloud security or two physical
devices.

The exact final PR head SHA and final GitHub CI checks, not this document,
are authoritative for TESTED status. Until they pass, this is IMPLEMENTED
on an isolated feature branch only.

## Unclosed gates

- No active production route, no live model invocation, no paid provider.
- Real multilingual model understanding and contradictory concurrent
  interpretation policy require further work.
- Bounded synthetic semantics are not real NLU quality evidence.
- No live IAM, deployment rules, actual Firebase-account security, actual
  encrypted multi-device session, physical iPhone Safari, or production QA.
- No document issuance, approval or financial posting.
- T22, T23 and T24 remain OPEN.
- No production activation or deployment.

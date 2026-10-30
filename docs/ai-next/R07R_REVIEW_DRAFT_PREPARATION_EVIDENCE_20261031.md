# R07R — Authenticated Unsaved Draft Preparation Bridge (isolated)

Date: October 31, 2026. AI-only package. No production activation, financial database changes or provider calls.

## Real code added

- R07RReviewDraftPreparationBridge reuses R07B authenticated scope and membership, R07P typed intent planning, R04 canonical draft editor and R07D trusted Firestore-compatible transactional compare-and-swap. There is **no second coordinator** and no direct financial writer.
- Supports exactly one scoped unsaved quotation review edit per validated proposal: existing line quantity/unit/unit selling price patch; independently server-resolved customer selection; complete new manually described line; line removal; empty-draft currency choice. Missing item, currency, price, target line or customer resolution rejects before any write.
- Reads a draft by its strictly checked server-scoped R07D draft identity, requires exact expected revision **and** SHA-256 content hash, calls the R04 editor, then compares and swaps through R07D. Concurrent edits and repeated stale requests cannot silently double-apply. A network-ambiguous reply demands re-read, not blind automatic replay.
- R04 gains SyntheticDraftEditor.resume for hash-checked later unsaved revisions. It intentionally does not invent earlier undo snapshots; true durable undo/redo remains open.
- R07P new-line semantic reference handling no longer mistakes appending a line for editing a previous line. All model-derived field contents remain **uncertain and review-required**. Customer IDs are returned only by an independently scoped trusted resolver.

## Evidence

- Dedicated synthetic integration tests use a transactional Firestore mock for R07D: follow-up quantity correction, multi-field line patch, customer lookup, append/remove, currency integrity, revocation, branch isolation, candidate scope forgery, ambiguous line targets, parallel CAS and stale replay.
- SHA-bound GitHub Actions typechecks isolated sources, runs R07R tests and R04/R07D/R07P/R07M regressions, and checks production bundle isolation.
- This tests no real language-model quality, actual Firebase IAM/rules, multi-device QA, real inventory/accounting, live inference, physical iPhone or deployed API.

## Remaining significant blockers

R07R is not connected to the R07M durable turn/task journal: **it cannot yet be called as an approved live conversation action**, and must not be mounted to R07O or production. The currently injected semantic planner is synthetic-only; a real cost/privacy-authorized semantic model integration and a trusted context reader remain open. There is no persisted per-edit semantic request receipt or full durable undo/redo. No financial issuance, approval, customer master mutation, or cross-device recovery acceptance exists in this package.

T22/T23/T24, live cloud security/QA, source/attachment evidence, full multi-step orchestration, and physical iPhone acceptance remain OPEN. Neither passing mocked storage tests nor merging this work authorizes a production activation.

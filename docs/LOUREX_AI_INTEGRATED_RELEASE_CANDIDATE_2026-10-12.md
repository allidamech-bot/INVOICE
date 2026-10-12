# LOUREX AI — Seven-batch integrated release candidate

**Date:** 2026-10-12  
**Branch:** `integration/ai-batches-1-7-release-candidate-20261012`  
**Production:** https://invoice-three-puce.vercel.app  
**Status:** DRAFT / NO-GO.

## Contents

This integration branch is based on the latest Batch 7 cloud-history head, which already includes the stacked feature lineage:
`main → #711 (history visibility) → #713 (mobile data density) → #714 (commercial answer completeness) → #715 (import review QA) → #716 (cloud history)`.

The independent draft fixes are included by copying their exact source and test files from:
- PR #709: iOS/voice ownership, native release/watchdog, tests, and QA notes (8 files).
- PR #710: Advisor/Controller separation, API mode sanitization, tests, and QA notes (8 files).

Before these copies, common source files were checked to be unchanged from the `main` base commit `c4254d5`. No upstream feature work in the stacked branch had modified those exact shared files, so the final integration includes both independent fixes without deliberately overwriting any Batch 3–7 changes.

## Code coverage prepared

- Voice ownership and two entry points share native Safari microphone release synchronization, independent from simulated browser tests.
- Advisor remains read/analyze and receives substantive business discussion even when phrasing an imperative; Controller is separately approval-gated.
- Conversation history UI shows saved threads, scoped account/workspace/branch; optional text-only cloud transfer under each Firebase UID.
- Structured mobile supplier/product views and import-review tables keep provenance, confidence, full changes and preexisting financial mutation approval guards.
- Tool answers make missing or truncated commercial source records explicit rather than fabricating zeros or silently hiding rows.
- Text-history cloud sync is authenticated, transactional, merges stable message IDs, retries on browser reconnect and tracks deletion tombstones. It never uploads executable drafts or approval receipts.

## QA completed vs not completed

**Performed:** Source-file parity review for all voice/mode ports, isolated earlier batch contract checks (Batch 3–6 16/16; Batch 7 21/21), JavaScript build-postprocessor syntax checks and isolated behavioral voice/formatter simulations. A nine-case integration contract test was added at `tests/ai-batches-1-7-integration-contract.test.mjs`.

**Not yet run:** This integration branch has **not** passed a clean TypeScript typecheck, production build, complete Node test suite, Playwright, Firebase emulator or authenticated Cloud Browser QA. Physical iPhone/iPad Safari microphone testing has not been demonstrated. Previously the local GitHub checkout failed DNS resolution and Vercel integration returned 403. No CI status is an inferred pass.

## Release blocker matrix

| Priority | Required proof |
|---|---|
| P0 | Clean checkout `npm ci`, `npm run typecheck`, `npm run build`, full Node test suite (including 9-case integrated contract and 9-case cloud history test). |
| P0 | Firestore emulator: distinct UID accounts cannot access one another; same UID with two independent devices merges edits; account switch during network work blocks stale results. |
| P0 | Advisor cannot prepare/approve/navigate/change data even if old thread or model output contains a tool or pending proposal. |
| P0 | Controller's edits go through original role/scope checks, preview, explicit approval and idempotent commit; no history sync may revive a stale proposal. |
| P0 | Cloud privacy/security sign-off: account-private plaintext in Firebase is not end-to-end encrypted; decide retention and export policy, never assert it is E2E. |
| P1 | Safari physical iPhone: 15 successive voice sessions, both entry points, stop/restart, microphone permission retry, switch modes while audio is active. |
| P1 | Safari/Chromium widths 320, 375, 390, 430; iPad; PDF pagination; uploads; supplier history tables; no hidden review fields, nested scroll or action buttons behind keyboard. |
| P1 | Offline -> online, tombstone deletion, 30+/200+ thread boundaries, 60+ messages, malformed Firestore records, transaction contention. |
| P1 | Cross-currency supplier math and draft price correctness: do not sum different currencies or invent missing values. |

## Known product limitations

Local cache remains limited to 30 threads and 60 messages per thread; cloud lists up to 199 documents before deliberately failing closed instead of silently losing older records. Cloud history includes text and metadata **only**; it does not transfer attachments, PDFs, recordings or working drafts. Cloud sync currently pulls when AI workspace refreshes or connectivity returns; it is not a permanently subscribed live realtime chat relay.

## Release decision

Do not merge this candidate to main or deploy to production until the above acceptance proofs exist. Keep #709, #710 and the stacked PRs intact until an audited rollout/rebase plan is agreed. There is **no automatic merge or deployment**, and no paid GitHub Actions were enabled.

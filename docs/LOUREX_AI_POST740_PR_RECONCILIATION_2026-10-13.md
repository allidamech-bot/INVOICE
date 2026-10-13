# LOUREX AI — post-#740 PR reconciliation and closure ledger
Date: 2026-10-13 (Europe/Istanbul). Repository: `allidamech-bot/INVOICE` only.

## Scope and hard rules

- **Source of truth**: integration PR #740 head `7f845d9771028952d13fe3855941c30e04997118`, then the separately staged post-740 working branch `fix/ai-batch1-pr-reconciliation-f17-20261013`.
- `main` remains unchanged. No PR merge, branch deletion, production deployment, database writes or paid runner.
- Closing or merging a PR is not proof that its branch was deleted, nor proof the code reached `main` or Production.
- **Before closure**, prove functional parity, tests, and artifact content. A diverged Git history is not by itself evidence of a missing feature.
- **Do not close any PR while its relevant unique files/behaviors remain unclassified.**
- The original audit's **F17 = exact natural saved invoice-reference failure (D04–D07)**; PR #736 reused the F17 label for file-by-file progress. Distinguish by PR number and audit IDs to avoid confusion.

## The twelve pre-#720 open PRs

Comparison: `old-PR-head...integration/ai-parallel-streams-safe-20261013`, checked 2026-10-13. `behind=0` means the old head is an ancestor; positive behind needs content/behavior review.

| PR | Purpose | Compare (ahead/behind) | Status and required disposition |
| --- | --- | --- | --- |
| #707 | Living workspace local release gate / device checklist | diverged (371/2) | Local gate script ported to this working branch with explicit top-level Node discovery; review QA checklist against current no-go criteria |
| #709 | Voice owner + Safari restart | diverged (311/31) | Independent voice code was integrated via later candidate; verify equivalent voice-owner behavior & device tests, not commit-count merge |
| #710 | Advisor/Controller isolation | diverged (311/11) | `api/ai-core.js` source blob exactly matched integration when sampled; still validate relevant policy tests and no executable leakage |
| #711 | Conversation history | ahead (305/0) | All head commits ancestors of #740; verify no later regressions before closing superseded PR |
| #712 | Mobile supplier comparison / information density | diverged (311/4) | Design alternate: compare `lxw-supplier-compact` and current `lxw-supplier-mobile` behavior, not CSS string equality; current separate tests exist |
| #713 | Compact evidence review | ahead (299/0) | Ancestor; verify retained behavior |
| #714 | Supplier result fidelity | diverged (295/2) | Validate current source-value integrity regressions; keep only non-duplicative behavior |
| #715 | Mobile import review | diverged (288/2) | Validate product/supplier diff visibility and no hidden rows |
| #716 | Firebase text-only history sync | diverged (234/4) | Preserve UID isolation, transaction tests, tombstones, no approval sync; emulator and real deployed rules still need acceptance |
| #717 | Seven-batch release candidate | diverged (265/18) | Older integration contract replaced by later `ai-batches1-7-release-candidate-contract`; compare assertions before closing |
| #718 | Integrated QA branch | ahead (175/0) | Ancestor; its test coverage remains subject to current candidate CI |
| #719 | Integration QA / emulator | ahead (175/0) | Ancestor; retain reproducible CI evidence and redo on exact final candidate SHA |

`ahead` and `behind` in the table are relative to the old branch, NOT GitHub PR mergeability. All twelve PRs remain open as of this ledger. No automatic close/merge authorization is implied by ancestry.

## Post-#740 execution recorded here

- Exact scoped saved document reference resolution for user requests like “افتح لي PDF الفاتورة INV-2026-0001”; calls the existing Controller A4 preview and never posts or persists.
- Fail closed on mixed exact references, wrong company/branch/mode, and mixed modification/preview commands.
- New regression suite `tests/ai-f17-natural-saved-document-preview.test.mjs` includes Arabic/English requests, Arabic digits, missing/ambiguous references, and unchanged vault state.
- Recovered `scripts/ai-living-workspace-release-gate.mjs` from #707, adapted to the current tests and to avoid accidentally running Firebase emulator tests outside their own isolated job.
- Added this exact branch to the existing local-only free GitHub QA workflow; this is **not** release approval.

## Closure / release gate

1. Audit every diverged old PR for unique functionality, match against the current source and behavior. Port only verified missing work.
2. Run clean `npm ci`, TypeScript, production build, targeted and full Node suite on the exact head SHA. Run Firebase emulator rules/concurrency and browser Chromium/WebKit PDF/mobile checks. Missing or failed steps = **NO-GO**.
3. Independently test authenticated Controller/Advisor, multi-turn unsaved quote, 84+ lines, real PDF on iPhone Safari, voice repeat/permissions, account B and branch isolation, Firebase cloud acknowledgment and real deployed rules.
4. Fix unresolved audit FAIL and NOT RUN cases, notably D04–D07 exact saved references, D08 report period, D11 language undo, unsupported operational document types, and high-impact guard policy; do not treat these as fixed by unrelated static tests.
5. Obtain explicit approval to merge the validated candidate to protected `main`. Compare exact main commit to deployed Vercel SHA and run post-deploy acceptance.
6. Only **after** this evidence: close superseded PRs with cross-links and unique-content disposition; inventory/delete all obsolete dev/release/audit branches through a supported authenticated GitHub administration workflow. Retain protected `main` and any required non-ephemeral protected branches. Verify open PR count = 0 and expected branches only.

**Status:** working branch / unaccepted. CI running or pending; do not label these changes PASS until result logs confirm it.

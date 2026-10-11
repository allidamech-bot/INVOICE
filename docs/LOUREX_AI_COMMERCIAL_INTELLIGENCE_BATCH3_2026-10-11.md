# LOUREX AI — Batch 3 Commercial Intelligence & Missions

Scope: `allidamech-bot/INVOICE` only. Feature branch `ai/commercial-intelligence-20261011`.
Stacked on Batch 2 PR #694 (`93558c604110403563b7ce16ca6a786a29702f8b`), which targets Batch 1 PR #693. No merge or Production release authorized/performed. No packages, paid service, new database, encryption migration or non-AI business workflow change.

## Actual baseline and runtime ownership

Main and Production alias `https://invoice-three-puce.vercel.app` rechecked at `00117b9b7109c82e34b9fcc0c8fafe6cd03a4e61`; Production deployment `dpl_4S4bvun6GJPNTQDm7TmhdXs7orBX` READY. PRs #693 and #694 remain open/unmerged. Batch 2 tested tree `4788a7890286cc7fca08a34d996d0c3d9f299f7f` is this branch's parent.

Both approved Library files were read completely. Work continues the approved four-phase product direction following the owner's later instruction to finish the batches before combined review. Original Batch 1 implementation is preserved.

Canonical flow remains TypeScript -> existing ordered installers -> Foundation compatibility boundary -> Workspace presentation boundary -> final voice hash. There is no new prototype installer. The existing final Workspace installer additionally stamps transitive compiled module content into SW bytes; it verifies each asset is already in the generated precache. Existing installer order, voice identity contract and protected vault commit checks stay intact.

Runtime:

- `AiConversationWorkspace` -> precompiled `AiCommercialWorkspace`: deal studio and missions tabs.
- UI commands -> `updateIntelligenceWorkspace` -> fresh session/scope -> copy-on-write kernel -> `applyWorkspaceCommand` -> original review/stamp -> encrypted thread store.
- Exact commercial chat commands -> `commercialDraftCommand` -> the same workspace command/draft review/missions, without a model call.
- Existing tools -> `intelligenceTools` -> typed dated tool evidence -> existing result/proposal -> approval-stamped mission.
- Existing generic/legacy approval controls -> `intelligenceApprove` -> payload/scope/snapshot/receipt checks -> mission dependency check -> durable applying receipt -> original guarded executor -> verified result -> completed/uncertain state.
- On restart, applying mission steps become uncertain, never pending. Pending reviewed proposals restore from encrypted mission records; each approval still revalidates actual current data.

## Proven gaps addressed

| Gap | Evidence | Implementation |
|---|---|---|
| Action plan progress is primarily volatile UI state | `executeAiToolPlan` prepares up to five calls; final `__lourexRemainingPlan` advances visible proposal. Generic plans had no durable per-step proposal/result ledger. | Scoped mission IDs, dependency IDs, exact approval bindings, stored pending proposals, timestamps and result refs. Resume skips completed steps. Cancel keeps completed/uncertain actions. |
| Draft pricing exceptions require separate edits | Previous grid supports single-cell changes; deterministic bulk exception command absent. | Validate all rows/currency first; subtract declared values at four-decimal precision, preserve IDs, one undo snapshot, per-line diff. Negative/stale/currency-mismatched changes fail without partial edit. |
| Trade terms lack dedicated obligation comparison | Current document drafting records an Incoterm string; changing it does not explain changed assumptions. | Compare explicit terms, flag named place, transport/risk/freight changes; no automatic price conversion. Missing previous term stays unknown. |
| Commercial numerical presentation disconnected from working context | Existing calculator tools are useful but individual results are not an interactive, durable deal scenario. | Typed scenario inputs/results using existing decimal and recorded-FX primitives. Explicit source/rate date/inverse; missing cost/FX stays unknown. No ledger posting. |
| Supplier evidence comparison lacks a scoped unified display | Posted purchase history and external source discussion use different paths. | Exact product IDs; all relevant posted, unreversed purchases; declared external quoted facts with source/date/excerpt/capture timestamp. Preserve currencies and units. No availability assertion or cross-currency ranking. |
| Imported module content does not affect voice-only runtime identity | Final voice hash hashes the composer; new TS files retain stable URLs. | Content-derived SW marker for eight Workspace/Commercial modules. Existing SW reload precache contract refreshes their bytes when changed. Voice hash remains composer-specific. |

## Implemented behavior

- Business composer prepares quotation/proforma or invoice draft using existing document proposal schema/defaults. Select exact customer/products in the shared picker, revise lines, review and save using original guarded approvals. It does not create orders, payments or posted documents.
- Live deal studio: whole-draft repricing with last-line exception, commercial terms, whole-carton conversion, landed cost/revenue/profit/margin and dated recorded FX. Explicit assumptions remain visible. Scenario calculations do not implicitly rewrite quote prices or accounting data.
- Exact local bilingual commands include `reduce all prices by 0.5 USD except last by 1 USD`, `خفض سعر كل الأصناف بمقدار ٠٫٥ USD إلا الأخير بمقدار ١ USD`, and `change delivery to EXW Mersin`. Wider free-form language uses the existing planner; no broad intent-accuracy claim.
- Registered `FinanceScenario`, `WorkflowProgress`, `SourceCompare` facts extend the precompiled whitelist. No model-generated JS, HTML or callbacks.
- Approval center shows durable mission steps, execution status, source references and completion record IDs. Resume reopens remaining reviews; it never approves or replays completed actions automatically.
- Draft revisions supersede their unstarted older review, avoiding an artificial ten-edit limit. Ten mission records retained; completed/cancelled older missions may be evicted, while uncertainty is not automatically discarded. Foundation replay receipts stay independently protected.
- Pending mission envelope bindings refresh after a verified preceding step using existing approval semantics and domain guards. Per-step current payload/scope/role checks remain mandatory.
- Personal clears business state. Company/branch/account/thread scope changes invalidate foreign kernels. Temporary uses in-session state without durable assistant-store persistence.

## Source policy and operational limits

Research evidence currently means an explicitly supplied HTTPS source, date, quoted excerpt, exact product, currency and unit, labeled **external-unverified**. No live web-search provider is connected. The product does not scrape websites, promise stock availability, claim supplier confirmation, or silently register an FX rate. Existing attachment extraction remains the original source-aware flow; this batch does not claim arbitrary PDF-to-comparison mapping or ten-file ingestion acceptance.

Incoterm warnings use the ICC 2020 terminology, verified against official ICC pages on 2026-10-11:

- https://iccwbo.org/business-solutions/incoterms-rules/
- https://academy.iccwbo.org/incoterms/article/incoterms-2020-cfr-or-cif/
- https://library.iccwbo.org/content/tfb/BOOKS/BK_0049/BK_0049_04_RulesAny.htm

The warnings are review prompts, not a complete contract/cost model. Amounts are never inferred from a term change.

## Validation

Final ordered validation: `npm run typecheck` PASS; `npm run build` PASS; `TZ=UTC node --test --test-concurrency=2 tests/*.test.mjs`: **2,390 passed, 0 failed, 0 skipped/cancelled**, 68.677 seconds. Batch 2 baseline: 2,366; this batch adds 24 behavioral/integration cases. Additional `TZ=Europe/Istanbul` commercial suite: **24 passed, 0 failed**. `git diff --check` PASS. Final built `AiCopilot.js` SHA256 `fdb6cdf2741b66e157ead61a2257cba83bceb637903b56da8abe3b938b410f58`; `AiCommercialWorkspace.js` SHA256 `b0fdc9813b58d1a5338e4a49ba486b6570b47d01d39bf480933a25ea6a6bdc3a`. These are local built bytes, not Production deployment claims. Targeted assertions cover exact bulk diffs and undo, missing/zero/negative profit, Arabic decimals, recorded/future/foreign FX, explicit cartons, CFR -> EXW, exact supplier identity, scope isolation, untrusted source injection, mission dependency/order/replay/cancel/crash recovery, real AES thread-store roundtrip, fourteen successive draft revisions, actual runtime local-chat handling and SW content identity.

The tests use local deterministic fixtures and real encrypted store/runtime adapters. They are not live model conversations, authenticated Production browser tests or physical device acceptance. Existing browser limitation from Batch 2 persists: cloud browser cannot reach local fixture; no locally usable browser engine was available. No Production business data was modified for QA.

One intermediate test run overlapped a subsequent rebuild and observed missing dist modules; that run is discarded as invalid execution sequencing. The final acceptance run begins after the full ordered build, with no source/module changes during execution. Existing assertions were not weakened; two earlier harnesses load the new real imported modules.

## Remaining risks / deferred acceptance

- Full live research search/verification and arbitrary supplier PDF normalization are not connected. Ten-file imports retain the existing four-source planner boundary and explicit fail-closed limits.
- Missions bind existing preflighted action proposals in a sequential dependency graph, capped at five actions. Arbitrary future steps requiring IDs/results not yet available require another explicit reviewed plan; there is no autonomous planning/execution loop.
- Applying/uncertain records require manual record verification. Vault commits and assistant journals remain separate encrypted records; no cross-store atomicity or automatic ambiguous-write reconciliation is claimed.
- Scenario quantity/cost/price must refer to the same declared unit/currency. No packing-text parser, automatic tax duty lookup, freight quote or guessed cost. Calculations follow existing four-decimal quantity/price and two-decimal line-total contracts.
- Existing approved history/source/draft-size limits remain; oversized working memory fails explicitly. Mission snapshots increase encrypted-thread size. No measured latency/model-quality/SLO claims.
- Local process timezone can trigger the separately reproduced preexisting payment-as-of defect near midnight (`todayIso` local date versus UTC createdAt in payables). No payables/ledger code changed; full deterministic regression uses UTC, with commercial suites additionally checked in Europe/Istanbul.
- Windows, iPhone/iPad WebKit, live repeated voice and authenticated browser acceptance remain pending. PR stays draft for combined review.

## Changed files

- `src/lib/ai-commercial-intelligence.ts`: deterministic commerce and source comparisons.
- `src/lib/ai-commercial-conversation.ts`: narrowly parsed bilingual local draft commands.
- `src/lib/ai-mission-runner.ts`: durable step/dependency/approval state, recovery and cancellation.
- `src/lib/ai-conversation-kernel.ts`: optional scoped commercial/mission/tool-evidence fields in the existing encrypted kernel.
- `src/lib/ai-workspace-model.ts`: validated commerce commands and whitelisted fact components.
- `src/lib/ai-intelligence-runtime.ts`: connect typed commands, persistence, approvals, mission revalidation and exact chat edits.
- `src/components/AiCommercialWorkspace.tsx`, `src/components/AiConversationWorkspace.tsx`: precompiled deal/mission presentation in the existing AI workspace.
- `src/styles/ai-conversation-workspace.css`: AI-only forms/controls containment and touch targets.
- `scripts/ai-conversation-workspace.mjs`: transitive module SW content identity, no new installer order.
- `tests/ai-commercial-intelligence.test.mjs`: 24 new deterministic and actual-adapter cases.
- Existing Foundation/Workspace test harnesses: load the real new module imports; existing assertions preserved.
- This report. No financial ledger, payables, backups, PIN, provider configuration or non-AI page changes.

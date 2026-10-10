# LOUREX AI — Batch 1 Intelligence Foundation acceptance ledger

Repository: `allidamech-bot/INVOICE` only. Branch: `ai/intelligence-foundation-20261010`.
Approved inputs read in full, in order: Master Handoff V1.1 (180 lines, 19,744 bytes), Batch 1 Prompt (25 lines, 3,477 bytes), from `/LOUREX-AI`.

## Source and deployment baseline

- Verified main and merged PR #691: `00117b9b7109c82e34b9fcc0c8fafe6cd03a4e61`.
- Production alias: `https://invoice-three-puce.vercel.app`.
- Vercel deployment: `dpl_4S4bvun6GJPNTQDm7TmhdXs7orBX`, READY, main, same SHA. Immutable hostname: `invoice-8xlqq053v-alidaamishs-projects.vercel.app`. No baseline drift.
- Baseline build completed; full unmodified test suite: **2,332 pass, zero fail/skip/cancel**.
- Final validation and branch SHA are recorded below after execution. No merge, Production deploy, data migration, new package, or paid service.

## Proven findings (code evidence, not authenticated Production reproduction)

| ID / severity | Reproduction and original owner | Resolution |
|---|---|---|
| F01 / high reliability | Final compiled `ask`: `assistantProviderMemory` -> `assistantRequestMessage` -> optional durable context -> total 1000 chars. Current user instruction itself capped at 680 and later 650. Source TS alone misleading. | Preserve full <=6000-char current instruction; structured scoped working references passed as separate DATA field. Advisor/source endpoints accept this bounded field; overflow fails explicitly. Legacy approved memories stay in the composed DATA context. |
| F02 / high integrity | `findCustomer`, `findSupplier`, `findProduct` use first `.find` label match with duplicate names. | Require a unique match or explicit ID; otherwise return actionable failure. Exact numbered search results become a named selection set; ordinal follows its displayed IDs. |
| F03 / high isolation | Built `__lourexImportScope` omits branch in pending product-import key. | Final compatibility boundary includes branch and thread; existing source preflight remains intact. |
| F04 / high safety | Final `__lourexApplyGenericToolStep` calls execution directly, outside legacy `approveProposal` role wrapper. No common review snapshot/replay receipt across generic/document paths. | Both paths use one guarded approval boundary; operator, account/company/branch, exact payload and business snapshot checked. Vault writes recheck inside actual mutation callback. Encrypted applying/applied/uncertain receipts prevent replay. |
| F05 / foundation gap | Text summary omits typed active artifact and revision, last edited line and selection. Existing regex editor cannot resolve standalone “لا، اللي قبله”. | Encrypted per-thread kernel with stable line IDs, correction chain, draft-only undo/redo and durable working state. |
| F06 / medium completeness | Document read returns first 20 lines but computes totals over all lines with no omitted-line flag. | Return item count and explicit truncation flag; existing 20-row creation limits still fail closed. |
| F07 / scoped authorization | Task/memory update helpers take an ID and do not independently bind it to the current conversation scope. | Foundation envelopes recheck task/memory target scope before changing the encrypted record; Personal task creation must explicitly identify Personal scope. |

## Canonical runtime map and migration decision

`src/components/AiCopilot.tsx` -> TypeScript compiler -> ordered installers below -> final `dist/src/components/AiCopilot.js`.

The existing source/build contract is retained. A single fail-closed final shim binds actual final runtime callsites to first-class TypeScript modules; no new feature logic is embedded in the shim. A wholesale installer removal would break current owners/tests and was not authorized. This is an incremental migration, not a claim that all legacy monkey patches have been removed.

- Mount/turn: final mount -> `installIntelligenceRuntime` -> existing history lifecycle -> encrypted kernel hydration -> existing `ask`.
- Context: `buildAiContext`/`prepareAssistantContext` -> `intelligenceContext` validates scoped references -> `composeKernelMemory` -> separate `conversationWorkingMemory`.
- Revision: existing pending document path -> `intelligenceReviseDraft` -> typed kernel -> existing `reviseAiPendingDocumentDraft` validation. No vault write.
- Tool gateway: final `ask` -> `intelligenceTools` -> existing `orchestrateAiToolRequest` -> strict local parser or `/api/ai-inbox` tool-plan -> `executeAiToolPlan` -> typed outcomes and proposal. Numeric engines reused.
- Conversation fallback: attachment sources -> `/api/ai-conversation-v3`; ordinary read-only -> `/api/ai-advisor-v2`; supported action/explanation -> `/api/ai-core`.
- Provider: endpoints -> `api/_ai/router.js`; general Groq Qwen / Cloudflare Gemma / Gemini; deep Groq GPT OSS / Cloudflare Nemotron and GPT OSS / Gemini; native document Gemini. Existing free-only policy, 18s default timeout, two attempts, 2-failure/30s circuit kept. Credentials/real quotas not inspected; registry eligibility is not a live free-quota guarantee.
- Approval: legacy `approveProposal` AND generic step -> `intelligenceApprove` -> preflight snapshot/receipt -> existing executor -> mutation-time `assertFoundationApproval` -> existing domain guards -> verification -> receipt. Failures after starting remain uncertain and require record review; no optimistic completion.
- Local synchronous arithmetic shortcut and current voice/attachment bridges remain unchanged.

### Complete AI installer order (global position in build command)

| Position | Installer | Declared dist targets |
|---|---|---|
| 25 | `scripts/ai-batch1-unified-assistant.mjs` | `dist/src/components/AiCopilot.js`, `dist/src/components/LourexAdvisorCard.js`, `dist/styles/app.bundle.css` |
| 26 | `scripts/ai-batch1-thread-lifecycle-fix.mjs` | `dist/src/components/AiCopilot.js` |
| 27 | `scripts/ai-batch1-personal-isolation-fix.mjs` | `dist/src/components/AiCopilot.js` |
| 28 | `scripts/ai-batch1-entity-context-fix.mjs` | `dist/src/components/OperationsPage.js`, `dist/src/components/ProductLibraryWorkspace.js`, `dist/src/components/ReportsPage.js` |
| 29 | `scripts/ai-batch2-advisor-data-v2.mjs` | `dist/src/components/AiCopilot.js` |
| 30 | `scripts/ai-batch3-premium-conversation.mjs` | `dist/src/components/AiCopilot.js`, `dist/src/components/AiWorkflowTools.js`, `dist/styles/app.bundle.css` |
| 31 | `scripts/ai-batch3-conversation-lifecycle-fix.mjs` | `dist/src/components/AiCopilot.js`, `dist/src/components/AiWorkflowTools.js` |
| 32 | `scripts/ai-batch3-mobile-panel-fit.mjs` | `dist/styles/app.bundle.css`, `dist/styles/v482-mobile-ux-repair.css` |
| 33 | `scripts/ai-batch4-tool-orchestrator.mjs` | `dist/src/components/AiCopilot.js` |
| 34 | `scripts/ai-batch6-personal-memory-tasks.mjs` | `dist/src/components/AiCopilot.js`, `dist/styles/app.bundle.css` |
| 35 | `scripts/ai-batch7-proactive-voice.mjs` | `dist/ai-composer-v449.js`, `dist/lourex-ai-workflows.js`, `dist/styles/app.bundle.css` |
| 36 | `scripts/ai-batch7-placement-repair.mjs` | `dist/lourex-ai-workflows.js`, `dist/styles/app.bundle.css` |
| 37 | `scripts/ai-conversation-owner.mjs` | `dist/ai-composer-v449.css`, `dist/ai-composer-v449.js`, `dist/lourex-ai-workflows.js`, `dist/src/components/AiCopilot.js` |
| 38 | `scripts/ai-voice-ios-release-owner.mjs` | `dist/ai-composer-v449.js` |
| 39 | `scripts/ai-conversation-owner-stage3.mjs` | `dist/ai-composer-v449.css`, `dist/ai-composer-v449.js`, `dist/src/components/AiCopilot.js` |
| 40 | `scripts/ai-conversation-owner-stage3-closeout.mjs` | `dist/ai-composer-v449.css`, `dist/src/components/AiCopilot.js` |
| 41 | `scripts/ai-conversation-owner-stage4-tools.mjs` | `dist/ai-composer-v449.css`, `dist/src/components/AiCopilot.js` |
| 42 | `scripts/ai-conversation-owner-stage4-tools-closeout.mjs` | `dist/src/components/AiCopilot.js` |
| 43 | `scripts/ai-conversation-owner-stage4.mjs` | `dist/ai-composer-v449.css`, `dist/src/components/AiCopilot.js`, `dist/src/components/AiWorkflowTools.js`, `dist/styles/app.bundle.css` |
| 44 | `scripts/ai-conversation-owner-stage4-accessibility.mjs` | `dist/ai-composer-v449.css`, `dist/lourex-ai-workflows.js`, `dist/src/components/AiCopilot.js` |
| 45 | `scripts/ai-conversation-final-batch5.mjs` | `dist/src/components/AiCopilot.js` |
| 46 | `scripts/ai-remediation-batch3-conversation-ux.mjs` | `dist/ai-composer-v449.css`, `dist/src/components/AiCopilot.js` |
| 47 | `scripts/ai-remediation-batch3-conversation-ux-closeout.mjs` | `dist/ai-composer-v449.css` |
| 48 | `scripts/ai-remediation-batch4-tools-routes-ux.mjs` | `dist/ai-composer-v449.css`, `dist/lourex-ai-workflows.js`, `dist/src/components/AiCopilot.js`, `dist/styles/app.bundle.css` |
| 49 | `scripts/ai-conversation-design-batch1.mjs` | `dist/ai-composer-v449.css` |
| 50 | `scripts/ai-conversation-design-batch2.mjs` | `dist/ai-composer-v449.css`, `dist/ai-composer-v449.js` |
| 51 | `scripts/ai-conversation-design-batch2-closeout.mjs` | `dist/ai-composer-v449.js` |
| 53 | `scripts/ai-intelligence-foundation.mjs` | `dist/src/components/AiCopilot.js` |
| 54 | `scripts/ai-voice-final-runtime-hash.mjs` | `dist/ai-composer-v449.js`, `dist/index.html`, `dist/sw.js` |

## Working/duplicate/unreachable classification

- **Working/reused:** encrypted conversation, personal memory/tasks, company/branch scoping, source preflight, deterministic calculations, draft validation, bulk atomic domain operations, mutation verification, bounded sequential plan approvals, voice and attachment bridges.
- **Duplicate/compatibility:** older prototype render/ask wrappers and legacy request-text composers remain because later installers assume their tokens; final bound function owners above supersede foundation semantics. Legacy bounded helper remains useful to older callers; it no longer truncates the final current user instruction.
- **Registered but not provider-reachable:** strict local tools `customer.master`, `supplier.master`, `product.importSource` have no matching server planner catalog entry; current explicit local parsers/source path own them. Not represented as model-executable capabilities.
- **Intentionally blocked:** document finalization, payment posting, inventory adjustments, financial deletion and accounting posting. No replacement path added.
- **Deferred:** UI focus-mode selector, universal missions, Generative UI, full relationship graph, autonomous posting and cross-device sync. Batch 2–4 not implemented.

## Contracts and changed files

- `ai-conversation-kernel.ts`: scoped typed kernel, selection sets, active artifact, stable line IDs, copy-on-write corrections, bounded revision ledger.
- `ai-intelligence-runtime.ts`: one compatibility adapter to existing runtime; typed tool outcomes; hydration/persistence; approval replay guard; exact displayed search list.
- `ai-foundation-approval.ts`: strict role/scope/payload/snapshot preflight and commit checks.
- `assistant-store.ts`: optional backward-compatible kernel and receipts in the same AES-GCM record; no encryption/database replacement.
- `ai-tool-actions.ts`, `AiCopilot.tsx`: mutation-time guards plus existing validation/verification unchanged.
- `ai-tool-orchestrator.ts`: duplicate-name safety and long-read omission flag.
- `ai-tool-client.ts`, four API endpoints: bounded working DATA passed separately from user action authority. No invented numerical results.
- `ai-intelligence-foundation.mjs`, `package.json`: one exact-token boundary after audited owners; fail build on runtime drift.
- `ai-intelligence-foundation.test.mjs`: behavioral acceptance and actual compiled adapter with real AES-GCM, injected storage/session edges.

## Validation and acceptance boundaries

The 50-turn corpus is a deterministic kernel/adapter fixture, **not 50 live provider turns**. Typed draft state survives bilingual discussion and correction independent of text-summary truncation. Exact lists are supported only when displayed by the existing search tool; arbitrary summarized lists deliberately cannot authorize ordinal writes.

Production browser reached the real signed-out screen in English and Arabic. No authenticated fixture/credentials were available; no Production records created/changed. No claim of live model, attachment, repeated voice, physical iPhone/iPad WebKit, Windows, or authenticated financial acceptance.

Known risks: snapshot checks conservatively require re-review after unrelated scoped business changes; approval journal and vault are separate encrypted records, so crash uncertainty blocks replay rather than claiming atomic cross-store commit; no automatic ambiguous-result reconciliation. Legacy installer debt remains. Draft working memory increases prompt size and may meet provider context/quotas sooner. Existing hard source limits (4 sources / 2800 planner chars) and draft creation limits are retained; larger commercial ingestion is deferred. Broad free-text intent SLO/latency not measured and not claimed.

### Final results

- `npm run typecheck`: PASS.
- Full ordered `npm run build`: PASS, including the final foundation shim and unchanged voice hash finalizer.
- Complete `node --test --test-concurrency=2 tests/*.test.mjs`: **2,350 passed, 0 failed, 0 skipped, 0 cancelled** (44.347 seconds). Baseline 2,332 retained plus 18 new cases.
- New acceptance coverage: 50-turn bilingual state; third-line/correction/undo/redo; stable line IDs after removal/undo; company/branch/thread/account/Personal isolation; exact displayed selection; long instruction and separate DATA memory; altered/stale approval; real mutation-callback checks; replay after remount; real AES-GCM storage; simultaneous approval; deterministic finance; final compiled `ask` execution.
- `git diff --check`: PASS. API JavaScript syntax checks: PASS.
- During development one build attempt failed while downloading the existing Amiri font; a clean complete retry succeeded without altering the font/build requirement.
- Two preexisting tests initially failed because of the inserted guard's position/dependency in isolated harnesses. Corrected guard order/compatibility; existing tests were not changed or weakened.
- Browser: actual Production signed-out page observed English and Arabic. Authenticated AI acceptance remains blocked by lack of an authenticated fixture. No Production mutations or release performed.
- Final remote commit/PR are recorded by the PR snapshot; local tested tree is verified against the remote tree before handoff.


## Complete tool reachability matrix

“Planner” denotes catalog reachability, not live provider execution. Reads and calculators run locally, execute tools produce review proposals, and high-impact operations stay blocked.

| Tool | Class | Planner | Approval | Owner / execution evidence |
|---|---|---|---|---|
| `customer.getSummary` | read | yes | no | local read dispatcher |
| `customer.getReceivables` | read | yes | no | local read dispatcher |
| `customer.getHistory` | read | yes | no | local read dispatcher |
| `supplier.getSummary` | read | yes | no | local read dispatcher |
| `product.getSummary` | read | yes | no | local read dispatcher |
| `product.getCostHistory` | read | yes | no | local read dispatcher |
| `document.get` | read | yes | no | local read dispatcher |
| `purchase.get` | read | yes | no | local read dispatcher |
| `finance.getSummary` | read | yes | no | local read dispatcher |
| `treasury.getSnapshot` | read | yes | no | local read dispatcher |
| `reports.getMetrics` | read | yes | no | local read dispatcher |
| `inventory.getStatus` | read | yes | no | local read dispatcher |
| `search.records` | read | yes | no | local read dispatcher |
| `pricing.margin` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `pricing.markup` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `pricing.targetPrice` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `landedCost.calculate` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `scenario.calculate` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `fx.convertUsingRecordedRate` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `receivables.aging` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `breakEven.calculate` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `inventory.coverage` | calculate | yes | no | decimal/BigInt/recorded FX calculator |
| `quotation.prepare` | prepare | yes | yes | read-only preview |
| `invoice.prepare` | prepare | yes | yes | read-only preview |
| `customer.prepare` | prepare | yes | yes | read-only preview |
| `supplier.prepare` | prepare | yes | yes | read-only preview |
| `purchase.prepare` | prepare | yes | yes | read-only preview |
| `reminder.prepare` | prepare | yes | yes | read-only preview |
| `message.prepare` | prepare | yes | yes | read-only preview |
| `report.prepare` | prepare | yes | yes | read-only preview |
| `document.createDraft` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `document.updateDraft` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `customer.update` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `customer.master` | execute | local-only | yes | proposalForExecutableTool -> guarded existing executor |
| `supplier.update` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `supplier.master` | execute | local-only | yes | proposalForExecutableTool -> guarded existing executor |
| `product.updateMetadata` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `product.bulkUpdate` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `product.importSource` | execute | local-only | yes | proposalForExecutableTool -> guarded existing executor |
| `navigation.open` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `task.create` | execute | yes | yes | proposalForExecutableTool -> guarded existing executor |
| `document.finalize` | high-impact | yes | yes | high-impact-guard |
| `payment.record` | high-impact | yes | yes | high-impact-guard |
| `inventory.adjust` | high-impact | yes | yes | high-impact-guard |
| `financial.delete` | high-impact | yes | yes | high-impact-guard |
| `accounting.post` | high-impact | yes | yes | high-impact-guard |

Coverage pointers: `tests/ai-tool-orchestrator-batch4.test.mjs`, `tests/b04-source-aware-tool-planner.test.mjs`, `tests/ai-intelligence-foundation.test.mjs`. No claim that all tools were executed against populated Production records.

## Built artifact identity

Final local `dist/src/components/AiCopilot.js` SHA-256: `747a59872bb567920973382ba00c78837e7b7c3083966b68eb8a48b4a8070b07`. This is local built-runtime evidence, not a claim that this feature is deployed.

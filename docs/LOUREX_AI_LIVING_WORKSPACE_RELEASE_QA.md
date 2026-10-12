# Post-release live audit — 2026-10-12 (current status)

**Acceptance: BLOCKED. PR #708 is Draft and has not been merged or deployed.**
The pre-release notes below are historical. PRs #703–#706 are already merged.
The verified Production baseline is `ff512a8bbd983e65dc63d5238fe2befe754fd681`, deployment `dpl_HDqfgDF8xCn12oNYmHtMvfrFjoTU`, state READY, with the official domain assigned to it (Vercel API evidence).

## Latest live investigation and consolidated correction — 2026-10-12

**Current Production remains `ff512a8`. No correction has been merged or deployed to Production.**

### Resumed live session — 2026-10-12, 06:00 UTC

- Browser access resumed. Secure email authentication completed and a fresh authenticated dashboard rendered on the existing stable Preview alias. This is live email sign-in evidence; it does not certify cross-device or cross-account isolation.
- GitHub confirmed PR #708 remains Draft, open and unmerged at `90f966e0d2190acb6146c84c3b09ecad3c0a5b46`. The local checkout was clean. Its consolidated correction still has no Preview deployment.
- The Vercel deployments connector now returns 403 (permission to list denied). No Vercel CLI is installed. The previously authorized Dashboard fallback was used successfully to inspect deployment metadata.
- Vercel Dashboard confirms Production remains READY on `ff512a8`, deployment `HDqfgDF8xCn12oNYmHtMvfrFjoTU`; the stable Preview remains on `50fae116bf379b03bae1aa7b34618577f41e0542`, deployment `Aw4Mo4WaeGWMHzJaJtwMFaq6dX4e`.
- Creating a Preview for exact head `90f966e` is **BLOCKED**: the Create Deployment dialog displays a GitHub secondary-rate-limit 403 and disables Create Preview Deployment. One retry after waiting returned the same explicit error. No new build, merge or Production publication occurred. This is a Vercel-to-GitHub service limitation, not an application login failure or a confirmed bot challenge.
- Source follow-up confirmed the preview-only presentation gap: `src/lib/ai-tool-orchestrator.ts` returns review data for `quotation.prepare` / `invoice.prepare`, while `runIntelligenceTools` records those tool results as evidence; the document artifact path is staged only for document write proposals. A textual answer is therefore not proof of a dedicated structured financial preview. This gap remains open; do not convert no-save intent into an approval-gated write to conceal it.

The consolidated visual correction remains pending live retest. Do not mark it FIXED, make PR #708 ready, or merge solely because the earlier automated gates passed. Browser login now works; the current release blocker is the Preview creation failure above.

### Resumed Preview gate — 2026-10-12, 07:40 UTC

- GitHub secondary rate limit cleared. The authorized Vercel Dashboard created one consolidated Preview for exact PR head `6f72f048e2f6769ebb2e8b1b8d36fa771fb918a5` (the visual correction plus QA documentation).
- Deployment `dpl_7EpQ6M1osiVAFQshtz17JBKhPCeA` reached **READY**, duration 36s. Dashboard source and domain metadata associate that SHA with `https://invoice-kaunxrv6z-alidaamishs-projects.vercel.app/` and the stable branch alias `https://invoice-git-fix-post-release-live-a-518cd5-alidaamishs-projects.vercel.app/`. Preview creation is no longer blocked.
- A fresh browser opened the stable alias and rendered the Firebase sign-in screen. No authenticated assistant page was visible. The secure authentication request ended with status `declined`, without `user_took_over`; it was not repeated. **The current live gate is BLOCKED by incomplete authentication**, not a failed application login or the previous rate limit.
- Re-ran actual local TypeScript, full build and the complete Node suite on this source: **2525 PASS / 0 FAIL / 0 SKIPPED / 0 cancelled**. Fresh logs are `/tmp/lourex-build-20261012-resumed.log` and `/tmp/lourex-tests-20261012-resumed.log`. Only documentation changed since the previously tested implementation.
- PR #708 remains Draft/unmerged; Production remains unchanged. No new assistant screenshot, real iPhone/iPad/WebKit retest, or acceptance of the latest correction is claimed. Resume authenticated visual and functional testing on this READY Preview; do not deploy it to Production merely to bypass the Preview sign-in gate.

### Authenticated live retest — 2026-10-12, 08:13 UTC onward

Manual sign-in completed. An authenticated Arabic dashboard and the assistant rendered on Preview `6f72f04` / deployment `dpl_7EpQ6M1osiVAFQshtz17JBKhPCeA`, observed Chrome viewport 1363×936. Authentication is no longer the live blocker.

| Check | Result | Evidence |
|---|---|---|
| Compact header / Business dropdown | FIXED (observed desktop only) | One header row with title, workspace icon, settings, menu and close; no Business dropdown or separate Workspace row. |
| Black assistant on Light site | FIXED (observed desktop only) | Header, tabs, messages, pill, settings and CFO portal retain black/charcoal while the site remains Light. |
| Independent settings locale | PASS (live, limited) | Changed AI UI to English while the site stayed Arabic; mode descriptions, header and settings translated. Returned AI UI to Arabic. |
| CFO portal theme and language | FIXED (live, limited) | Opened through Plus; black portal, white text, charcoal fields, English matching AI UI; close returned to chat. No calculation possible without products. |
| Advisor restriction | PASS (live, limited) | Arabic request to delete customer, alter price, create invoice and navigate products produced read-only navigation denial, no approval/route change. |
| Advisor Plus / Escape | PASS (live) | Only Camera and Photos & files. Escape closed the menu; AI settings remained usable. |
| Controller / Advisor message history | PASS (live, limited) | Each restored its own submitted request. This is not a cross-account isolation certification. |
| Actual document preparation | BLOCKED | Explicit safe two-line quotation draft request returned provider-not-configured message. No proposal, approval or save. |

New reproducible defects in this live retest, repaired in source but **pending another live retest**:

1. **Visible composer and message-action locale:** Site AR / AI UI EN left the visible premium textarea placeholder and Copy/Edit/Retry/Helpful/More labels Arabic. `refreshComposer` updated the hidden input bridge; the later React textarea and icon labels still used site strings. The existing typed presentation owner now supplies the visible textarea placeholder/accessibility label and action `aria-label`/title from AI UI preferences, preserving every original callback and user message.
2. **Transient tool activity crosses threads:** Submit a blocked navigation request in Advisor, then select Controller: the Advisor tool-plan card remained below Controller's different messages. The thread lifecycle cleared context/files but omitted `__lourexToolPresentation`, `__lourexLastToolAudit`, and `__foundationToolOutcomes`. Those volatile references now clear before thread/scope transitions and on account/workspace prop changes; stored kernel evidence/history remains intact. Executable compiled-code regression checks clearing without deleting saved evidence.
3. **Mode switch leaves controls disabled:** Switch Advisor → Controller; both tabs and Workspace remained disabled after loading. Opening/closing AI settings caused a render and released them, reproducing stale rendered guard state. Mode-switch completion rendered before clearing the non-state busy guard. The final state update now follows guard release in `finally`, on success and failure. Executable regression verifies the final render sees an unlocked guard in both paths.

Source files: `src/components/AiConversationWorkspace.tsx`; regression `tests/ai-conversation-tool-presentation-isolation.test.mjs`. TypeScript PASS, full build PASS, **2528 Node tests PASS / 0 FAIL / 0 SKIPPED / 0 cancelled**. No security capability or approval policy was changed. Captured actual desktop settings/CFO screenshots; no real Safari, mobile keyboard, eight-width matrix or full release acceptance is claimed.

### Verified follow-up correction — 2026-10-12, 08:30 UTC

- Preview `e56afe8a2e35a2c77daa99d5d39c1c842d8a7c37`, deployment `dpl_9j2pxMZ4u4txHAneSNSM1BYXKYVT`, reached READY in 30s. Dashboard confirmed the stable branch alias points to it.
- Reload preserved the authenticated session and Arabic AI preference. Opened the assistant and switched Advisor → Controller repeatedly: tabs and Workspace enabled without opening settings as a workaround. **Mode-switch stale-control defect FIXED (live desktop).**
- Site AR / AI UI EN: the visible textarea now has `Ask LOUREX…` as placeholder and accessibility name; Copy/Edit/Retry/Helpful/More labels are English. **Composer/action locale defect FIXED (live desktop).**
- Issued a new safe blocked-navigation request in Advisor, saw its tool activity, switched to Controller and verified that card disappeared while each thread retained its own messages. **Transient tool-presentation leak FIXED (live, limited to thread/mode transition).** Automated coverage also guards account/workspace clearing; cross-account live testing is still outstanding.
- Further FAIL: with automatic answer language, an English navigation request returned Arabic local-tool prose. The final legacy formatter in `scripts/ai-conversation-owner-stage4-tools.mjs` ignored the locale already resolved by the intelligence runtime and supplied site language again. The runtime now passes its resolved reply locale to that existing formatter, with compatibility fallback for legacy callers. New executable regression exercises the actual runtime and final formatter invocation for EN question/AR site, AR question/EN site and explicit EN preference. Source correction is **pending live retest**; tool-activity interface labels remain a separate locale follow-up.
- Latest source TypeScript/build PASS; **2529 Node tests PASS / 0 FAIL / 0 SKIPPED / 0 cancelled**. Production is not updated by this audit. The Dashboard also shows a newer Production redeployment of the same baseline `ff512a8` (`dpl_Hd74AXTpSEmxomRofQLuj7SE59Xg`); this was not initiated here and does not contain PR #708.

### Local financial flow and remaining presentation owners — 2026-10-12

On the authenticated `e56afe8` Preview, used Business → Deal studio to prepare an **unsaved** USD quotation proposal; added synthetic QA Test Valve (2 PCS × 10) and QA Test Filter (3 PCS × 20). Structured Preview showed every item, line totals 20/60 and item subtotal 80.00 USD, with an explicit tax/freight/discount exclusion. It clearly warned that customer selection was missing; review acknowledgement stayed disabled and approval absent. This is **PASS live for manual unsaved preparation and deterministic review**, not proof of the previously incomplete preview-only planner path.

Sent `Set price item 2 to 25 USD` in Controller. The exact local revision updated the second line to 75.00 USD, subtotal to 95.00 USD, and displayed the 20 → 25 price diff. Used Undo in the document workspace; the price/subtotal returned to 20/80.00 USD. Direct Dismiss was available without acknowledgement and removed the pending working proposal. No customer, product, saved document, payment, posting or external message was created or changed. Existing chat history remains.

This expanded live investigation identified additional presentation source owners: `AiCommercialWorkspace` and `AiReliabilityWorkspace` still used site locale; commercial fields and customer/product pickers used `document.documentElement.lang`; tool activity/approval cards used site locale; inline document decision buttons retained original site-language text; after rejection, an empty artifact pane still claimed Draft. The consolidated correction uses the account-scoped AI interface preference for those UI owners, passes the resolved interface locale to tool presentation, passes picker language explicitly, localizes decision-button labels while cloning original guarded callbacks, and gives empty panes an accurate No document open label. No business document language is changed. The existing assistant stylesheet sets dark native-control/scrollbar color schemes only on assistant surfaces.

Added executable compiled-renderer coverage showing that localized Decline retains only the rejection callback and Approve remains absent until review and preserves the original approval callback. Initial failure was a missing busy-helper binding in this new isolated harness; the harness now executes the actual compiled helper. Existing security test assertions were retained. **2530 Node tests PASS / 0 FAIL / 0 SKIPPED / 0 cancelled** on the consolidated locale/decision correction; the final empty-pane copy change also passed the full build and 2530-test regression run before the next Preview. These newest changes remain pending live retest.

- Preview `b965b8c`, deployment `dpl_Dp8DPfP4Y5Dm7pawJubrAgnEyTjn`, was created through the authorized Vercel Dashboard after the connector's 403. Manual email sign-in succeeded. At the observed tablet-sized Chrome viewport, the initial correction still failed: the header computed to grid / 131px and the composer to grid / 154px, including light field surfaces. These were reproduced defects in the correction itself, not acceptance.
- The cause was old AI-specific layout in both `app.bundle.css` and standalone `v482-mobile-ux-repair.css`, plus generic site input/label styling. Correction `50fae11` retires exact AI-owned legacy declarations across emitted CSS, removes the obsolete tablet header at source, and gives the existing typed owner explicit scoped control boundaries. CSS bytes now contribute their own Service Worker identity without changing the independent voice/module identity contract.
- Preview `50fae116bf379b03bae1aa7b34618577f41e0542`, deployment `dpl_Aw4Mo4WaeGWMHzJaJtwMFaq6dX4e`, is READY. Its stable branch alias was opened and email sign-in succeeded. Live screenshots showed a single header row, black pill composer, absent Business dropdown and black settings fields. Settings primary text computed to `rgb(245,245,247)` with opacity 1. These observations improve specific defects; they do not certify the entire design.
- Further live FAILs: a separate Workspace row still consumes space; Controller empty state and several header/menu labels remain in the site language after AI UI language changes; CFO launches a white generic modal; the artifact title has poor contrast. Those defects are addressed together in the subsequent source correction, **pending live retest**.
- Consolidated source correction: a labelled Workspace icon joins the existing header; settings and workspace are mutually exclusive on that control; Controller empty state, menu, close and send labels honor the assistant locale. AI-specific tool portals opt in to `appearance="assistant"`; their theme and locale are independent while ordinary site modals keep their default behavior. Accounting calculations, approval envelopes and original event callbacks are unchanged. Two executable locale tests verify assistant/site separation and fallback outside the assistant.
- Microphone attempts: the first returned permission denied; a second attempt reached the starting state again. No transcript or automatic send occurred. Successful recording/transcription remains BLOCKED by this browser's microphone permission.
- Provider discussion test: Preview returned "AI providers are not configured for this version". Actual provider conversation remains BLOCKED in Preview; do not generalize this to Production.
- File upload test: the chooser workflow failed before a usable chooser/result due to native credential protection. No claim of selecting or processing the two synthetic files is made.
- Browser infrastructure then reported `retained_data_restricted`, reset its runtime, and refused further observation with "native credential state cannot be safely resumed". A fresh tab and a runtime reset both failed. **Further live retesting is BLOCKED by the browser, not by an uncompleted application sign-in. Do not ask for passwords in chat or bypass the protection.**
- Latest consolidated source: TypeScript PASS, complete build PASS, 2525 Node tests PASS / 0 FAIL / 0 SKIPPED. The old header test was strengthened to require the new single-row typed header and absence of the retired 80px grid; the standard modal-close test remains unchanged and passing.
- Reviewed all four supplied Safari screenshots (`IMG_0337`–`IMG_0340`) as baseline evidence. The live agent browser is Chrome, including an observed 833×934 viewport. **No real Safari/WebKit, complete eight-width matrix, phone keyboard, cross-account sync or final After gallery is claimed.**

The last source correction must receive a full live retest on the stable preview alias before PR #708 becomes ready. The user's latest instruction stops repeated publishing during investigation; do not create another deployment merely to claim progress. Resume comprehensive audit, including the earlier preview-only presentation gap, before final acceptance.

## Current approved visual contract

The assistant window alone stays black (`#080808`), with raised black / charcoal surfaces, white text and gray borders regardless of site Light/Dark mode. Remove the Business scope dropdown from the visible conversation; preserve internal account/company/branch scoping and historical data. Controller and Advisor are the only visible modes. No changes to the main site's design.

## Executed evidence

| Scenario | Status | Actual evidence |
|---|---|---|
| Firebase sign-in | PASS (live, limited) | Manual Google sign-in completed; authenticated Production dashboard rendered. Does not certify email sign-in or cross-device sync. |
| Two mode tabs / RTL order | PASS (live) | Controller physically on the right, Advisor on the left in Arabic. Switching restored separate empty Controller and populated Advisor conversations. |
| Arabic composer ordering | PASS (live desktop) | SEND / MIC / separator / textarea / PLUS from right to left in screenshot. Mobile keyboard remains untested. |
| Advisor hostile request | PASS (live, limited) | Requested invoice creation, price change, customer deletion and product navigation. Returned read-only rejection, no route change or approval UI. Does not replace server/crafted-call coverage. |
| Advisor Plus menu | PASS (live) | Only camera and files shown. Escape closed the menu and restored focus to Plus. |
| Independent AI interface locale | PASS (live, limited) | Changing AI UI to English left the site's Arabic dashboard unchanged. Cross-account persistence is not yet tested. |
| Light mode contrast / site palette leakage | FAIL baseline; correction in #708 pending live retest | Active tab computed color `rgb(248,248,248)` over pale background. Scope/header/chat surfaces conflict with site palette. |
| Redundant Business dropdown / header stacking | FAIL baseline; correction in #708 pending live retest | Production DOM has a 61px header plus separate 57px scope strip. User Safari screenshots also show wrapped header tools. |
| Raw Markdown | FAIL baseline; correction in #708 pending live retest | User Safari screenshots show raw headings and emphasis. New compiled-renderer tests cover headings, emphasis, lists, flattened headings, inert HTML and preserved evidence callbacks. |
| Preview-only document request | NOT IMPLEMENTED / incomplete presentation observed | Two-item request returned textual preview-only tool result (2 × 10 and 3 × 20 USD) but no dedicated structured financial review opened. No approval or save was performed. |
| TypeScript / full production build | PASS (local automation) | `npm run typecheck`, `npm run build`, Node 24.19.0. This is not a live acceptance status. |
| Full Node regression | PASS (local automation) | 2523 PASS / 0 FAIL / 0 SKIPPED including 3 new executable Markdown renderer tests. |
| New preview deployment | BLOCKED | No automatic branch deployment; Vercel create-preview returned 403: permission denied for invoice. No authenticated Vercel CLI is installed. |
| Local build in cloud browser | BLOCKED | Local server started via Python; cloud browser returned ERR_CONNECTION_REFUSED for localhost. No visual test was completed on changed code. |
| iPhone/iPad WebKit, keyboard, all requested widths | BLOCKED / not run | Available browser is desktop Chrome; no viewport/WebKit capability advertised. User Safari screenshots are baseline evidence, not a retest. |
| Voice, uploads, interrupted approval, account/branch switching | BLOCKED / not run | Remaining authenticated scenarios must be completed; no microphone result or financial mutation is claimed. |

## Repair implementation / ownership

PR #708 (`fix/post-release-live-audit-20261012`) contains the following changes:

1. `src/styles/ai-conversation-workspace.css`: independent grayscale assistant tokens; no Light-mode override; local aliases for legacy descendant tokens only. Canonical compact header, charcoal user bubbles, single composer and simplified settings rows. Financial preview semantic colors remain scoped.
2. `scripts/ai-conversation-workspace.mjs`: existing build stage retires legacy declarations only for exact conversation elements owned by the typed stylesheet, retaining behavioral/menu/voice selectors. No new build stage or stylesheet.
3. `src/components/AiConversationWorkspace.tsx`: omits legacy context/scope strip from the ready conversation shell while keeping internal scope and data; safe React Markdown formatting retains original evidence buttons/callbacks and never interprets provider HTML.
4. `tests/ai-post-release-markdown.test.mjs`: executable tests against the compiled production helpers, including HTML-inertness and evidence identity.

Reproduction for visual defects: sign in on baseline Production, use site Light mode, open AI; inspect active mode, scope strip, settings; then compare the supplied Safari screenshots with a long response and Plus open. **None of these repairs is marked FIXED until the modified build is rendered and retested in a real browser.**

## Outstanding acceptance work

Create a Preview for PR #708's exact head in the existing invoice project, inspect its build/commit, then run visual and authenticated regression scenarios. Fix any resulting issues before marking ready or merging. Verify the new Production SHA and official domain after an approved, passing merge. The original broader audit is still open; do not present this slice as full acceptance.

---

# Historical pre-release evidence (superseded status)

## Independent pre-acceptance review — 2026-10-12

The release remains **BLOCKED / NOT APPROVED**. Review surfaced and repaired two approval-boundary defects on the existing **Draft PR #706** branch, without touching `main` or Production:

- **UI-only review acknowledgement:** the document approval button was hidden until review, but the approval executor did not enforce that acknowledgement. Business write approvals now require the exact active proposal to have been explicitly acknowledged, except the existing single-click workspace-navigation path. General non-document suggestions now register the acknowledgement in host state before enabling approval.
- **Post-persistence time-of-check/time-of-use gap:** the approval executor used the earlier account/role/scope decision after awaiting an IndexedDB persistence step. Immediately before calling the original execution callback it now reloads the live vault session and rechecks account/company/branch/thread, Controller mode, current proposal identity, acknowledgement and the original role/baseline/payload envelope. A changed context fails closed.

**Changes committed:** `e3ba503` (executor), `b2b40b7` (inline acknowledgement), `e701cef` (regression contracts).

**What was checked:** retrieved the updated branch source and verified all eight targeted boundary invariants, including check order before `apply()`. Two new Node source-contract tests were added to `tests/ai-living-workspace-preview-batch4.test.mjs`. **These Node tests have NOT been run in this connector-only environment.** No TypeScript, build, full test, browser or device gate is claimed to have passed.

**Additional integration blocker:** PR #706 is still one commit behind its stacked base PR #705 (diverged history). Do not squash or merge the stack without reconciling that ancestry and verifying the source tree preserves both changes.

**Infrastructure blocker:** no GitHub Actions checks/runs appeared on the current PR head; the connected Vercel deployment API denied authorized deployment inspection (403), so this audit cannot certify a Preview build. Do not treat empty checks as green.

# LOUREX AI Living Workspace — release QA gate

**Audit date:** 2026-10-12. **Release state: audit open; PR #708 Draft, no remediation Production release.**
This checklist is an execution gate, not an assertion that all checks passed.

## Post-release audit — current evidence supersedes the historical checklist below

PRs #703–#706 are merged. The actual audit baseline is main `ff512a8bbd983e65dc63d5238fe2befe754fd681`; do not merge the old stack again. Remediation is confined to feature branch `fix/post-release-live-audit-20261012`, PR #708. The original checklist below records the pre-release situation only.

Recorded live Chrome Preview inspection at PR head `522fbd79b143d3a191a2584caa38663770c597b5`, deployment `dpl_C5qJDBUYq5T4tFdbfL95ZFLnHXZ5`:

| Status | Scenario | Evidence / limit |
|---|---|---|
| FIXED | Black assistant, compact single header/composer, redundant Business dropdown, raw Markdown, white AI tool portals | Source owners consolidated in existing workspace/build stages; live assistant/settings/CFO inspected. Main site theme remains independent. |
| FIXED | Mode controls remained disabled after switching; transient tool presentation leaked across threads | Render after busy guard release; clear transient presentation on scope/thread changes. Live repeated mode switches verified. Saved messages retained. |
| FIXED | Assistant interface/reply locale overwritten by site locale | Independent interface preference and resolved answer locale carried through final formatter; live EN assistant over AR site and English local response verified. |
| PASS | Advisor hostile navigation request and restricted Plus menu | Read-only denial, no navigation or approval; only attachment controls exposed. This does not replace server/tool security tests. |
| PASS | Unsaved deterministic two-line document preview | Synthetic 2×10 + 3×20 = 80 USD; explicit item-two price 25 gives 95; UI Undo returns 80. Customer missing warning, approval withheld. No business record saved. |
| PASS | Assistant reduced motion | Saved Reduce motion preference; visible menu computed animation/transition 0s. Restored Follow device afterward. |
| FAIL pending live retest | Rejected proposal returns after reload | Dismiss cleared artifact but left mission steps awaiting approval; hydration reconstructed the rejected proposal. |
| BLOCKED | Provider-backed drafting/discussion on Preview | Deployment returns providers-not-configured error. No credentials or environment configuration changed. |
| NOT IMPLEMENTED / incomplete | Preview-only planner result | Read-only prepare result lacks a dedicated artifact bridge. This is distinct from the working manual draft preview. |
| BLOCKED | Safari/iPhone/iPad, virtual keyboard, eight-width device matrix | Available browser is Chrome; no real WebKit or viewport/device control. User Safari baselines are not Safari retest evidence. |
| BLOCKED / incomplete | Successful voice transcription, uploads, cross-device/account matrix | Not certified live. Do not infer PASS from Node coverage. |

### Rejected proposal restoration — remediation awaiting Preview retest

Reproduction: Controller → Workspace → Business → Deal studio → prepare an unsaved quotation → Decline → reload → reopen assistant. The proposal returned on Preview `522fbd7` despite direct rejection.

Cause: `dismissIntelligenceWorkspace` discarded only the artifact; `pendingMissionProposal` reconstructed a still-waiting mission during hydration. The original UI callback also cleared the proposal before the runtime callback could match it.

Fix: capture the exact proposal before the original dismiss callback; cancel its matching mission's waiting steps, clear the review identity, persist the cancellation. Block dismissal while approval/execution is busy. Preserve completed/uncertain results and all business records. Files: `src/components/AiConversationWorkspace.tsx`, `src/lib/ai-intelligence-runtime.ts`.

Regression: the actual runtime/store test rejects after the UI proposal is cleared, retains an earlier completed step/result, rehydrates from persisted state and asserts no returned proposal or artifact and no document write. Additional presentation fixes localize the busy label and activity disclosure; direct draft revision follows the independent reply preference.

Resumed live retest: secure sign-in completed; Vercel Preview `dpl_66y5EMQrqR1oYquwQzsdDidTirBZ` is READY (37s), exact source `c29661b5f57ec404aacfd6974419456aaf9e8261`. Applied the PWA update with no open editor. Controller → Workspace → Business → prepare unsaved commercial draft → Decline → reload → reopen assistant/workspace: no proposal restored and the pane states no document open. **FIXED** for direct rejection persistence. No business document saved. Current complete build/typecheck and 2530/0/0 Node suite passed again.

Live retest also verified black settings/Plus/composer over the Light site, independent EN assistant over AR site, English activity disclosure and message actions, and Advisor denying a combined navigation/delete/stock/invoice request with no route change or approval. Advisor Plus contains only Camera and Photos/files. Captured actual Chrome settings and Plus screenshots; these are not iPhone/iPad Safari retests.

### Transient legacy scope flash — additional live defect

Reproduction on `c29661b`: click Advisor and immediately inspect while its scoped conversation loads. The legacy Business dropdown briefly returned; typing was possible before hydration and then discarded when the target draft loaded. After hydration the dropdown disappeared.

Cause: the fail-closed render branch hid stale messages/proposals but returned legacy context and interactive composer unchanged. Fix in the same render owner: strip legacy context in both ready and loading states; disable all composer controls during unverified hydration; retain the LOUREX AI identity and explicit interface direction. The actual compiled render test now asserts absence of legacy scope, disabled input/send and absence of a stale proposal when props invalidate scope. Personal history remains retained. TypeScript, complete build and all 2530 tests passed. New Preview/live transition retest remains pending; Production acceptance stays open.

Live retest of `88624ab`: first Preview failed before source build with Git information retrieval failed. One normal Preview redeploy succeeded: `dpl_BjMxqksUT9PT9uFYXo1FSQETJHVm`, READY 33s, exact commit verified. Applied the PWA update with no editor open. Advisor → Controller immediately during hydration: no Business selector, both input fields and Plus/Send disabled. After hydration Controller controls recovered. **FIXED** for legacy selector flash and typing-before-hydration.

The same retest found a remaining presentation discontinuity: tabs/settings disappeared during hydration and tools shifted when Advisor removed the workspace trigger. Follow-up keeps the same two disabled, unselected tabs during unverified loading, retains the disabled settings slot, and uses an inert 44px workspace slot in loading/Advisor instead of exposing Controller actions. A single mode-tabs renderer serves both states. Regression asserts exactly two inert tabs without selecting an unverified mode. Live retest of this follow-up remains pending.

Site Light/Dark independence verified live on `c29661b`: assistant computed background rgb(8,8,8), text rgb(245,245,247); original Light site and inherited assistant UI preference restored. No accounting write, saved document, customer deletion or stock adjustment occurred.

Live chrome stability retest: `faae47d`, Vercel `dpl_ByhR3xujHt2A4SpyQUmpR1oR8gZn` READY 31s. Controller/Advisor settings button stayed at x=127,y=25 in the available desktop viewport. During Controller hydration, exactly two disabled tabs and disabled settings/composer remained, with no legacy Business selector. Controls recovered after hydration. **FIXED** for the reproduced transition discontinuity, within Chrome only.

### Conversational Undo and rejection after Undo

Correction to the earlier uncertainty: live exact `undo` works. An unsaved synthetic line 2 PCS × 10 USD = 20 was revised through `Set price item 1 to 15 USD` to subtotal 30, then `undo` restored price 10/subtotal 20. No saved record changed. **PASS** for this exact conversational command; broad natural-language equivalence is not implied.

Further live rejection regression on the same draft: after Undo, Decline → close/reload → reopen restored the superseded 15 USD / subtotal 30 proposal. **FAIL pending latest fix/retest.** This is distinct from direct rejection of a freshly prepared draft, which passed.

Cause: Undo restored an old review envelope from its snapshot. `stageReviewedMission` recognized the earlier cancelled approval and returned before superseding the newer pending mission; rejection cancelled the wrong historical mission, leaving the newer one recoverable. Fix: every actual conversational revision removes the review envelope from both returned proposal and working artifact before the existing stamping path gives it a fresh identity. Prior acknowledgement cannot authorize the new revision. New runtime/store regression performs prepare → edit → Undo → reject → persisted restart; asserts fresh review identity, previous pending cancellation, retained no-write behavior and no restored proposal.

The deterministic draft parser also accepts the explicit requested phrases `أرجع التعديل الأخير`, `ارجع التعديل الاخير`, `undo the last change` and `revert last change`; anchored matching refuses combined approval requests and quoted/explanatory occurrences. These operate on the unsaved working draft only. Latest source/build/tests and live retest must be recorded before marking the rejection-after-Undo defect FIXED.

Current follow-up validation: TypeScript PASS; complete build PASS; 2532 Node tests PASS / 0 FAIL / 0 SKIPPED. One earlier test run overlapped a still-running build and read intermediate dist assets; rerun after build completion passed, with no test changes to bypass those assertions.

Attachments live on `faae47d`: file chooser reports multiple=true; selected two synthetic TXT files with EN/AR numbers, both appeared as composer attachments, no auto-send, and both were removed successfully. **PASS** for multiple small text-file selection/removal only. PDF extraction, images, large-file limits, failed transfers and provider interpretation remain unverified.

Latest source `9d0ad284af38d82aeb19b53dd1e912da3f0e9939` (tested code tree `44968b471409496e3842325e41b6b1f71ae1b54a`): Vercel Create Preview returned `An unexpected internal error occurred`, and one bounded retry returned the same error without a new deployment. **BLOCKED** for latest rejection-after-Undo live retest. Last usable Preview remains `faae47d`. No merge/Production remediation release. Authenticated browser session retained for continuation; no password recorded in this ledger.

## Repository / PR stack
- Repository: `allidamech-bot/INVOICE` only.
- Base `main` at kickoff: `27ed9d54f615ecfea8dd73ab34fc072d3a4dcfa3`.
- PR #703: Foundation — Draft, unmerged.
- PR #704: Motion/composer — Draft, unmerged; based on #703.
- PR #705: Controller/Advisor separation — Draft, unmerged; based on #704.
- PR #706: Colored preview, tiny approval actions, independent AI settings and hardening — Draft, unmerged; based on #705.
- PR #706 diverged one commit from #705 during parallel hardening. Verify and reconcile its base **before** accepting the stack. GitHub reports PR as mergeable, which is not equivalent to verified release safety.
- The rejected exploratory `design/ai-workspace-ux-20261012` branch is not used.
- No direct changes to `main`. No Production deployment.

## Verification performed

| Gate | Result | Evidence/limitation |
|---|---|---|
| Branch file/source contract inspection | PASS | Verified mode, storage, language, preview and menu contracts in GitHub HEAD |
| Canonical menu JavaScript parser | PASS | Parsed actual `public/ai-composer-v449.js` with JS runtime syntax parser |
| Menu entrance, exit, rapid reopen | PASS — isolated | Executed production menu functions in a fake DOM; no real browser |
| Menu reduced-motion fallback | PASS — isolated | Executed actual function with a reduced-motion simulated environment |
| Automatic Arabic/English reply locale | PASS — isolated | Executed extracted production function body with six Arabic/English/neutral cases |
| Server proposal-sanitizer mode restrictions | PASS — isolated | Executed functions extracted from `api/ai-core.js` and `api/ai-advisor-v2.js`, stubbed sanitizers |
| Full TypeScript compile | NOT RUN | Whole repository source/build environment unavailable in current connector-only session |
| Production build script (all postprocessors) | NOT RUN | Must run independently to catch build-time visual owner collisions |
| Full Node test suite | NOT RUN | Required before merging |
| Browser sessions and account-scoped Firebase persistence | NOT RUN | Must use authenticated browser, not sample fixtures |
| Real provider/microphone/attachments | NOT RUN | Test provider failure, re-record and multipart uploads |
| iPhone/iPad real WebKit + keyboard safe-area QA | NOT RUN | Required before release |
| Updated Production commit and Vercel deploy | NOT VERIFIED / NOT DEPLOYED | Verify after explicit merge and deployment authorization |

## Recommended reproducible local verification

Use a clean checkout of **PR #706 head**, after reconciling its PR stack with #705, with the repository's configured Node and npm versions.

```bash
npm ci
npx tsc --noEmit
npm run build
node --test tests/ai-living-workspace-mode-foundation.test.mjs tests/ai-living-workspace-mode-integration.test.mjs tests/ai-living-workspace-motion-batch2.test.mjs tests/ai-living-workspace-preview-batch4.test.mjs tests/ai-living-workspace-preferences-batch4.test.mjs tests/ai-living-workspace-server-mode-policy.test.mjs
```

Then run the **entire** repository test suite using its canonical scripts in `package.json`. Do not weaken existing tests to make a new style pass. Do not assume GitHub Actions is available: prior user reported exhausted Actions credits.

## Authenticated live acceptance scenarios

1. **Arabic / RTL, 320/390/430px:** One-pill composer: physical rightmost SEND, then MIC, fine separator, right-aligned `اسأل LOUREX…` then PLUS at far left. No inner box/border. Keyboard does not conceal controls; iOS safe area is honored.
2. **English / LTR:** Deliberate mirror layout (where specified); no accidental bidi reorder of buttons, document IDs, amounts or currency.
3. **Controller vs Advisor:** Each mode has a distinct persisted conversation and draft. Account/workspace/branch changes cannot expose another company's records. Old threads without a mode are read-only Advisor; new threads start Controller.
4. **Advisor hostile-case testing:** Ask Advisor to navigate, delete, save a quotation, approve a staged product import, invoke a direct legacy draft shortcut, execute a local task/memory command. No tool mutation, route change, or approval should occur, even through crafted plans.
5. **Approvals:** Prepare document; open preview; check all lines, terms, totals and blockers; do not allow approval until acknowledgement. Revise the proposal and ensure a previous acknowledgement is invalid. Test double clicks, rejection, stale review, wrong company, expired token, interrupted app.
6. **Preview palette and math:** Functional accent colors confined to preview and + menu. No missing or malformed price shows as genuine zero. Subtotal explicitly excludes shipping, discounts, taxes. Verify saved/draft status and source.
7. **Menu/robot motion:** Open, fast-close, reopen, press outside and Escape, minimize/restore. No scroll jumps; respect device/AI reduced-motion preference.
8. **Settings:** Site locale EN with AI UI AR and answers EN; inverse AR site / EN AI UI; automatic language on Arabic vs English messages; reload and switch threads; verify settings remain account-scoped and business data unchanged.
9. **Voice:** Start/stop recording repeatedly, cancel and retry, recover mic permission denied, typed text remains editable, no automatic send without intent.
10. **Responsive:** 320, 390, 430, 820, 900, 901, 1024 and 1440px; tablets, desktop artifact pane, mobile preview, no overlay deadlocks, no nested-scroll trap, accessible 44px touch controls.
11. **Error resilience:** AI timeout, unavailable provider, no Firebase session, slow storage, failed attachment, switching tabs mid-action, stale async answer, exact accuracy and user-visible failure states.

## Release contract

No claim of completion, no PR ready-state, no merge, no Production deploy, and no user-facing "100% ready" until the full build and tests, security boundaries, authenticated browser acceptance, branch stack reconciliation, and release review are documented as passing.

# LOUREX AI — Living Workspace: Approved Design & Delivery Ledger

**Baseline:** `main` at `27ed9d54f615ecfea8dd73ab34fc072d3a4dcfa3` (checked 2026-10-12). The new experience is not yet shipped.  
**Repository:** `allidamech-bot/INVOICE` only.  
**Delivery:** isolated feature branches → tests → PR review → merge after acceptance; no direct main commits; no implicit Production deployment.

## 1. Verified code and CSS ownership audit

- `src/components/AiCopilot.tsx` owns the legacy launcher, modal, messages, proposal approval, message composer, and inline `AI_CORE_CSS`. Its legacy rendered label is "LOUREX Advisor" even while it exposes execution tools.
- `src/components/AiConversationWorkspace.tsx` adapts the rendered legacy tree, controls chat/artifact panes, renders the active document, and exposes twelve artifact subviews. Its toolbar currently exposes four old focus choices: auto/operator/advisor/financial.
- `src/styles/ai-conversation-workspace.css` applies highly specific selectors, `!important` layout ownership and fixed-width scroll behavior. Existing mobile breakpoints are 720/900/901px.
- `scripts/ai-conversation-workspace.mjs` changes compiled `dist/src/components/AiCopilot.js` and appends CSS into `dist/ai-composer-v449.css`. `package.json` has a long, ordered pipeline with many earlier AI and visual owners. Editing another late CSS selector is *not* an acceptable migration.
- `src/lib/ai-conversation-kernel.ts` currently keeps old focus values (auto/operator/advisor/financial); it also maintains artifact revisions and thread scope.
- `src/lib/ai-assistant-foundation.ts`, `src/lib/ai-foundation-approval.ts`, and `src/lib/ai-intelligence-runtime.ts` carry role, account/workspace/branch, approval-envelope, and duplicate-execution safeguards. Preserve these controls.
- The previous exploratory branch `design/ai-workspace-ux-20261012` is **not** this delivery line and must not be merged or imported blindly.

**Migration decision:** inventory the runtime visual precedence before replacing any owner; each visible element gets one final React owner and one scoped style owner. Remove obsolete overrides *as part of migration*, not after stacking new ones. Preserve tool workflows and current account isolation.

## 2. Signed-off visual and interaction contract

### Chat shell / desktop / tablet / mobile
- Two distinct conversation modes only: **المتحكم / Controller** and **المستشار / Advisor**. Arabic: Controller tab on the right; Advisor on the left. These **are not** the legacy `personal/business/temporary` account scopes; maintain separate thread history/drafts without losing existing data.
- Conversation chrome: grayscale black/white, neutral text, subtle grays, strong accessibility contrast. Functionally colored surfaces are reserved for the plus menu and financial document previews.
- Below the tabs: one *persistent*, short **centered** description in a gray, subtly rounded strip, with a small mode-related icon. One line where feasible, RTL correctly and truncation avoided.
- One compact pill composer, not an input-inside-an-input. In **Arabic physical order right → left**: SEND | MICROPHONE | vertical hairline | right-aligned «اسأل LOUREX…» | PLUS. The plus occupies the far LEFT. Mirror deliberately for English; do not let Unicode bidi reorder the controls.
- Plus menu: floats ABOVE the composer, does not reflow the chat; muted colored icons; keyboard/escape/outside dismissal; fade + 8–12px rise + subtle scale, 220–280ms. Options adapt to mode; hide unauthorized tool entries.
- Inline action suggestions and approval/decline: compact, rounded, context-adjacent, physically to the left in Arabic where layout allows. Enter with opacity and transform, 170–240ms; no blocking half-screen approval banners. Visual size compact, touch target ≥44px. No implied approval by merely opening a preview.
- Financial preview: business-document hierarchy (client, metadata, quantities, prices, terms, delta, totals, exclusions, source and unknowns); meaningful blue/green/gold/warning accents **inside preview only**. Distinguish draft from saved record, subtotals from final amount, and missing prices from zero.
- Desktop: conversation next to resizable or bounded artifact work area; tablet: accessible adaptive layout; mobile: dedicated preview view or sheet, safe-area and keyboard aware. Do not scroll trap.
- Launcher robot: gentle rare idle movement, glance or blink, visible thinking/responding states, no nonstop bounce. Prefer-reduced-motion disables nonessential movement.
- Response style: concise for simple requests; structured sections/real currency formatting for accounting questions; never fabricate financial numbers; deterministic financial calculations and provenance.
- Settings *inside AI, separate from site settings*: interface language inherits site by default, answer language auto/AR/EN/bilingual, verbosity, reduced motion, voice transcript review, font size, history/privacy, optional safe advanced provider diagnostics. AI interface language, reply language and document output language are distinct.

### Mode trust contract
**Controller** can suggest navigation, prepare preview and request permitted mutations, but only under existing role/branch/account/approval/idempotency rules.

**Advisor** is **read-only discussion/analysis**. No `workspace.navigate`, `document.createDraft`, `document.updateDraft`, `tool.execute`, `tool.plan`, write, message-send or route-change calls. Read-only capabilities must be explicitly allowlisted, and scoped source access validated. Tool restrictions must be enforced at dispatch/execution, not merely by hiding buttons.

Existing personal/business/temporary scopes are independent from Controller/Advisor. Plan deliberate migration of old threads and staged artifacts without silent cross-mode leakage.

## 3. Five delivery batches — no patch stacking

| Batch | Scope | Acceptance gate |
|---|---|---|
| **1 Foundation / audit** | Code+owner inventory, UX spec, pure mode and settings contracts, test guardrails | No runtime/visual alteration; safety tests pass; baseline documented |
| **2 Conversation shell** | Single presentation owner migration, tabs, centered strip, composer, menu+motion, launcher, responsive layout | RTL/LTR, mobile keyboard, iPad/desktop, real click paths and reduced-motion verified; no redundant old owners |
| **3 Mode separation / trust** | Real Controller vs Advisor tabs, read-only tool routing, mode-scoped thread history, fail-closed legacy migration | Advisor cannot navigate or mutate even via crafted tool calls; account/branch isolation and persistence tested |
| **4 Previews / intelligence / settings** | Contextual suggestions, diff/approval layout, safe outcomes, document palette, separate AI language settings, voice and evidence-aware financial responses | Explicit approval, stale review, double click, deterministic totals, correct bilingual preview, no invented data |
| **5 QA / release** | End-to-end authenticated Chromium/WebKit; mobile 320/390/430, tablet 820/900/901/1024, desktop 1440, AR/EN, light/dark site, offline/retry | No regressions; no auth data loss; check Production commit and deploy only after approval |

## 4. Non-negotiable controls

1. No direct `main` commits; no Production deployments without explicit release acceptance.
2. No new packages, unrelated redesign, Firebase/PIN regression or destructive account/thread migration.
3. Preserve the existing execution approval envelope, safety receipts, and company/branch/account checks.
4. No fake AI/backend integration claims. A render/mock or passing unit test is not real authenticated live acceptance.
5. Do not merge exploratory design branch `design/ai-workspace-ux-20261012`.
6. Do not assume GitHub Actions credits are available; use available local/targeted testing when possible, label blocked verification accurately.
7. When removing build-time owners, identify each legacy contract and test before disabling the stage; maintain offline/PWA asset versioning.

## 5. Batch 1 implemented here

`src/lib/ai-conversation-mode.ts` establishes a **pure**, typechecked mode/settings contract. Unknown stored mode values fail closed to read-only Advisor; Advisor capability matching uses a closed allowlist. The function is an additional *deny-only* filter, not permission grant. No runtime is wired to it in Batch 1, so neither existing UI nor business action policy changes prematurely.

**Pending for Batch 2 / 4:** integrate this contract into authenticated dispatch and tool execution, add conversation-mode persistence, then perform visual owner consolidation. Until this is done, the current UI's old focus labels do not provide Advisor isolation.

## 6. Batch 2 delivery slice — existing owner integration

- **Motion**: `public/ai-composer-v449.js` now animates open *and* close using the existing menu owner, with rapid-toggle cancellation, `inert`/ARIA state, keyboard focus restoration and reduced-motion fallback. The prior conflicting CSS keyframe is retired in the original `public/ai-composer-v449.css`; no new build stage or stylesheet was introduced.
- **Composer**: existing `scripts/ai-conversation-design-batch1.mjs` composition rules now produce a compact single pill, neutral send control, subtle separator between voice/text, and correct source placeholder «اسأل LOUREX…». Existing physical LTR flex ordering positions SEND on the right, PLUS on the left while Arabic text remains RTL/right aligned.
- **Launcher**: one rare ~2px idle nudge per 11 seconds from that same visual owner; reduced-motion and hover/focus opt-outs.
- **Tests**: `tests/ai-living-workspace-motion-batch2.test.mjs` includes a no-package runtime fake-browser harness for open/close, rapid reversal, no-animation fallback, and source contract assertions. Static source checks and a minimal in-memory motion smoke check were performed; full `npm run build`, full tests and authenticated real-browser QA are **not** claimed.
- **Out of scope of this delivery slice**: the two live Controller/Advisor tabs, mode-scoped history, enforceable advisor policy in tool orchestration, finance preview restructuring, universal palette consolidation. These remain mandatory before marking Batch 2/4 complete. This branch must not be merged as the finished experience.


## 7. Batch 3 — mode isolation and actual UI (work in draft)

- Conversation kernels gain a persisted mode. New threads explicitly begin in Controller; old/malformed stored threads without valid mode become read-only Advisor without deleting history.
- The typed React workspace displays **Controller / Advisor** tabs and the centered gray description. Four old focus selectors are no longer shown; stored focus values remain readable.
- Switching modes selects an existing scoped thread or creates a new one before assigning its mode; threads containing prior turns/artifacts cannot be relabeled. Volatile unsent text is keyed by the full account/workspace/branch/thread scope.
- Advisor tool planning and execution permit only read/calculate tools. Validation denies model plans with mutate/navigate/prepare tools; direct tool execution denies them again. Approval, workspace editing, saved-document open and staged draft edits are blocked.
- The unified + menu hides execution/navigation entries in Advisor; legacy saved-artifact buttons are filtered in the typed presentation owner.
- New typed mode module is included in service-worker module identity hashing.
- Tests: tests/ai-living-workspace-mode-integration.test.mjs covers actual compiled tool calls after a build, malformed-kernel migration and UI/tool guards. Full build, regressions and authenticated browser checks have NOT been run in this session.

### Remaining release blockers

- Verify dynamic switching and account-scoped thread hydration in authenticated Chromium and WebKit; fix any discovered regressions before promoting this draft.
- Consolidate old CSS owners; complete grayscale chat palette, financial preview and inline approval UI, AI settings, audio and sources.
- Preserve true execution authorization on all legacy workflow shortcuts; not all legacy routes have been live-audited.

## 8. Batch 4 — financial document preview and inline approval (draft)

- In the existing typed React workspace, the **Preview** tab no longer duplicates the horizontally scrolling edit grid. It presents all real scoped line items as legible cards, with deterministic `lineTotal` figures; blank/invalid quantities or prices display an unknown marker, never a fabricated amount or misleading 0.00.
- Actual client/currency, saved-vs-working status, delivery/payment terms, complete diff, and approval blockers are visibly distinct. The item **subtotal is not final total**: tax, discount and freight are explicitly excluded. Color accents are scoped to the document preview (navy / blue, green, gold, warnings); chat remains grayscale.
- Document action proposals in the chat use a short, animated inline **Review details** affordance. The original legacy proposal card is no longer duplicated or exposed in the typed chat for these document actions.
- Opening a preview does not count as approval. After examining the document, **I reviewed the details** sets a volatile reference to the exact proposal under review and returns to chat; only then are the existing callback-bearing **Approve** and **Dismiss** buttons shown as compact accessible pills. Draft blockers disable completion. A subsequently revised proposal does not inherit the earlier review acknowledgement.
- The pre-existing approval execution callbacks and foundation envelopes remain responsible for applying/rejecting mutations. This code does not implement new raw mutation endpoints.
- A new targeted test, `tests/ai-living-workspace-preview-batch4.test.mjs`, covers deterministic amounts, scoped invoice preview fixture, every row/term/diff, visual semantic sections and reviewed-before-approval contract.

**Still unverified:** full TypeScript / production build, authenticated live navigation and preview rendering on iPhone/iPad/desktop, source JS layering. This PR must remain Draft until validation. Legacy orchestration-specific tool approval surfaces beyond the typed proposal node require later consolidation.

## 9. Batch 4 continued — AI settings and general suggestions (Draft)

- `src/storage/assistant-store.ts` now stores normalized **AI-only interface/reply language, response detail and motion preferences** in the existing per-account encrypted assistant state, not in site/company settings. Thread upserts preserve them and malformed legacy values reset safely.
- `src/lib/ai-intelligence-runtime.ts` saves preferences through the same promise queue as thread persistence; it checks authenticated account identity again before a write and after saving to prevent cross-account confusion. UI surfaces save errors. Explicit AR/EN response language is passed to LOUREX AI contexts and deterministic tool orchestration; server/model language compliance still requires an end-to-end check.
- A small AI settings panel now exposes inherit/Arabic/English UI language, automatic/Arabic/English answer language, balanced/brief/detailed answer length request, and system/reduced animation. The AI shell and composer use its independent interface locale and RTL/LTR direction. The full legacy Gemini response body and every old extension have not yet been audited for locale override compliance.
- Reduced motion preference disables the unified plus animation and optional robot idle movement; device-level `prefers-reduced-motion` stays respected.
- Ordinary non-document proposals using the legacy `lourex-ai-proposal` React node now display compact navigation/actions rather than a blocking card. Non-navigation approvals are shown only after opening details and acknowledging review. Original execution callbacks remain intact; declining remains available without forcing review, including for blocked documents. Separate orchestration-specific approval components still need QA.
- Tests: `tests/ai-living-workspace-preferences-batch4.test.mjs` covers normalization and persistence through separate threads; expanded preview tests cover compact suggestions and review-gated approval.
- Verification completed here: fourteen source/runtime-helper checks and an extracted account-safe preferences save function test with a fake store. These are **not** real IndexedDB, TypeScript, production build, browser, provider or Firebase end-to-end tests.

**Outstanding:** real-browser verification of the 160ms safe decline exit, full mobile/iPad/desktop live QA, CSS owner consolidation, actual provider style compliance and safe release acceptance. No branch here should be merged as the finished product solely from static checks.

## 10. Inline rejection completion

- Both document and non-document suggestion surfaces expose **Decline** immediately, even for blocked documents; accepting a change remains gated on explicit review.
- On normal-motion devices, rejecting animates out for 160ms, then invokes the preexisting dismissal callback. The callback is skipped if the proposal was superseded, and timers are cancelled on unmount or proposal change. No business mutation is performed by this animation.
- Device-level and AI-specific reduced-motion preferences bypass the delay and motion. The behavior has source contract coverage but still requires live browser QA.

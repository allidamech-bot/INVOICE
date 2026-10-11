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
| **3 Previews and approvals** | Contextual suggestions, preview/diff layout, small approve/reject, status/undo semantics | Explicit approval, rejection, stale review, double click, errors, item totals and preview parity verified |
| **4 Intelligence / settings** | Real Controller vs Advisor dispatch guard, separate histories/preferences, language overrides, voice and evidence-aware responses | Advisor cannot navigate or mutate even via crafted tool calls; scoped data and deterministic financial reports; persistence migration verified |
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

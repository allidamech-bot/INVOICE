# LOUREX AI — Batch 2: Conversation Workspace & Generative Business UI

## Scope and exact baseline

- Approved Master Handoff V1.1 was reread in full (180 lines) before starting Phase 2. The owner's subsequent “التالي / اكمل” authorizes this next phase; merge and Production release remain excluded.
- Repository: `allidamech-bot/INVOICE` only.
- Main reverified: `00117b9b7109c82e34b9fcc0c8fafe6cd03a4e61`.
- Phase 1 PR #693 remains open, unmerged and mergeable at inspection. Its head, `c4ee50fb183ee7bf346edd3ad3e43b49dc8b6d82`, is this branch's parent.
- Feature branch: `ai/conversation-workspace-20261011`. The Phase 2 PR targets the Phase 1 branch so review shows only this batch. Do not merge either PR without owner approval.
- Production alias: `https://invoice-three-puce.vercel.app`. No Production deployment, configuration, database or account data was changed in this phase. Its deployment SHA was not reread in this phase; main verification alone is not a new Production verification claim.
- No new dependencies, provider accounts, hosted database, paid service, non-AI workflow changes, or Phase 3/4 implementation.

## What was inspected

The audit reused the Phase 1 source→installer→compiled-runtime→endpoint→tool→approval map in `LOUREX_AI_INTELLIGENCE_FOUNDATION_BATCH1_2026-10-10.md`. Inspected the current `AiCopilot.tsx`, final generated `AiCopilot.js`, latest conversation/design/voice owners, encrypted assistant lifecycle, draft review and create/update approval guards, and scoped vault/reference APIs.

Proven gaps relevant to this phase:

1. The final proposal presentation is a text preview plus approval buttons; it has no first-class stable-ID pricing grid tied to working revisions. The new grid stages validated decimal/text edits against the same artifact the conversation uses.
2. Structured artifacts hydrate only on conversation requests in Phase 1. Opening history or a workspace without a request needs scoped hydration. The new adapter hydrates on open/thread changes and rechecks after parent prop changes.
3. Conversation history's new/delete instance callbacks discard their promise with `void`. Awaiting a wrapper therefore did not await completion. The new installer changes only those two callback return contracts and fails the build if their exact audited tokens drift.
4. Dismissing the old proposal did not clear the durable kernel artifact. The new dismissal removes the working artifact from its existing encrypted thread and leaves business records untouched.
5. Current reference/model-context row limits are unsuitable as a read-only all-row document preview. The workspace reads the scoped local document and pages all its rows; the model extraction and write limits remain intact.

No new live Production defect or mobile visual acceptance is claimed from source inspection.

## Implemented behavior

- One precompiled TSX workspace layered over the actual final chat runtime. Existing conversation messages, composer, history, attachment extraction, tools, voice owner, domain guards and approval handlers stay connected.
- Collapsible document workspace next to chat on desktop and sufficiently wide iPad layouts; single primary pane with a Back to chat action on phones. Scoped light ivory/green and dark existing token surfaces; no non-AI selectors or changes to the approved business-page design.
- Focus selector: Auto, Operator, Advisor, Financial expert. It updates kernel specialization/context, never role authorization.
- Whitelisted component descriptors: CustomerPicker, ProductPicker, EditablePricingGrid, QuotePreview, QuoteDiff, AttachmentGallery, EvidencePopover, ApprovalDiff. Runtime descriptors accept only bounded plain rows. Unknown components, extra props, URLs, handlers and arbitrary HTML/code instructions are rejected; React renders strings as text. Interactive callbacks originate in application code only. This is schema-based presentation of typed local facts, not execution of generated model code.
- Exact-ID customer/product selection, searchable paged results and visible IDs for duplicate names. Explicit selection updates the proposal and shared working entity. Prices transfer only when recorded currency matches; mismatched/missing prices remain missing and block approval. No inferred FX.
- Stable-ID pricing grid with an explicit editing mode, mixed Arabic decimal normalization, positive quantities, nonnegative prices, field/text limits, optimistic artifact revision checks, and no vault mutation. Invalid entry is reverted to the reviewed display and the error remains visible in the workspace.
- Preview derived from the exact working proposal, using existing deterministic decimal/BigInt line arithmetic and review rules. Subtotal is explicitly separate from tax, discount and freight. Missing data stays unknown. Saved record previews read the real scoped local record and preserve all rows, including 30-row bilingual documents.
- Draft/unsaved and Saved in LOUREX badges; attached/source material is marked unverified. Saved preview has no edit or save controls and does not fabricate a final invoice/PDF.
- Latest field diff, a bounded earlier-version timeline with paged read-only snapshots, draft undo/redo, and the original guarded approval buttons. Approval is disabled while a cell command is pending. Each accepted draft edit restamps its approval and recomputes review blockers against current scoped data.
- Attachment gallery for current transient attachments. Raster previews use object URLs that are revoked on close/unmount; PDF links open the original local blob. No arbitrary remote URL or active SVG/HTML preview. Existing extraction review flow is reused.
- Scope/thread/account transitions clear volatile evidence/file references and hide stale working facts until the correct scope has loaded. Personal gets the original personal chat without business workspace. Temporary stays nonpersistent using the existing foundation boundary.
- Phone workspace geometry responds to visualViewport resize/scroll, with safe-area padding and contained scrolling. New controls have 44px minimum hit targets; keyboard focus and existing dialog ownership are preserved. No new microphone implementation replaces the tested voice owner.

## Runtime ownership and changed files

1. `src/lib/ai-workspace-model.ts`: scoped typed presentation, deterministic preview/diff, draft-only commands, strict descriptor validation.
2. `src/components/AiConversationWorkspace.tsx`: registered display components, grid, pickers, previews, timeline, focus, scoped lifecycle and render adapter.
3. `src/lib/ai-intelligence-runtime.ts`: workspace hydration, serialized draft commands, current-role/scope/staleness checks, encrypted persistence and dismissal; approval race guard.
4. `src/styles/ai-conversation-workspace.css`: AI-only responsive workspace owner.
5. `scripts/ai-conversation-workspace.mjs`: minimal fail-closed final render/lifecycle compatibility shim; no product logic in the installer.
6. `package.json`: one installer after `ai-intelligence-foundation.mjs`, before `ai-voice-final-runtime-hash.mjs`.
7. `tests/ai-conversation-workspace.test.mjs`: deterministic acceptance, real runtime + encrypted store and actual compiled render adapter tests.
8. `tests/visual/ai-conversation-workspace.html`: isolated local encrypted fixture with duplicate customer IDs, cross-currency product, three-line working quote and 30-row bilingual saved record; no provider or Production connection.
9. This report.

Canonical path: existing final AiCopilot mount/ask/approval → foundation runtime → typed workspace adapter/model → existing scoped draft review → original approval boundary → original guarded vault mutation. The new UI does not bypass the transaction engine. This preserves the audited installer chain; removal of old monkey-patches is not attempted in this phase.

## Validation

- `npm run typecheck`: passed.
- Full ordered `npm run build`: passed, including the new compatibility contract and final voice hash owner.
- Full suite with `TZ=UTC node --test --test-concurrency=2 tests/*.test.mjs`: **2366 passed, 0 failed, 0 skipped, 0 cancelled** (28,436.91 ms). Phase 1 baseline: 2350; 16 added tests.
- Three relevant financial files additionally run with `TZ=Europe/Istanbul`: 23 tests passed, 0 failed.
- `git diff --check` and local HTML fixture module JavaScript syntax: passed.
- Important clock-dependent baseline finding: at UTC midnight while the process timezone was `America/Chicago`, the same full suite had 2363 passes and 3 failures. All three failures were reproduced on an isolated unchanged Phase 1 checkout. Local `todayIso()` still reported October 10 while new UTC `createdAt` was October 11; `paymentKnownOnOrBefore` excluded those supplier payments. Neither those implementation files nor their tests were modified. UTC aligns with the declared execution timezone; the passing rerun does **not** fix or conceal this separate baseline timezone defect. Its financial/business-workflow fix needs an approved scope.

The added acceptance cases cover descriptor injection rejection, exact duplicate-customer choice, company/branch isolation, stable third-line edits, Arabic decimals, stale revisions, invalid quantities and field injection, undo/redo, added/existing update line IDs, product currency mismatch, explicit add limits, 30-row preview integrity, missing-price handling, focus isolation, registered-price preview/approval consistency, real AES-GCM persistence/restamping, viewer rejection without partial UI state, durable dismissal, final build ownership and the actual compiled render adapter's placement/isolation behavior.

## Browser acceptance limitation and remaining risks

- Interactive browser acceptance is **not complete**. The local Playwright dependency is available but its Chromium/WebKit executables are absent. Official browser downloads returned an HTML “Site Unavailable” response instead of browser archives. The cloud browser cannot reach this container's `127.0.0.1:4173` (`ERR_CONNECTION_REFUSED`). These are environment limitations, not evidence that LOUREX or the feature is broken. No screenshot, mobile layout, Windows, physical iPhone/iPad, repeated microphone or live-provider success is claimed.
- Before release, run the local fixture and genuine authenticated supported user journeys in Arabic/English, Light/Dark, phone/iPad/desktop; verify cell→diff→approval→saved record, 30-row pagination, keyboard viewport, focus restoration, attachment close/reopen and repeated voice. The fixture's setup is synthetic local data only and must not be added as a Production route.
- Static geometry and fake-React render-adapter assertions do not substitute for browser rendering or assistive-technology acceptance. Thus this PR is a **draft**, pending browser/visual acceptance and owner review.
- The registry does not authorize arbitrary UI suggested by a model; only registered typed-fact projections are connected. Mission progress, FinanceScenario, SourceCompare and commercial/research engines remain Phase 3/4 scope.
- The reproduced existing financial timezone defect can hide a newly created payment from a same-day payable report in negative UTC offsets after UTC midnight. It is separate from the new workspace and remains unresolved; must be addressed before acceptance for those locales.
- Existing 20 added/create lines and 30 updated lines approval limits are intentionally retained. All-row reading is separate from these write limits. Descriptors over the explicit display budget are rejected rather than truncated.
- A preview shows deterministic item subtotal and terms, not the full document tax/discount/shipping calculation or finalized PDF. The full existing document view remains the authority for those outputs.
- Earlier update-proposal snapshots are reconstructed against the current scoped base document. Current approval snapshot guards reject stale business state, but the timeline is not a historical immutable document archive.
- Approval replay receipts and business vault remain separate encrypted stores, as documented in Phase 1. Crash-uncertain attempts remain blocked; this phase does not claim cross-store atomicity or reconciliation.
- Optional desktop pane resizing is deferred until actual browser feasibility testing; collapse/split layout is implemented. No responsiveness SLO or live-provider latency has been invented.

PR: created after verification; see final task response and GitHub PR metadata for exact head/tree identity. No merge or Production deployment is authorized by this report.

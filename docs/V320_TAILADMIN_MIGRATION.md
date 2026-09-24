# LOUREX v320 — TailAdmin Finance full UI migration matrix

This branch replaces the legacy LOUREX visual system with the TailAdmin Finance design language. **UI implementation is now complete; visual/device QA is intentionally deferred until the user finishes reviewing the design.** No unit/security/build/Actions work should interrupt the design-review phase unless explicitly requested.

## Guardrails
- Preserve v318 persistence, iPhone/Safari stability, encrypted vault, PIN, Firebase/Auth, accounting calculations, document lifecycle, PDF and print behavior.
- No direct commits to `main`.
- No production publish before final visual review and verification.
- Preview deployments are manual/intentional only; feature branches must not auto-deploy on every commit.
- TailAdmin Community/MIT assets and patterns may be reused with the required copyright/license notice. Proprietary TailAdmin Finance source is not copied unless a licensed source package is supplied.
- v320 prefers structural replacement. Where a security/reliability-sensitive component keeps its proven semantic markup, TailAdmin must still be its sole visual owner and the legacy visual owner must be retired.

## Coverage matrix

| Surface | Status | Batch |
| --- | --- | --- |
| Global TailAdmin tokens, typography, buttons, inputs, focus states | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 1-2 |
| Desktop shell/sidebar/topbar/search | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 2 |
| Mobile shell/navigation/create menu/more sheet/safe areas | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 2 |
| Home / Finance dashboard | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 1-3 |
| Documents register/search/filter/detail | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 1-3 |
| Document editor frame / step navigation | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 3 |
| Commercial document editor core | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 3 |
| Draft Studio / editor inner sections | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 3 |
| Document attachments / preview | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 3 |
| Customers + customer profile | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 4 |
| Products & Inventory | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 4 |
| Purchasing / suppliers / operations | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 5 |
| Finance / receivables / collections / expenses | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 5 |
| Reports / analytics | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 5 |
| Settings / Account / Security / PIN | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 6 |
| Authentication / onboarding / lock screens | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 6 |
| Cloud conflict / account recovery | IMPLEMENTATION COMPLETE / VISUAL QA DEFERRED | 6 |
| AI surfaces / approval / activity audit | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 6 |
| Modals / popovers / menus / global search / empty states | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 7 |
| Recovery / PWA refresh / iOS output fallback | TAILADMIN OWNER COMPLETE / VISUAL QA DEFERRED | 7 |
| RTL Arabic design rules | IMPLEMENTATION COMPLETE / DEVICE QA DEFERRED | 7-8 |
| Light/Dark design parity rules | IMPLEMENTATION COMPLETE / DEVICE QA DEFERRED | 7-8 |
| iPhone/iPad/Safari geometry + safe-area rules | IMPLEMENTATION COMPLETE / DEVICE QA DEFERRED | 7-8 |
| Final no-legacy-visual owner audit | STATIC DESIGN AUDIT COMPLETE | 8 |
| Final unit/build/visual verification | DEFERRED UNTIL AFTER DESIGN REVIEW | 8 |

## Batch 2 — Shell structural replacement

`AppShell.tsx` renders the TailAdmin application frame directly: desktop sidebar, grouped navigation, top bar, account affordance, sync state, create-document menu, mobile bottom navigation and mobile More sheet.

Navigation callbacks, Firebase sign-out, encrypted session clearing, cloud-conflict handling, AI navigation, create-document actions, overlay focus trapping and iPhone safe-area behavior remain functionally owned by existing LOUREX logic.

## Batch 3 — Dashboard, documents and editors

`WorkspaceHome.tsx` owns a TailAdmin Finance dashboard hierarchy while LOUREX report, receivables, payments, inventory and daily-brief libraries continue to own calculations.

`DocumentsPage.tsx` owns the document register and detail hierarchy. Search, filters, lifecycle/status, quotation conversion, payments, credit notes, attachments, PDF/share preparation, keyboard navigation and iPhone attachment-memory safeguards remain unchanged.

`EditorPage.tsx` supplies the TailAdmin editor frame and step hierarchy. The commercial editor core and `DraftDocumentEditor.tsx` intentionally keep their proven semantic editing markup because those components contain autosave, revision single-flight, final-document locking, departure flush and iPhone/Safari safeguards. Their historical visual owners are retired; `tailadmin-editor-core-v320.css` is the application-editor presentation owner.

`tailadmin-draft-finish-v320.css` gives Draft Studio its dedicated TailAdmin hierarchy for the top bar, numbered sections, page presets, content blocks, watermark controls, A4 preview and mobile action bar without changing Draft persistence/output behavior.

`tailadmin-attachments-v320.css` owns the attachment gallery and preview while the encrypted attachment data path remains unchanged.

## Batch 4 — Customers and products

`CustomersPage.tsx` uses a TailAdmin customer directory/profile hierarchy while preserving duplicate detection, dirty-state protection, before-unload protection, credit controls, statements and customer-to-document creation.

Products & Inventory use TailAdmin workspace structure with domain tabs, KPI summary, catalog command bar, list/editor split, import workflow and inventory/purchase-history entry points. Product dirty-state protection, selection/bulk deletion, duplicate SKU/product checks and import safeguards remain unchanged.

## Batch 5 — Purchasing, finance and reports

`OperationsPage.tsx` renders TailAdmin-native Suppliers, Purchases, Expenses and Inventory workspaces. Purchase posting/reversal, landed-cost allocation, inventory movement generation, manual movement rules and unsaved-workspace protection remain unchanged.

`ReceivablesPage.tsx` renders the TailAdmin Finance receivables dashboard, aging table and customer account register. Payment recording, statement generation/printing and strict per-currency accounting remain unchanged.

`ReportsPage.tsx` renders TailAdmin report filters, currency KPIs, monthly performance and customer performance tables. Period normalization, no-FX currency separation, CSV formula hardening, print/PDF behavior and profitability withholding when cost data is incomplete are preserved.

## Batch 6 — Settings, account, security and AI

Settings, Account, company artwork, commercial defaults, document defaults, cloud recovery, session locking and PIN management now render through the TailAdmin settings hierarchy. Save validation, AI background removal, encrypted cloud restore, auto-lock and PIN callbacks were preserved.

Account entry, account creation, Google authentication/linking, initial workspace setup, PIN unlock and one-time legacy PIN upgrade now use TailAdmin gateway markup. Firebase persistence ordering, UID-scoped storage activation, encrypted vault migration and account recovery behavior remain unchanged.

The LOUREX Advisor keeps its existing capability/approval/audit semantics because they are tightly coupled to deterministic local accounting context and guarded vault mutations. Its historical injected dark stylesheet is retired and `tailadmin-ai-v320.css` owns the surface. `tailadmin-ai-finish-v320.css` completes the readability hierarchy for messages, proposals, audit metadata and mobile nudge presentation.

## Batch 7 — Global overlays and reliability surfaces

`tailadmin-overlays-v320.css` owns Modal/ConfirmDialog presentation, global search, segmented controls, popovers, menus, toasts and generic empty states while focus trapping and keyboard handling remain in React.

`tailadmin-visual-finish-v320.css` applies the final cross-workspace hierarchy/readability pass so TailAdmin cards, tables, KPI labels, settings, auth and editor metadata do not regress into micro-text.

`tailadmin-reliability-bridge-v320.css` re-expresses the loading cover, app recovery screen, PWA/cloud refresh notices, iOS output fallback, sign-out shield and mobile focus geometry in the TailAdmin system without changing their runtime behavior. It intentionally does not retheme application workspaces.

`tailadmin-utilities-v320.css` owns shared theme controls and residual utility presentation. `tailadmin-attachments-v320.css` replaces the attachment portion previously supplied by the v300 visual layer.

## Batch 8 — Legacy owner retirement

`index.html` retains only base/component/output support and reliability geometry required by existing React/runtime behavior, followed by the v320 TailAdmin owners as the final application-UI cascade. The canonical A4 document layer remains separate because it owns invoice/quotation/PDF presentation rather than the application shell.

`public/home-final-closeout-v286.js` no longer installs historical application visual generations. It acts as a defensive owner boundary: it removes known legacy application styles if an old cached/runtime path reinjects them, removes the old inline AI stylesheet and normalizes the TailAdmin canvas/theme color.

`public/document-entry-v302.js` recognizes the TailAdmin create menu, preserves selected Light/Dark boot colors, injects only retained reliability layers, and re-promotes TailAdmin styles after those runtime layers so a retained compatibility stylesheet cannot retake application visual ownership.

`scripts/v303-visual-cache-refresh.mjs` promotes the offline cache generation to v320 and keeps the v320 application runtime set isolated from retired visual generations.

## Acceptance rule
Design implementation is complete on the branch. Final release acceptance is intentionally separate: after the user reviews the actual rendered website, visual/device QA and the technical verification suite can be run. No partial legacy application visual ownership is accepted at release.
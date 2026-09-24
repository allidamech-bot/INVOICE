# LOUREX v320 — TailAdmin Finance full UI migration matrix

This branch replaces the legacy LOUREX visual system with the TailAdmin Finance design language. The release is not considered complete until the migration, no-legacy visual-owner audit and final Arabic/English + Light/Dark + responsive verification are all green.

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
| Global TailAdmin tokens, typography, buttons, inputs, focus states | STRUCTURE DONE / QA PENDING | 1-2 |
| Desktop shell/sidebar/topbar/search | STRUCTURE DONE / QA PENDING | 2 |
| Mobile shell/navigation/create menu/more sheet/safe areas | STRUCTURE DONE / QA PENDING | 2 |
| Home / Finance dashboard | STRUCTURE DONE / QA PENDING | 1-3 |
| Documents register/search/filter/detail | STRUCTURE DONE / QA PENDING | 1-3 |
| Document editor frame / step navigation | STRUCTURE DONE / QA PENDING | 3 |
| Commercial document editor core | TAILADMIN OWNER DONE / QA PENDING | 3 |
| Draft Studio / editor inner sections | TAILADMIN OWNER DONE / QA PENDING | 3 |
| Document attachments / preview | TAILADMIN OWNER DONE / QA PENDING | 3 |
| Customers + customer profile | STRUCTURE DONE / QA PENDING | 4 |
| Products & Inventory | STRUCTURE DONE / QA PENDING | 4 |
| Purchasing / suppliers / operations | STRUCTURE DONE / QA PENDING | 5 |
| Finance / receivables / collections / expenses | STRUCTURE DONE / QA PENDING | 5 |
| Reports / analytics | STRUCTURE DONE / QA PENDING | 5 |
| Settings / Account / Security / PIN | STRUCTURE DONE / QA PENDING | 6 |
| Authentication / onboarding / lock screens | STRUCTURE DONE / QA PENDING | 6 |
| Cloud conflict / account recovery | STRUCTURE DONE / QA PENDING | 6 |
| AI surfaces / approval / activity audit | TAILADMIN OWNER DONE / QA PENDING | 6 |
| Modals / popovers / menus / global search / empty states | TAILADMIN OWNER DONE / QA PENDING | 7 |
| Recovery / PWA refresh / iOS output fallback | TAILADMIN OWNER DONE / QA PENDING | 7 |
| RTL Arabic pass | QA PENDING | 7-8 |
| Light/Dark parity pass | QA PENDING | 7-8 |
| iPhone/iPad/Safari geometry + safe-area pass | QA PENDING | 7-8 |
| Final no-legacy-visual audit | STATIC AUDIT IN PROGRESS | 8 |
| Final unit/build/visual verification | TODO — RUN ONLY AFTER UI EDITS FINISH | 8 |

## Batch 2 — Shell structural replacement

`AppShell.tsx` renders the TailAdmin application frame directly: desktop sidebar, grouped navigation, top bar, account affordance, sync state, create-document menu, mobile bottom navigation and mobile More sheet.

Navigation callbacks, Firebase sign-out, encrypted session clearing, cloud-conflict handling, AI navigation, create-document actions, overlay focus trapping and iPhone safe-area behavior remain functionally owned by existing LOUREX logic.

## Batch 3 — Dashboard, documents and editors

`WorkspaceHome.tsx` owns a TailAdmin Finance dashboard hierarchy while LOUREX report, receivables, payments, inventory and daily-brief libraries continue to own calculations.

`DocumentsPage.tsx` owns the document register and detail hierarchy. Search, filters, lifecycle/status, quotation conversion, payments, credit notes, attachments, PDF/share preparation, keyboard navigation and iPhone attachment-memory safeguards remain unchanged.

`EditorPage.tsx` supplies the TailAdmin editor frame and step hierarchy. The commercial editor core and `DraftDocumentEditor.tsx` intentionally keep their proven semantic editing markup because those components contain autosave, revision single-flight, final-document locking, departure flush and iPhone/Safari safeguards. Their historical visual owners are retired; `tailadmin-editor-core-v320.css` is now the presentation owner.

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

The LOUREX Advisor keeps its existing capability/approval/audit markup because it is tightly coupled to deterministic local accounting context and guarded vault mutations. Its historical injected dark stylesheet is actively retired at runtime and `tailadmin-ai-v320.css` is its sole visual owner.

## Batch 7 — Global overlays and reliability surfaces

`tailadmin-overlays-v320.css` owns Modal/ConfirmDialog presentation, global search, segmented controls, popovers, menus, toasts and generic empty states while focus trapping and keyboard handling remain in React.

`tailadmin-reliability-bridge-v320.css` re-expresses the loading cover, app recovery screen, PWA/cloud refresh notices, iOS output fallback, sign-out shield and mobile focus geometry in the TailAdmin system without changing their runtime behavior.

`tailadmin-utilities-v320.css` owns shared theme controls and residual utility presentation. `tailadmin-attachments-v320.css` replaces the attachment portion previously supplied by the v300 visual layer.

## Batch 8 — Legacy owner retirement

`index.html` no longer loads the historical visual generations or v314 canonical theme stack. It retains only base/component support and reliability geometry required by existing React/runtime behavior, followed by the v320 TailAdmin owners as the final cascade.

`public/home-final-closeout-v286.js` no longer installs historical generations. It acts as a defensive owner boundary: it removes known legacy visual styles if an old cached/runtime path reinjects them, removes the old inline AI stylesheet, normalizes the TailAdmin canvas/theme color and ensures the v320 owners exist.

`public/document-entry-v302.js` now recognizes the TailAdmin create menu, preserves selected Light/Dark boot colors, injects only retained reliability layers, and re-promotes TailAdmin styles after those runtime layers so a retained compatibility stylesheet cannot retake visual ownership.

`scripts/v303-visual-cache-refresh.mjs` promotes the offline cache generation to v320 and caches the exact TailAdmin owner versions used by production output, including utilities and the reliability bridge.

## Acceptance rule
No partial legacy visual ownership is accepted at release. A page is only DONE after final QA confirms shell, headings, controls, search, filters, tables/lists, cards, states, overlays, responsive behavior, Arabic RTL and Light/Dark all use the same TailAdmin visual grammar and the final verification suite is green.

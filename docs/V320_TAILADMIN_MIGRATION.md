# LOUREX v320 — TailAdmin Finance full UI migration matrix

This branch replaces the legacy LOUREX visual system with the TailAdmin Finance design language. The migration is intentionally split into batches, but the release is not considered complete until every surface below is marked DONE and reviewed in both Arabic/English and Light/Dark modes.

## Guardrails
- Preserve v318 persistence, iPhone/Safari stability, encrypted vault, PIN, Firebase/Auth, accounting calculations, document lifecycle, PDF and print behavior.
- No direct commits to `main`.
- No production publish before final visual review and verification.
- Preview deployments are manual/intentional only; feature branches must not auto-deploy on every commit.
- TailAdmin Community/MIT assets and patterns may be reused with the required copyright/license notice. Proprietary TailAdmin Finance source is not copied unless a licensed source package is supplied.
- v320 is a structural replacement. A surface is not considered migrated merely because a late CSS layer recolors legacy markup.

## Coverage matrix

| Surface | Status | Batch |
| --- | --- | --- |
| Global TailAdmin tokens, typography, buttons, inputs, focus states | IN PROGRESS | 1-2 |
| Desktop shell/sidebar/topbar/search | DONE | 2 |
| Mobile shell/navigation/create menu/more sheet/safe areas | DONE | 2 |
| Home / Finance dashboard | STRUCTURE DONE / QA PENDING | 1-3 |
| Documents register/search/filter/detail | STRUCTURE DONE / QA PENDING | 1-3 |
| Document editor frame / step navigation | STRUCTURE DONE / CORE MIGRATION PENDING | 3 |
| Draft Studio / editor inner sections | TODO | 3 |
| Customers + customer profile | STRUCTURE DONE / QA PENDING | 4 |
| Products & Inventory | STRUCTURE DONE / QA PENDING | 4 |
| Purchasing / suppliers / operations | STRUCTURE DONE / QA PENDING | 5 |
| Finance / receivables / collections / expenses | STRUCTURE DONE / QA PENDING | 5 |
| Reports / analytics | STRUCTURE DONE / QA PENDING | 5 |
| Settings / Account / Security / PIN | TODO | 6 |
| Authentication / onboarding / lock screens | TODO | 6 |
| AI surfaces / alerts / assistant | TODO | 6 |
| Modals / popovers / menus / dropdowns / empty states | IN PROGRESS | 2-7 |
| RTL Arabic pass | IN PROGRESS | 2-7 |
| Light/Dark parity pass | IN PROGRESS | 1-7 |
| iPhone/iPad/Safari geometry + safe-area pass | IN PROGRESS | 2-7 |
| Final no-legacy-visual audit | TODO | 8 |
| Final unit/build/visual verification | TODO | 8 |

## Batch 2 — Shell structural replacement

The application shell is no longer the old shell with a TailAdmin color overlay. `AppShell.tsx` renders a dedicated TailAdmin hierarchy for the sidebar, grouped navigation, top bar, global search trigger, account affordance, sync state, create-document menu, mobile bottom navigation and mobile More sheet.

Navigation callbacks, Firebase sign-out, encrypted session clearing, cloud-conflict handling, AI navigation, create-document actions, overlay focus trapping and iPhone safe-area behavior remain functionally owned by the existing LOUREX logic.

## Batch 3 — Dashboard, documents and editor frame

`WorkspaceHome.tsx` owns a TailAdmin Finance dashboard hierarchy. Financial calculations still come from LOUREX reports, receivables, payments, inventory and daily-brief libraries.

`DocumentsPage.tsx` owns a TailAdmin document register and detail hierarchy. Search, filters, lifecycle/status, quotation conversion, payments, credit notes, attachments, PDF/share preparation, keyboard navigation and iPhone attachment-memory safeguards remain on the existing LOUREX logic paths.

`EditorPage.tsx` now provides the TailAdmin editor frame and step navigation while preserving the v318 single-flight save/revision/output safeguards. `EditorPageCore.tsx` and Draft Studio remain intentionally unmigrated until their internal form structure can be replaced without weakening autosave, Safari memory protection or document lifecycle guarantees.

## Batch 4 — Customers and products

`CustomersPage.tsx` now uses a TailAdmin customer directory/profile hierarchy while preserving duplicate detection, dirty-state protection, before-unload protection, credit controls, customer statement entry points and customer-to-document creation.

Products & Inventory now use a TailAdmin workspace hierarchy with domain tabs, KPI summary, catalog command bar, list/editor split, import workflow and inventory/purchase-history entry points. Product dirty-state protection, selection/bulk deletion, duplicate SKU/product checks and import safeguards remain unchanged.

## Batch 5 — Purchasing, finance and reports

`OperationsPage.tsx` now renders TailAdmin-native Suppliers, Purchases, Expenses and Inventory workspaces. Purchase posting/reversal, landed-cost allocation, inventory movement generation, manual movement rules and unsaved-workspace protection remain on the existing LOUREX code paths.

`ReceivablesPage.tsx` now renders a TailAdmin Finance receivables dashboard, aging table and customer account register. Payment recording, statement generation/printing and strict per-currency accounting remain unchanged.

`ReportsPage.tsx` now renders TailAdmin report filters, currency KPIs, monthly performance and customer performance tables. Period normalization, no-FX currency separation, CSV formula hardening, print/PDF behavior and profitability withholding when cost data is incomplete are preserved.

The v320 bootstrap retires each replaced legacy visual owner only after the corresponding TailAdmin structural owner exists. Operations, receivables and reports now have dedicated v320 stylesheet owners.

## Acceptance rule
No partial legacy styling is accepted at release. A page is only DONE when its shell, headings, controls, search, filters, tables/lists, cards, states, overlays, responsive behavior, RTL and dark mode all use the same TailAdmin visual grammar and final verification is green.

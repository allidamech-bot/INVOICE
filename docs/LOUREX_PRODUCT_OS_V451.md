# LOUREX Product OS v451 — Product Restructuring Map

Baseline: `main` at `101a91316ff1ef8846313c1bdfda4064a2965ea3` after PR #450.

This document is the implementation contract for the LOUREX product restructuring. It is intentionally scoped to product architecture, information architecture, presentation, discoverability, guidance, accessibility and financial UX. Existing deterministic accounting/business engines remain the source of truth.

## Non-negotiable safety boundaries

- Do not change totals, taxes, discounts, currencies, landed-cost allocation, receivables, payment allocation or document lifecycle merely to support a visual redesign.
- Do not invent financial data, currency, cash balances, payables, bank balances or accounting capabilities that the product does not track.
- Do not recreate existing AI workflows. Surface them better.
- Preserve local-first vault behavior, cloud reconciliation, Firebase/Auth, PIN/recovery, PDF/share and document lifecycle boundaries.
- Arabic-first, correct RTL/LTR, mobile-first, iPhone priority, minimum 44px touch targets.
- No new package unless a demonstrated requirement cannot be met by existing CSS/React/SVG capabilities.

---

# 1. Current information architecture

## Shell / primary routes

Current top-level workspace model:

- Dashboard (`home`)
- Documents (`documents`)
- Customers (`customers`)
- Finance (`receivables`)
- Reports (`reports`)
- Products & Inventory (`items`)
- Purchasing (`operations`)
- Document Studio (`editor`)

Desktop sidebar groups:

- Workspace: Dashboard, Documents, Customers
- Business: Products & Inventory, Purchasing
- Finance: Finance, Reports
- Utilities: Settings, Account, cloud/sync state

Mobile persistent destinations:

- Home
- Documents
- Create (+)
- Customers
- More

Mobile More owns Products & Inventory, Purchasing, Finance, Reports, Settings, Account, theme, cloud state and sign-out.

## Current dashboard hierarchy

1. Finance overview header + New Document
2. Net sales / Collected / Outstanding / Overdue KPIs
3. Customers / Products / Purchasing quick actions
4. Large performance chart + financial position
5. Needs Attention + inventory health
6. Recent documents
7. LOUREX Financial Advisor

## Current Finance / Reports split

Finance currently means:

- Receivables & Collections
- Expenses

Reports currently owns:

- Net sales
- Gross profit / margin (with missing-cost safeguards)
- Collections
- Outstanding / overdue
- Monthly performance
- Customer performance
- Period and currency filters
- CSV/PDF output

This split is financially valid but not explained strongly enough in the navigation model.

## Current Products / Inventory structure

One domain workspace with tabs:

- Products
- Inventory
- Inventory Movements

Purchasing is separate and owns suppliers + purchases.

## Current Account / Settings structure

Account is a distinct scope inside the Settings modal and owns identity/legal/access concerns.

Settings currently has four tabs:

- Workspace — language/defaults
- Commercial — banking/trade controls
- Documents — output/numbering
- Security — auto lock, cloud recovery, PIN/recovery key

## Current AI placement

AI exists in multiple mature forms already:

- Global contextual AiCopilot
- Dashboard LOUREX Financial Advisor
- AI customer capture
- document/RFQ/quotation AI workflows
- product AI/import review
- procurement comparison
- supplier/document extraction
- business search
- Accounting Guardian / business intelligence tools
- CFO/scenario / command-center capabilities

The product problem is not missing AI capability. It is fragmented discovery and insufficient visual/product-level prioritization.

---

# 2. Core problems

## P0 — financial/product integrity risks

### P0.1 Invented dashboard fallback currency
The Dashboard performance chart currently falls back to `USD` when no observed financial currency exists. That can visually imply a currency that the business has never used.

Decision: remove the invented currency presentation. A no-data state must not manufacture a currency. This is a financial UX correctness fix and must be covered by regression protection.

### P0.2 Visual states do not always reflect semantic priority
Dark-mode surfaces frequently converge on similar charcoal values. Ordinary cards, action cards, settings surfaces and some overlays therefore have too little role distinction.

Decision: introduce role-based semantic surfaces without changing financial meaning.

## P1 — needs action

### P1.1 AI is buried on Home
The Dashboard advisor sits after charts, attention, inventory and recent documents.

Decision: LOUREX Advisor becomes first-viewport product capability. Detailed AI workflows remain in their canonical workspaces/copilot.

### P1.2 Action Center appears after analysis
`Needs attention` comes after the large performance chart. A business owner must see exceptions before historical analysis.

Decision: Action Center moves above charts.

### P1.3 Mobile Create is document-heavy
The centered + currently exposes a long document-type menu. It does not reflect the product’s broader daily actions such as customer, product, purchase or AI source upload.

Decision: preserve every document creation route, but introduce a concise primary quick-create layer and keep specialist document types in progressive disclosure. Global Search already proves canonical events/routes exist for customer/product/purchase/expense/payment creation and can be reused rather than duplicated.

### P1.4 Header does not fully establish product hierarchy
The header, page background and dark surfaces are visually too close. Brand treatment also visually duplicates the compact LOUREX lockup with adjacent LOUREX text.

Decision: header becomes an elevated product surface; official logo remains unchanged; framing/scale and duplicated wordmark presentation are corrected.

## P2 — recommended

### P2.1 Finance naming is broader than its actual content
The route called Finance contains receivables/collections + expenses, while profitability and management reporting live in Reports.

Decision: keep deterministic boundaries but explain the model:
- Finance = operational money control (receivables, collections, operating expenses)
- Reports & Insights = period analysis and profitability
Do not invent cash/bank ledgers or supplier payables.

### P2.2 Settings taxonomy is too implementation-shaped
Workspace / Commercial / Documents / Security is functional but not a complete mental model for a business user.

Decision: retain underlying controls and group them under user-oriented headings. Only expose categories backed by real functions.

### P2.3 Search is strong but under-positioned
Global Search already supports cross-domain records, canonical navigation and quick-create actions. It should read as a command/search surface rather than a generic input.

Decision: strengthen product positioning, focus state, result grouping and mobile treatment. AI business search remains distinct: deterministic global search finds records/actions; AI search interprets business questions.

### P2.4 Empty states are passive
Chart/report/finance empty states explain absence but often do not offer the next safe action.

Decision: empty states become task-oriented while respecting context.

## P3 — informational / polish

- Too many cards share the same geometry/surface treatment.
- Horizontal workspace tabs need clearer overflow affordance on narrow screens.
- Reports need more metric/period/currency education without turning into tutorials.
- Settings / More should own product-level Help, About, Privacy and Terms surfaces when supported.
- Motion should communicate state changes only.

---

# 3. Proposed information architecture

The implementation keeps the current route model to minimize business-risk and avoids a router rewrite. Product IA is clarified through grouping, naming, workspace tabs and progressive disclosure.

## HOME

### Dashboard
Purpose: Today + priorities + business pulse + AI entry.

Order:
1. Product header / context / command search
2. LOUREX Advisor
3. Action Center / Needs Attention
4. Financial pulse KPIs
5. Quick actions
6. Financial position + performance trend
7. Inventory/operations pulse
8. Recent documents

### Action Center
Initially implemented as the promoted Dashboard priority surface, not a fake new route. A separate route is justified only when the volume/actions exceed the Dashboard surface.

## SALES / DOCUMENTS

Keep Documents as canonical commercial-document register and lifecycle workspace.

Document-type filtering continues to provide quotation/proforma/invoice/etc. segmentation. Do not duplicate these into separate data stores or routes solely for navigation aesthetics.

Customers remains a first-class route because it is a master-data workflow with its own AI capture and commercial controls.

Collections remains inside Finance because it is a receivables workflow, while document-level payment actions continue to deep-link there.

## PURCHASING

Purchasing route remains canonical for:

- Suppliers
- Purchases
- supplier/purchase workflows
- procurement AI entry points where supported

Do not create a separate supplier route unless user-flow evidence later shows the current workspace tabs are insufficient.

## PRODUCTS & INVENTORY

Retain one domain workspace:

- Products
- Inventory
- Inventory Movements

Improve hierarchy, AI/import discoverability, stock exception visual semantics and horizontal tab affordance.

## FINANCE

Finance becomes explicitly described as **Operational Finance**:

- Receivables & Collections
- Expenses

Potential future finance modules must not be shown until backed by deterministic data. In particular, do not imply a bank/cash ledger or supplier payables ledger that LOUREX does not currently maintain.

## REPORTS & INSIGHTS

Reports is positioned as management analysis:

- Financial Summary
- Monthly Performance
- Customer Performance
- profitability completeness/data-quality warnings

Existing currency separation is preserved.

Product/supplier performance is only surfaced where supporting deterministic reporting exists; otherwise it remains a documented future extension, not a fake tab.

## AI

No duplicate “AI app inside the app.” Use a layered AI strategy:

- Global: contextual AiCopilot
- Home: LOUREX Advisor
- Search/command: AI business search where interpretation is needed
- Workflow-specific: customer capture, RFQ/quote builder, product import, procurement comparison, Accounting Guardian, etc.

The shared visual identity marks AI surfaces as LOUREX Intelligence while retaining canonical workflow ownership.

## ACCOUNT / SETTINGS

Account = identity/access.
Settings = product/business configuration.

No duplicated controls between the two.

---

# 4. Dashboard hierarchy decision

## First viewport

### A. Context header
- company / workspace context
- concise page statement
- global search/command affordance
- primary Create action

### B. LOUREX Advisor
Role: primary intelligence surface.
Visual treatment: blue/cyan LOUREX Intelligence family with restrained mesh/glow, not generic neon and not a robot-brand takeover.

### C. Action Center
Priority order:
- P0 Critical: financial integrity / blocked/security state
- P1 Needs Action: overdue invoice, incomplete accounting/business information, inventory exception
- P2 Recommended: dormant stock, follow-up, optimization
- P3 Informational: summaries/trends

Current deterministic exception sources remain authoritative.

## Second viewport

### D. Financial pulse
- Net Sales — period + currency(s)
- Collected — period + currency(s)
- Outstanding — as-of position
- Overdue — as-of position

Do not present revenue, collections, receivables and cash flow as interchangeable.

### E. Quick actions
Business-domain shortcuts, not decorative nav cards.

## Analysis

### F. Financial position
Outstanding/overdue/open-invoice context.

### G. Performance trend
Chart follows action/position context. On empty data, reduce visual footprint and present useful next actions instead of a large blank plotting area.

### H. Inventory / operations pulse
Stock exceptions and useful operational counts.

### I. Recent documents
History belongs after “what now?” and “how are we doing?”.

---

# 5. Navigation hierarchy

## Desktop

### Overview
- Dashboard

### Sales & Relationships
- Documents
- Customers

### Operations
- Products & Inventory
- Purchasing

### Finance & Insights
- Finance
- Reports

### Product utilities
- Settings
- Account
- Sync/status

AI remains globally accessible rather than hidden as one sidebar destination.

## Mobile persistent navigation

Retain five destinations because they match proven high-frequency flows and avoid a disruptive route rewrite:

- Home
- Documents
- Create
- Customers
- More

Improve Create through progressive disclosure rather than adding a sixth tab.

## Mobile More

Group with strong headings:

- Operations: Products & Inventory, Purchasing
- Finance & Insights: Finance, Reports
- Account: My Account, Settings
- Product: Help/About/Privacy/Terms when real surfaces are present
- Utilities: theme, sync, sign-out

---

# 6. Account structure

## Profile / account access
- signed-in email/account status where available
- sign-out remains an explicit account/session action

## Business Identity
- company name EN/AR
- company logo
- contact details
- address/country

## Legal & Registration
- VAT/Tax
- CR / registration identifiers

## Security relationship
Account links users to Security configuration; it must not duplicate PIN/recovery inputs if Security already owns them.

Existing separation tests that keep payment terms/numbering/auto-lock out of Account remain valid product rules.

---

# 7. Settings structure

Implement as user-facing sections backed only by real controls.

## General
Backed by current Workspace settings:
- interface language
- document/default language where supported
- appearance/theme where currently controlled globally
- date/number defaults only if existing controls exist

## Business / Commercial
Backed by Company + Commercial controls:
- company commercial defaults
- bank accounts
- tax presets
- payment-term presets
- trade defaults
- pricing policy

## Documents
Backed by current Document settings:
- numbering
- output behavior
- template/document preferences
- signatures/stamps/logos where currently supported

## Security
Backed by real security flows:
- Auto Lock
- Lock Now
- PIN change
- recovery key
- encrypted cloud restore state

## Data / Backup
Expose only existing backup/restore/export/cloud/local controls. If the controls live outside Settings today, use links/actions to canonical flows rather than duplicating state.

## AI
Only add controls when the repository has real persisted preferences. Until then, provide explanation/help rather than fake toggles.

## Product / Support
- Help
- About / version/build
- Privacy / Data & AI privacy
- Terms

Static informational surfaces can be product-level pages/sheets without pretending to be settings.

---

# 8. Finance / report information architecture

## Terminology contract

### Revenue / Net Sales
Finalized commercial sales net of supported credit-note effects, according to existing deterministic report code.

### Collections
Recorded payments in the selected period/context.

### Receivables / Outstanding
Open customer balance as of the relevant as-of date.

### Overdue Receivables
Outstanding amount past due as of the relevant as-of date.

### Gross Profit / Margin
Shown only when cost data is complete according to the existing profitability engine.

### Expenses
Operating expense records. Do not relabel these as total cash outflow if purchases/payments or a cash ledger are not equivalently represented.

### Cash Flow
Do not add a “Cash Flow” report unless inflow/outflow coverage is deterministic and complete. The existing Dashboard chart label should avoid claiming full cash flow if it is visualizing sales/collections rather than a cash ledger.

## Report card contract
Every monetary report surface should expose or make immediately clear:
- metric name
- period or as-of semantics
- currency
- data completeness state when material
- valid drill-down/action

## Help contract
Add short metric explanations at the section level. Avoid a tooltip maze.

---

# 9. AI placement strategy

## LOUREX Advisor — Home
Promoted to first viewport.

## Contextual Copilot — global
Retain across workspaces. Improve visual identity and entry affordance; do not duplicate its state.

## AI workflow tools — contextual
- Customers: AI capture/import near Add Customer
- Documents/editor: source → draft/quote and accounting review
- Products: catalog/product AI import
- Purchasing: procurement/supplier quote intelligence
- Reports/Home: advisor/CFO explanations and deterministic calculations

## Trust UX
Every AI family surface should communicate:
- what source it is using
- when calculations are deterministic
- when a mutation still requires review/approval
- no fabricated missing values

Existing deterministic-math trust copy is retained and visually promoted.

---

# 10. Visual hierarchy strategy

## Card families

### KPI Card
Compact, numeric, quiet; one semantic accent at most.

### Action / Alert Card
Tinted semantic surface + severity marker + count + clear CTA.

### AI Card
LOUREX blue/cyan intelligence surface, subtle mesh/glow, controlled border and brand mark treatment.

### Financial Position Card
Neutral elevated surface with strong numeric hierarchy.

### Inventory / Operational Card
Neutral with status dots/badges rather than full-card color.

### Report Card
Dense but readable, period/currency explicit.

### Navigation Card
Strong hover/focus/click affordance; never visually confused with static content.

### Empty State
Compact, explanatory, task-oriented.

## Dark mode
Dark does not mean one `#191919` plane everywhere.

Target hierarchy:
- App canvas: near-black matte
- Shell/header: blue-black elevated
- Primary surface: charcoal with subtle cool tint
- Elevated card: lighter charcoal
- AI: restrained blue/cyan tinted surface
- Warning: amber-brown tint
- Critical: muted red/coral tint
- Success: muted green/teal tint

## Light mode
Keep current strengths. Use the same semantic relationships with pale tints and clean borders; no gratuitous gradients.

---

# 11. Design system strategy

Introduce a final product-level CSS contract rather than rewriting historic style layers.

## Tokens
- `--lx-canvas`
- `--lx-shell`
- `--lx-surface-1`
- `--lx-surface-2`
- `--lx-surface-ai`
- `--lx-surface-info`
- `--lx-surface-warning`
- `--lx-surface-critical`
- `--lx-surface-success`
- `--lx-border`
- `--lx-text`
- `--lx-text-muted`
- `--lx-brand`
- `--lx-ai`
- semantic status colors

## Typography
Use existing Inter / Noto Sans Arabic stack. Increase hierarchy through weight/size/line-height, not new font dependencies.

## Spacing
- mobile page gutter: compact but safe
- consistent section rhythm
- 44px minimum controls
- bottom-nav safe-area padding

## Radius
Use a small coherent scale rather than unique radius per component.

## Motion
120–220ms transitions for focus/expand/sheet/action state; honor reduced motion.

---

# 12. Mobile navigation and interaction strategy

- Preserve 5-slot bottom navigation.
- Center Create remains visually distinctive but not oversized.
- Quick-create sheet shows high-frequency actions first.
- Specialist document types remain reachable through “More document types” / document workflow rather than being deleted.
- All mobile overlays use safe-area padding and accessible scrolling.
- Keyboard-visible layouts preserve the primary action.
- Horizontal tabs use scroll snapping/edge affordance and RTL-correct direction.
- No clipped labels as the only indication of overflow.

---

# 13. Help / onboarding strategy

## First-run
Do not introduce a blocking tour. Use progressive first-action guidance.

## Contextual help
- Dashboard: explain “Outstanding” vs “Collected” through concise helper copy where ambiguity is likely.
- Reports: explain period-based vs as-of metrics.
- Finance: explain receivable aging and collection actions.
- Products/Inventory: explain on-hand vs movements.
- AI: explain data source/review boundary.

## Empty states
Every primary empty state should answer:
1. Why is this empty?
2. What creates data here?
3. What safe action should the user take next?

---

# 14. Legal / product-completeness strategy

Current code search does not show a user-facing Privacy Policy or Terms of Use product surface. Runtime diagnostics contain privacy-safe diagnostics language, but that is not a legal/product information page.

Add product-level informational surfaces for:
- Privacy
- Terms of Use
- Data & AI Privacy explanation
- About LOUREX
- Help / Support
- Version/build information

Important: legal copy must be conservative and descriptive. Do not promise certifications, data residency, retention or legal guarantees that the implementation cannot prove.

On mobile these belong under More/Settings rather than a marketing footer. Desktop may expose compact product links within Account/Settings; no traditional marketing footer is required inside the app workspace.

---

# 15. Engineering decisions

## Preserve route/state architecture
Do not introduce a new router merely for IA polish. Current screen state + canonical events already coordinate cross-workspace creation and search.

## Reuse canonical events
Global Search demonstrates stable events for:
- new customer
- new product
- new purchase
- new expense
- payment/statement flows

Quick Create should call the same canonical paths.

## CSS layering
Add a final `product-os-v451.css` contract loaded after historic visual layers so improvements are explicit and reversible.

## Avoid business-logic coupling
Visual reordering of Dashboard must not move or duplicate deterministic calculations.

## Regression coverage
Add source/contract tests for:
- stylesheet loaded last in the product visual stack
- semantic product tokens
- Dashboard advisor/action priority order
- no invented dashboard fallback currency
- mobile touch-target/safe-area contract
- existing finance/report terminology not conflated

---

# 16. Implementation batches

## Batch A — Product Architecture Audit — COMPLETE in this document
- current route map
- current workspace ownership
- product/financial terminology boundaries
- prioritization decisions
- legal/help gaps

## Batch B — Design System Foundation
- semantic tokens
- shell/header/surface hierarchy
- card families
- status families
- focus/touch/motion contract
- light/dark parity

Risk: low-to-medium; CSS specificity against historic layers.
Mitigation: final isolated stylesheet + narrow selectors + regression contract.

## Batch C — Dashboard / Header / AI / Priority System
- Advisor first viewport
- Action Center before analysis
- semantic severity treatment
- compact actionable chart empty state
- header elevated surface
- logo framing correction

Risk: medium; responsive ordering and CSS inheritance.
Mitigation: no calculation rewrites; test desktop/mobile/RTL selectors.

## Batch D — Navigation / Search / Quick Create
- clarify sidebar group hierarchy
- command-search visual hierarchy
- progressive mobile create
- horizontal overflow affordance

Risk: medium; creation-flow discoverability.
Mitigation: preserve all canonical actions and specialist document types.

## Batch E — Account / Settings / Security / Help
- improve Account identity hierarchy
- regroup existing settings without fake controls
- strengthen Security presentation
- add Help/About/Privacy/Terms informational surfaces only when backed by accurate copy

Risk: medium; settings has unsaved-state and diagnostic-entry behavior.
Mitigation: preserve current state ownership and diagnostic hooks.

## Batch F — Finance / Reports
- rename/present operational finance accurately
- metric helper context
- period/as-of/currency visibility
- stronger profitability completeness warning
- action-oriented empty states

Risk: high if calculation code touched.
Mitigation: presentation-only by default; any financial bug is isolated with regression test.

## Batch G — Customers / Products / Inventory / Purchases
- unify headers/cards/search/action hierarchy
- surface contextual AI/import near canonical action
- improve mobile editor/sheet density
- inventory exception semantics

Risk: medium due large forms.
Mitigation: preserve mutation/event handlers; CSS-first changes.

## Batch H — Documents / Quotes / Invoices
- editor/register presentation only
- document status/payment status clarity
- mobile actions and sheet hierarchy
- no lifecycle/math change

Risk: high because document workflow is business-critical.
Mitigation: no financial logic change; existing lifecycle/output tests must stay green.

## Batch I — Modals / Empty States / Guidance / Micro-interactions
- bottom-sheet behavior where appropriate
- keyboard/safe-area
- task-oriented empty states
- subtle state transitions

## Batch J — Full Mobile / RTL / Accessibility / Performance
- iPhone narrow/wide widths
- Android
- 44px targets
- long Arabic strings
- focus-visible
- reduced motion
- overflow and safe areas
- no unnecessary blur/GPU load

## Batch K — Final consistency / regression
- every route
- every card family
- every dialog/sheet
- dark/light
- Arabic/English
- financial terminology
- build/typecheck/tests

---

# 17. Acceptance criteria

LOUREX v451 product restructure is acceptable only if:

- First viewport shows intelligence + action before deep historical analysis.
- Critical/needs-action states are visually distinct from ordinary information.
- AI has a recognizable LOUREX identity without looking like a separate generic chatbot product.
- Header/logo/search establish a premium product shell.
- Mobile navigation remains obvious and creation is faster without removing specialist workflows.
- Finance and Reports use correct financial concepts and never imply unsupported ledgers.
- Missing data remains missing; no currency/value is invented for presentation.
- Settings expose only functioning controls.
- Account and Settings do not duplicate ownership.
- Dark mode has real surface hierarchy; light mode remains coherent.
- Arabic RTL is first-class and long labels remain usable.
- Existing deterministic business logic and document lifecycle regressions remain green.
- No unrelated repository/project changes are made.

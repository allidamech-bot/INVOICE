# LOUREX Expansion — Batch 0 Architecture & Placement Blueprint

Baseline: `main` at `ce7533e05725a5f7419695140878f894abd24d42` after merged PR #451.

Branch: `feat/lourex-expansion-batch0-audit`.

This document is the implementation gate for the next LOUREX expansion program. **No expansion feature should be implemented until its placement, data ownership, migration impact, offline/cloud behavior, financial semantics, mobile/RTL behavior, security boundary and regression contract are accepted here.**

The purpose of Batch 0 is to prevent feature duplication, route sprawl, accidental accounting changes, encrypted-vault breakage and mobile UX regressions.

---

## 1. Current product ownership map

### Persistent application navigation

Desktop currently owns these canonical workspaces:

- Home / Dashboard
- Documents
- Customers
- Products & Inventory
- Purchasing
- Finance
- Reports & Insights
- Settings / Account / Product Info as utility surfaces

Mobile deliberately keeps five persistent destinations:

- Home
- Documents
- Create
- Customers
- More

`More` owns Products & Inventory, Purchasing, Finance, Reports, Settings, Account and product information. Expansion work must **not** create one mobile navigation item per new capability.

### Existing domain ownership

#### Home
Owns:
- LOUREX Advisor
- Action Center / current deterministic exception summary
- current-period sales/collections/receivables overview
- operational/inventory pulse
- recent documents

Home should remain an executive/action surface, not become a full data-entry workspace.

#### Documents
Owns:
- the commercial-document register
- search/filter/status/output actions
- document detail and edit/manage entry
- quote/proforma to invoice conversion
- invoice payment and credit-note entry points

Documents is the canonical owner for commercial document lifecycle and future commercial tracking.

#### Customers
Owns:
- customer master data
- customer AI capture
- duplicate protection
- commercial defaults / credit controls
- customer-to-document creation
- statement entry

Customers is the canonical owner for Customer 360 and sales-relationship context.

#### Products & Inventory
Owns three internal tabs:
- Products
- Inventory
- Inventory Movements

Product catalog/pricing/import belongs here. Inventory planning and future warehouse stock presentation also belong here.

#### Purchasing
Current `OperationsPage` in purchasing mode owns:
- Suppliers
- Purchases

Supplier master data, purchase drafts, posting/reversal and landed-cost behavior are already canonical here.

#### Finance
Current tabs:
- Receivables & Collections
- Expenses

Finance currently means operational customer finance plus operating expenses. It does **not** yet contain a supplier payable ledger or a bank/cash ledger.

#### Reports & Insights
Owns:
- period-based financial summaries
- monthly performance
- customer performance
- currency-separated reporting
- profit/margin only when cost completeness permits it

#### Settings / Account
Current settings tabs:
- Company
- Commercial
- Documents
- Security

Account/Settings also own backup, restore, encrypted cloud state, PIN/recovery and business identity. Product Info owns Help / Privacy & AI Data / Terms / About.

---

## 2. Existing persisted data contract

The current encrypted `VaultPayload` contains:

- company
- appSettings
- customers
- suppliers
- purchases
- expenses
- inventoryMovements
- documents
- documentEvents
- documentRevisions
- payments
- savedItems

Important existing boundaries:

- `LourexDocument.status` = `draft | final`
- `LourexDocument.lifecycleStatus` = `active | voided`
- `DocumentEventRecord` already tracks document lifecycle events such as created, issued, reissued, revision actions, void, credit-note creation, payment events and conversion.
- `PaymentRecord` is customer-invoice payment data. It must never be reused as supplier-payment data.
- `BankAccount` currently describes bank-account details for documents. It is **not** a transaction ledger.
- `InventoryMovementRecord` has no warehouse/location dimension today.
- `PurchaseRecord` has purchase cost/landed-cost data but no supplier-payment ledger and no complete supplier payable model.
- `SavedItem` has catalog/cost/usage information but no reorder policy, preferred supplier, warehouse allocation or independent price-list rules.

Every new persisted entity must be additive, versioned and migrated without destroying or silently reinterpreting these existing records.

---

## 3. Non-negotiable implementation rules

1. Do not overload `draft/final` with sales statuses such as Sent/Accepted/Rejected.
2. Do not overload customer `PaymentRecord` for supplier payments.
3. Do not treat descriptive bank accounts as cash/bank ledgers.
4. Do not invent Input VAT from purchases until purchase-side tax data is actually persisted.
5. Do not combine currencies unless an explicit FX layer with dated rates is enabled.
6. Do not expose encrypted-vault records through a public portal link.
7. Do not create server-side automation that requires plaintext vault access without a deliberate encryption/security redesign.
8. AI may classify, summarize, draft and recommend; deterministic LOUREX engines remain authoritative for calculations and mutations.
9. New high-frequency capabilities should be embedded in canonical workspaces before a new primary route is considered.
10. Mobile remains five persistent navigation slots unless strong measured evidence proves otherwise.
11. Every new modal on mobile must have safe-area, keyboard, scroll ownership and 44px minimum interaction targets.
12. Arabic/RTL behavior is part of acceptance, not a later translation pass.

---

# 4. Batch placement and architecture decisions

## Batch 1 — Commercial Flow + Quote Tracking

### Owner
Primary: **Documents**.
Secondary: Customer 360 timeline and Home Action Center summaries.

### Placement
- Documents detail view: add a compact `Commercial Flow` / timeline section.
- Quotation/proforma rows/details: add commercial status chip distinct from document lifecycle.
- Customer 360: show linked commercial chain read-only.
- Do not add a new sidebar route.

### Data decision
Reuse `DocumentEventRecord` for existing lifecycle evidence, but **do not** repurpose `DocumentStatus`.

Recommended additive tracking entity:
- `CommercialDocumentTrackingRecord`
  - documentId
  - commercialStatus: draft/internal-ready/sent/accepted/rejected/expired/converted
  - sentAt
  - acceptedAt
  - rejectedAt
  - rejectionReason
  - followUpAt
  - lastFollowUpAt
  - updatedAt

`viewed` must not be automatically claimed until Batch 10 provides a secure external viewing mechanism. Manual/internal tracking can exist earlier but must be labeled accordingly.

### Risk
Medium. Must not alter invoice/payment accounting or document finalization.

### Dependencies
None for manual tracking. Secure automatic `Viewed` depends on Batch 10.

---

## Batch 2 — Sales Pipeline / Lightweight CRM

### Owner
Primary: **Customers**.
Secondary: Home summary / Action Center.

### Placement
- Customers gains a secondary `Pipeline` view/tab, not a new primary navigation item.
- Customer profile shows open opportunities.
- Home may show small actionable pipeline summary only.

### Data decision
New entity: `OpportunityRecord`.
Suggested fields:
- id
- customerId
- title
- stage: lead/contacted/rfq/quote-sent/negotiation/won/lost
- currency
- amount
- expectedCloseDate
- nextAction
- nextActionAt
- linkedDocumentIds
- lostReason
- notes
- createdAt / updatedAt

AI may summarize opportunity history and suggest next action. It must not mark Won/Lost automatically.

### Risk
Medium. Commercial/CRM only; no revenue recognition from pipeline values.

### Dependencies
Batch 1 improves document linking but is not strictly required for base pipeline storage.

---

## Batch 3 — Customer 360 + Supplier 360

### Owner
- Customer 360: **Customers profile**.
- Supplier 360: **Purchasing > Suppliers**.

### Placement
Use profile sections/tabs inside existing workspaces:
- Overview
- Activity
- Documents/Purchases
- Financial position
- Products
- Files/notes where supported
- AI insights

### Data decision
Phase 1 should be primarily **derived** from existing customer/supplier master data, documents, payments, purchases, document events and product lines.

Do not duplicate balances into customer/supplier records.

### Risk
Low-to-medium if read-only/derived first.

### Dependencies
None. This is a recommended early expansion because it extracts value from data already present.

---

## Batch 4 — Notification & Follow-up Center

### Owner
Primary entry: **Home / Action Center**.
Global access: topbar/search command and contextual profile actions.

### Placement
- Home Action Center becomes the summary entry point.
- Dedicated sheet/panel can show all tasks; avoid a permanent new sidebar route initially.
- Deep links open the canonical source record.

### Data decision
Two layers:
1. Derived alerts from deterministic current records.
2. Persisted user task state for Snooze/Done/manual follow-up.

Recommended new entity: `TaskRecord` with source type/id, dueAt, status, snoozeUntil, priority and user note.

### Risk
Medium. Must avoid duplicate alerts and notification fatigue.

### Dependencies
Batch 1/2 improve sales follow-up sources; base overdue/stock/data alerts can work without them.

---

## Batch 5 — Data Quality / Business Health Center

### Owner
Summary: **Home**.
Deep correction: canonical domain screens.

### Placement
- Home small `Data Health` card.
- Full review as a sheet/workspace panel reachable from Home and search.
- Every issue must deep-link to Customers / Products / Purchasing / Documents / Settings rather than provide duplicate editors.

### Data decision
Prefer deterministic **derived findings**. No fake numerical score is required. If a score is introduced later, its formula must be explicit and evidence-based.

Examples:
- missing product cost
- missing HS/origin where operationally required
- probable duplicates
- incomplete customer/supplier registration data
- invalid/incomplete commercial data
- inconsistent cost currencies
- stale or incomplete records

### Risk
Low if read-only detection plus canonical fixes.

### Dependencies
None. Recommended early.

---

## Batch 6 — Inventory Planning

### Owner
**Products & Inventory > Inventory**.

### Placement
- Inventory summary adds planning/exception view.
- Product profile/editor owns reorder policy.
- Purchasing receives a generated `Review purchase suggestion` handoff, not automatic PO creation/posting.

### Data decision
Add planning fields to product policy or separate record keyed by item ID:
- minimumStock
- reorderPoint
- targetStock / suggested order rule
- preferredSupplierId
- leadTimeDays
- minimumOrderQuantity

Planning calculations remain deterministic.

### Risk
Medium due stock semantics.

### Dependencies
Supplier master data exists. Batch 3 Supplier 360 improves UX but is not required.

---

## Batch 7 — Pricing & Price Lists

### Owner
**Products > Pricing** with contextual use in Documents/Quote Builder.

### Placement
- Product editor: price policy summary/history.
- Product workspace: `Price Lists` sub-view only if density requires it.
- Quote Builder resolves price from deterministic rules and shows the source used.

### Data decision
Recommended new entities:
- `PriceListRecord`
- `PriceRuleRecord`

Support:
- retail / wholesale / distributor
- customer-specific rule
- quantity breaks
- effective dates
- currency
- MOQ where relevant

Original document prices remain snapshots and are never retroactively changed.

### Risk
High-medium because quote pricing is business-critical.

### Dependencies
Product/customer IDs already exist. Batch 3 improves discoverability.

---

## Batch 8 — Accounts Payable / Supplier Finance

### Owner
**Finance** gains `Supplier Payables` as a new finance tab.
Supplier details surface the same data contextually.

### Placement
Finance tabs become conceptually:
- Customer Receivables & Collections
- Supplier Payables & Payments
- Expenses

Do not bury AP inside Purchasing; Purchasing owns procurement while Finance owns obligations/payments.

### Data decision
New supplier-finance model required.

Do **not** reuse `PaymentRecord`.

Recommended entities:
- `SupplierPayableRecord` or a rigorously defined payable source linked to posted purchase/supplier invoice
- `SupplierPaymentRecord`

The design must resolve:
- payable recognition source
- supplier invoice/reference
- due date
- partial payments
- reversals/deletions
- currency integrity
- statement/aging semantics

### Risk
High. This is a financial subsystem and needs dedicated regression tests.

### Dependencies
Purchasing exists. Detailed payable design must precede implementation.

---

## Batch 9 — Tax / VAT Center

### Owner
**Reports & Insights** for analysis/export, with Finance cross-link for operational review.

### Placement
Do not create a generic tax number card in Settings and call it a tax system. Add a real tax report section when deterministic source data supports it.

### Data decision
Stage A:
- Output VAT / sales tax derived from finalized supported sales documents and credit-note effects.

Stage B:
- Input VAT only after purchase-side tax is explicitly stored and validated.

Never infer purchase tax from totals or supplier country.

### Risk
High due legal/financial meaning. Country-specific filing/compliance must be separate modules with explicit jurisdiction rules.

### Dependencies
Stage B depends on purchase/payable tax modeling.

---

## Batch 10 — Customer Portal + Secure Share

### Owner
Internal entry: Documents / Customer 360.
External surface: isolated secure portal.

### Placement
- Document action: `Secure Share`.
- Customer profile: shared documents/history entry.
- External customer sees only a minimal shared snapshot.

### Security decision
This cannot expose or decrypt the whole encrypted vault.

Requires a separate server-side share model containing only explicitly published document snapshot data, revocable capability tokens, expiry and audit metadata.

Portal actions:
- view
- download
- accept
- reject
- comment

Automatic `Viewed` tracking for Batch 1 comes from this portal only.

### Risk
Critical/high because it crosses the private local-first boundary.

### Dependencies
Batch 1 tracking semantics should exist first.

---

## Batch 11 — Recurring Workflows

### Owner
Documents and Purchasing context; management entry from Settings/Automation or command search.

### Placement
Avoid a new main route initially. Use `Recurring` section from Documents / Purchasing plus a management sheet.

### Data decision
New `RecurringWorkflowRecord` with template/source, cadence, nextDueAt, enabled state and lastGeneratedAt.

Initial local-first implementation should generate **drafts only** when the application is active/open and detects a due schedule.

A true unattended server cron cannot safely decrypt the local encrypted vault under the current architecture and therefore must not be faked.

### Risk
Medium-high.

### Dependencies
None for local draft generation. Server automation requires future architecture.

---

## Batch 12 — Audit Trail / Activity Log

### Owner
Contextual timeline in each domain plus product-level audit viewer under Data Center/Admin later.

### Placement
- Document detail extends existing events.
- Customer/Supplier/Product/Purchase profiles show relevant activity.
- Global audit view belongs under Data Center / account administration, not main navigation.

### Data decision
Existing `DocumentEventRecord` stays canonical for document lifecycle.

Add broader `ActivityEventRecord` for non-document actions. It should be append-oriented and include actor identity when available.

### Risk
Medium. Avoid storing secrets, plaintext PINs, file contents or sensitive AI payloads in audit events.

### Dependencies
Recommended before Teams so future actor IDs plug into an existing event model.

---

## Batch 13 — Teams / Roles / Approval

### Owner
**Settings / Account administration**.

### Placement
- Workspace members
- roles
- approvals/security policy

No normal user should need a new primary route just to manage team access.

### Architecture decision
Current cloud model is owner-scoped encrypted vault data. Teams therefore require an explicit shared-workspace encryption/key-access model and cannot be added as UI-only roles.

Permissions may include:
- view cost
- edit sales
- purchasing actions
- record payments
- approve/post
- void/delete
- settings/security administration

### Risk
Critical/high.

### Dependencies
**Workspace identity/keying foundation from Batch 14 should be designed before or together with Teams.** Execution order may therefore place Batch 14 foundation before Batch 13.

---

## Batch 14 — Multi-Company / Workspaces

### Owner
Workspace switcher in shell/account; configuration in Settings.

### Placement
- compact current-workspace context in topbar/sidebar
- switcher accessible without crowding mobile bottom navigation
- workspace management in Settings/Account

### Architecture decision
This is a major storage boundary change. Current vault is effectively one company/workspace payload.

Required design before code:
- workspace identity
- workspace-scoped company/settings/data
- encrypted migration from current single workspace
- cloud key/path ownership
- backup/restore format compatibility
- numbering isolation
- no cross-workspace record leakage

### Risk
Critical/high.

### Dependencies
Should be treated as a platform migration, not a normal feature batch.

---

## Batch 15 — Cash & Bank / Treasury

### Owner
**Finance**.

### Placement
Finance adds Treasury only after a real transaction ledger exists.

Existing `BankAccount` settings become selectable account metadata but are not themselves balances.

### Data decision
New ledger entities required:
- financial accounts
- bank/cash transactions
- transfers
- reconciliation/matching state
- opening balances

Customer collections and supplier payments may reference ledger transactions, but original domain records remain authoritative.

Only after coverage is complete may the product use the term `Cash Flow` for actual cash/bank movement reporting.

### Risk
Critical/high financial subsystem.

### Dependencies
Accounts Payable strongly recommended first. If Multi-Company is planned, treasury should be workspace-scoped from day one to avoid a second migration.

---

## Batch 16 — FX / Exchange Rate Layer

### Owner
Settings/Finance for rates; Reports for consolidated management views.

### Data decision
New `ExchangeRateRecord`:
- fromCurrency
- toCurrency/baseCurrency
- rate
- effectiveDate
- source label
- createdAt

Rules:
- original document/payment/purchase currency and amount never change
- converted totals are management views only unless a future accounting ledger explicitly defines otherwise
- no hidden live-rate fetch

### Risk
High due financial interpretation.

### Dependencies
Can be independent, but best added after core finance boundaries stabilize.

---

## Batch 17 — Warehouses / Stock Locations

### Owner
**Products & Inventory**.

### Placement
- Inventory gains warehouse filter/summary.
- Movements gain source/destination where applicable.
- Product inventory profile shows per-location balances.

### Data decision
New entities/fields required:
- WarehouseRecord
- warehouse/location IDs on inventory movement model
- transfer movement semantics
- reserved vs available stock only when reservation source is defined

Existing movement records need a safe default migration to a primary/default warehouse if warehouses are enabled.

### Risk
High-medium because inventory balances depend on movement integrity.

### Dependencies
If Multi-Company is planned, warehouses must be workspace-scoped.

---

## Batch 18 — Profitability Center

### Owner
**Reports & Insights**.

### Placement
Extend current reporting rather than create a competing analytics app.

Views may include:
- product profitability
- customer profitability
- invoice profitability
- category profitability
- supplier/cost trends where valid
- period trends
- cost completeness

### Data decision
Derive from finalized documents and deterministic cost data. Never manufacture profit when unit cost is missing or currencies are incomparable.

### Risk
Medium if read-only deterministic reporting.

### Dependencies
Existing reporting already provides a strong base. Price lists and improved cost completeness increase usefulness but are not strictly required.

---

## Batch 19 — Setup & Readiness Center

### Owner
Home during incomplete setup; Settings as permanent management entry.

### Placement
- small dismissible/readiness card on Home only while actionable
- complete checklist inside Settings

### Data decision
Derived readiness checks only:
- company profile
- tax/registration data
- bank/document settings
- numbering
- security/recovery
- backup/cloud state
- product cost completeness
- optional AI/provider readiness where accurately observable

### Risk
Low.

### Dependencies
None. Recommended early after Data Quality.

---

## Batch 20 — Data Center

### Owner
**Settings / More**.

### Placement
One product-management surface for:
- backup/restore
- cloud sync health
- storage usage when measurable
- export
- import history where actually persisted
- recovery/diagnostics
- audit viewer later

Do not duplicate existing cloud/security controls; deep-link or reuse canonical actions.

### Data decision
Phase A can be presentation over existing capabilities.
Persisted import/export history should be added only if it has a clear support/recovery purpose.

### Risk
Low-to-medium for presentation; high for destructive restore/import actions, which must retain existing confirmation/integrity rules.

---

# 5. Recommended execution order after Batch 0

The feature numbers remain stable for planning, but implementation order should follow risk/dependency rather than numerical order.

## Phase A — Derived/read-only value first

1. Batch 3 — Customer 360 + Supplier 360 (read-only/derived first)
2. Batch 5 — Data Quality / Business Health
3. Batch 19 — Setup & Readiness
4. Batch 18 — Profitability Center, only the portions supported by current deterministic cost data

Reason: high user value, minimal schema risk, immediate validation of information architecture.

## Phase B — Commercial operating layer

5. Batch 1 — Commercial Flow + manual Quote Tracking
6. Batch 2 — Sales Pipeline / Opportunities
7. Batch 4 — Notification & Follow-up Center
8. Batch 11 — Recurring draft workflows
9. Batch 7 — Price Lists / Pricing rules

## Phase C — Operations and finance expansion

10. Batch 6 — Inventory Planning
11. Batch 8 — Accounts Payable / Supplier Finance
12. Batch 9 — Tax/VAT Center (sales/output stage first; purchase/input only when source data exists)

## Phase D — External/customer boundary

13. Batch 10 — Secure Customer Portal

This is intentionally delayed until commercial tracking and share-security semantics are stable.

## Phase E — Platform/workspace boundary

14. Batch 14 — Multi-Company workspace/keying foundation
15. Batch 12 — generalized Activity/Audit model if not already completed earlier
16. Batch 13 — Teams / Roles / Approval on workspace-scoped security

Batch 12 may safely begin earlier, but its actor model must remain forward-compatible with Teams.

## Phase F — Full operational scale

17. Batch 15 — Cash & Bank / Treasury
18. Batch 16 — FX / Exchange Rate Layer
19. Batch 17 — Warehouses / Stock Locations
20. Batch 20 — mature Data Center / administration consolidation
21. Batch 18 — final advanced profitability extensions that depend on new financial/warehouse data

---

# 6. Route-growth policy

Default rule: **no new primary route** unless the capability becomes too large for its canonical workspace.

Planned initial ownership:

- Home: Action Center, Notifications summary, Data Health summary, Readiness
- Documents: Commercial Flow, Quote Tracking, recurring commercial workflows
- Customers: Customer 360, Pipeline, Opportunities, portal/share entry
- Products & Inventory: planning, price lists, warehouses
- Purchasing: Supplier 360, procurement-facing supplier details
- Finance: Receivables, Supplier Payables, Expenses, Treasury
- Reports & Insights: Tax, Profitability, FX consolidated management reports
- Settings / Account / More: Teams, Workspaces, Data Center, Readiness configuration

Mobile continues to use Home / Documents / Create / Customers / More.

---

# 7. Migration classes

### Class A — Derived / no schema migration
Examples:
- Customer/Supplier 360 initial views
- Data Quality findings
- Readiness
- Profitability extensions supported by existing data

### Class B — Additive encrypted-vault migration
Examples:
- Commercial tracking records
- Opportunities
- Tasks/follow-ups
- inventory planning policy
- price lists
- recurring workflows
- generalized activity events

Requirements:
- increment schema version
- deterministic default migration
- old backup compatibility where practical
- cloud merge/reconciliation coverage
- tests for upgrade and concurrent writes

### Class C — New financial subsystem
Examples:
- supplier payables/payments
- treasury
- FX where used in management consolidation

Requires financial invariants, reversal/deletion policy, chronology tests and currency rules before UI implementation.

### Class D — Security/platform boundary migration
Examples:
- secure customer portal
- multi-company workspaces
- teams/shared access

Requires dedicated threat model and encryption/cloud architecture before implementation.

---

# 8. Mandatory acceptance gate for every implementation batch

Before a batch can move from planning to code, its PR plan must state:

- canonical owner screen
- desktop placement
- mobile placement
- new/derived data
- exact schema additions, if any
- migration behavior
- offline behavior
- cloud sync behavior
- deletion/reversal behavior
- currency semantics
- AI boundary
- RTL/Arabic behavior
- accessibility targets
- security/privacy boundary
- dependencies
- regression tests
- rollback strategy

For financial or security Class C/D work, implementation must not begin from a UI mock alone.

---

# 9. Batch 0 closeout criteria

Batch 0 is complete only after:

- all current canonical screens are inspected against this placement map
- the live/preview UI is visually checked when deployment access is available
- each proposed batch is classified A/B/C/D
- dependencies and safe execution order are frozen
- no existing capability is being duplicated under a new name
- schema-impact batches have an explicit migration plan
- portal/teams/workspaces have explicit security architecture
- finance expansions have deterministic accounting semantics
- mobile/RTL placement is specified before implementation

Until this gate closes, the branch must remain planning-only and must not change production business behavior.

# Batch 3 — canonical records and compact workspace context

Baseline: merged Batch 2, main `5be6eb81b38afc68346345a1e138cb9b83e99773`.

## Findings and implementation

- Documents density already shipped in Batch 1; retained rather than repeated.
- Global Search had correct document actions but customer/product/supplier/purchase results merely opened general directories. Exact identity events now open the canonical record. Multiple search tokens must all match; arrows and Enter support quick selection. An empty result offers workspaces and creation as a next action.
- Products & Inventory already owns catalog/pricing/inventory/planning/locations/movements. Its nested catalog repeated a hero and explanatory note. Integrated use now suppresses those duplicate intros; standalone Product Library retains them. The existing price-list edit event had no listener; it now uses the same editor and discard review as normal product selection. No new editor or lifecycle is introduced.
- Customer 360 already derives receivables by currency and product activity. It now surfaces billed values, last activity and latest quotation before history. The latest quotation is derived across all linked records, not limited to the twelve-row preview. Supplier 360 surfaces last activity/latest purchase. Timelines and separate share/audit sections use native accessible disclosure, retaining every existing record.
- Finance already has real Cash & Bank, FX, Receivables, Supplier Payables and Expenses. Its long duplicated title becomes a concise Finance title; the existing tabs and explanations retain the operational scope. No unsupported balances are implied.
- Purchasing retains its current split register/editor and exact supplier/purchase navigation; all existing discard/mutation guards remain in force.
- Reports, Settings, More, Create and notifications retain their current ownership. Reports already expose period/currency/customer filters, trends and drill-down; Settings already has task-specific sections and search. A broad cosmetic rewrite was not necessary to close the concrete gaps above.

## QA and efficiency

Current compiled behavior tests cover exact identities, AND search, archived exclusion, stale identity rejection, active-form protection, dirty product switching, and a latest quote beyond twelve recent records. Integrated browser paths cover search to Customer/Product/Supplier/Purchase, keyboard choice, reviewed product save, concise Finance and opening/closing native histories at 320 Arabic dark, 390 English light, 820 Arabic light and 1440 English dark. Existing relationship mobile coverage remains.

The already documented NON-BLOCKING historical unit/browser archives now run only when explicitly selected through `workflow_dispatch` with `legacy_diagnostics=true`. Every current blocking security/build/contract/WebKit/browser/quality gate remains required. This implements the requested economical policy without weakening any current gate.

Legacy relationship source assertions predate real Supplier Payables and a purchase accounting snapshot, and the old CI contract expects an obsolete quality-step label. They fail on main too; their unrelated historical expectations are not debugged or made blocking here.

The path-triggered CRM gate exposed a stale literal schema-15 assertion although legitimate main already uses schema 21. That blocking assertion is replaced with current-vault runtime invariants: preparing an opportunity cannot mutate the vault, and appending its event preserves the schema and every non-event collection. All other CRM safety checks remain intact.

## Boundaries

No stored schema, deterministic accounting engines, authentication, PIN, PDF, inventory posting, issued documents or dependencies change. The added quotation field is a read-only transient relationship projection. Browser saves exercise the real form callback in an isolated fixture; encrypted persistence ownership is unchanged. Physical Safari is not available. Review used the React best-practices checklist for listener cleanup, primitive dependencies, canonical state and native keyboard/disclosure semantics.

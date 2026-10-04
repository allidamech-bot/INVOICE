# Batch 3 — canonical records and compact workspace context

Baseline: merged Batch 2, main `5be6eb81b38afc68346345a1e138cb9b83e99773`.

## Findings and implementation

- Documents density already shipped in Batch 1; retained rather than repeated.
- Global Search had correct document actions but customer/product/supplier/purchase results merely opened general directories. Exact identity events now open the canonical record. Multiple search tokens must all match; arrows and Enter support quick selection. An empty result offers workspaces and creation as a next action.
- Products & Inventory already owns catalog/pricing/inventory/planning/locations/movements. Its nested catalog repeated a hero and explanatory note. Integrated use now suppresses those duplicate intros; standalone Product Library retains them. The existing price-list edit event had no listener; it now uses the same editor and discard review as normal product selection. No new editor or lifecycle is introduced.
- Customer 360 already derives receivables by currency and product activity. It now surfaces billed values, last activity and latest quotation before history. The latest quotation is derived across all linked records, not limited to the twelve-row preview. Supplier 360 surfaces last activity/latest purchase. Timelines and separate share/audit sections use native accessible disclosure, retaining every existing record.
- Finance already has real Cash & Bank, FX, Receivables, Supplier Payables and Expenses. Its long duplicated title becomes a concise Finance title; the existing tabs and explanations retain the operational scope. No unsupported balances are implied.
- Purchasing retains its current split register/editor and exact supplier/purchase navigation; all existing discard/mutation guards remain in force.
- Reports, Settings, More, Create and notifications retain their current ownership. Reports expose period/currency/customer filters, trends and drill-down. Settings has seven task-specific sections; it does not have Settings search. The closeout below records the remaining UX changes and acceptance separately.

## QA and efficiency

Current compiled behavior tests cover exact identities, AND search, archived exclusion, stale identity rejection, active-form protection, dirty product switching, and a latest quote beyond twelve recent records. Integrated browser paths cover search to Customer/Product/Supplier/Purchase, keyboard choice, reviewed product save, concise Finance and opening/closing native histories at 320 Arabic dark, 390 English light, 820 Arabic light and 1440 English dark. Existing relationship mobile coverage remains.

The already documented NON-BLOCKING historical unit/browser archives now run only when explicitly selected through `workflow_dispatch` with `legacy_diagnostics=true`. Every current blocking security/build/contract/WebKit/browser/quality gate remains required. This implements the requested economical policy without weakening any current gate.

Legacy relationship source assertions predate real Supplier Payables and a purchase accounting snapshot, and the old CI contract expects an obsolete quality-step label. They fail on main too; their unrelated historical expectations are not debugged or made blocking here.

The path-triggered CRM gate exposed a stale literal schema-15 assertion although legitimate main already uses schema 21. That blocking assertion is replaced with current-vault runtime invariants: preparing an opportunity cannot mutate the vault, and appending its event preserves the schema and every non-event collection. All other CRM safety checks remain intact.

## Boundaries

No stored schema, deterministic accounting engines, authentication, PIN, PDF, inventory posting, issued documents or dependencies change. The added quotation field is a read-only transient relationship projection. Browser saves exercise the real form callback in an isolated fixture; encrypted persistence ownership is unchanged. Physical Safari is not available. Review used the React best-practices checklist for listener cleanup, primitive dependencies, canonical state and native keyboard/disclosure semantics.

## Reopened sequential closeout — implementation verified, merge pending

Baseline: main `867845f543657b0b8e47a4e72353decda671d25c`, after #500
closed Batch1 and #501 closed controlled Batch2 with every current blocking gate
passing. Branch `audit/batch3-workspace-closeout`; no closeout PR or merge yet.

The earlier scoped improvements above do not establish every workspace's
acceptance. Current additional implementation:

- Operations search-empty states no longer falsely imply that the underlying
  register is empty. Clear search returns to existing records without mutation.
- True supplier/purchase/expense empty states offer the existing canonical
  editor; purchase discard protection and busy state are retained.
- Reports period-empty state offers Reset filters, restoring all separately
  reported currencies through today and clearing transient search only.
- Reports phone introduction/actions are compact within the existing v485
  owner: decorative repeated kicker hidden, all three actions retained in one
  64px-minimum row, full currency-separation explanation kept. First financial
  metric must appear by y=650 at 320/390 rather than below the former tall hero.
  Final browser positions PASS without subtracting ancestor scroll: 611.6px at
  320 AR/dark and 606.8px at 390 EN/light; 820/1440 also PASS. Accounting logic,
  CSV generation and printing callbacks remain unchanged.
- Product catalog now shows recorded stock beside SKU, description, cost and
  selling-price context. It reuses `inventoryBalances`; draft purchases do not
  create stock. Known zero and unavailable standalone stock context differ.
- Product and inventory-planning filtered-empty states clear transient filters;
  genuine empty catalogs open the existing guarded product editor. Planning
  unavailable/locked state offers read-only retry and loading announces status.
- Quick Create puts Quotation and Commercial Invoice first while retaining all
  ten document types, canonical callbacks and review guards.
- Locked notifications now report the unreadable vault, not a false healthy
  empty result. Switching tabs cannot erase that error. Retry resumes the same
  read-only projection; a genuine empty state offers Return to workspace.

### Original workspace acceptance mapping

| Surface | Existing ownership / closeout decision | Evidence |
| --- | --- | --- |
| Documents | Keep Batch1 compact search/status/list and progressive creation; no types removed or lifecycle changed | Merged Batch1 responsive acceptance; final current auth-documents/mobile gates required |
| Customers / 360 | Currency-separated business summary, activity, latest quotation and common products precede disclosed history; canonical next actions retained | `run-workspace-ux-batch3.cjs` customer exact-open and disclosure PASS; latest quote beyond twelve records contract PASS |
| Products | Compact integrated catalog, existing pricing/margin context, recorded stock and useful filtered/true-empty actions | Recorded movement/zero-context contracts PASS; reviewed product save and catalog browser paths PASS |
| Inventory | Existing balance/movement/location ownership; planning explains recorded stock, reorder and advisory limits; retry/clear/create actions added | Existing planning contracts PASS; actual encrypted vault lock/unlock/retry and filtered recovery PASS |
| Purchasing | Keep split register/editor, supplier/status/currency/cost and landed-cost/payment context; distinguish no matches from no records | Browser search recovery, guarded draft opening and canonical purchase exact-open PASS; no automatic posting |
| Suppliers | Existing identity, payment terms, recent purchase/activity and real linked payable summary; empty register opens supplier editor | Supplier exact-open and reviewed supplier save PASS; derived relationship history is not mislabeled Accounts Payable |
| Finance | Five real operational tabs: Cash & Bank, FX, Receivables, Supplier Payables, Expenses; compact introduction; no invented accounts or balances | Representative Finance browser paths PASS; existing final business-current payments gate required; accounting engines unchanged |
| Reports | Keep metrics, currency, period, profit/tax/performance views and drill-down; empty period resets filters | Four representative reset/tab paths PASS; source documents/payments unchanged. A future as-of date can legitimately retain historical receivables; test uses a genuinely empty pre-source period |
| Settings | Keep seven real sections: Workspace, Companies, Commercial, Documents, Access, Data Center, Security; separate account/company scope | Source ownership inspected; existing actual Settings numbering-save/viewport acceptance reused in final gate. No nonexistent settings/search advertised |
| More | Keep existing workspace/security/notification navigation rather than duplicate routes | Existing actual More scroll-end/release and current shell navigation gates retained |
| Global Search | Canonical record identity, AND tokens, arrows/Enter, helpful empty actions and dirty/stale safeguards | Four integrated customer/product/supplier/purchase paths and focused contracts PASS |
| Create | Common sales actions first, same ten canonical document actions and review guards | Four representative menu count/order paths PASS; existing Create/current navigation gates retained |
| Notifications | Explicit loading/error/retry, no healthy empty claim for locked data, useful healthy-empty return, existing reviewed mutation flow | Locked/retry/empty and locked-tab-switch browser paths AR/EN PASS; existing three notification mutation/geometry scenarios PASS |

Local acceptance uses Chromium 320 Arabic/dark, 390 English/light, 820
Arabic/light and 1440 English/dark, with the shared Safari-sensitive Settings/More
viewport gate retained. Eleven focused workspace/notification behavior tests and
six existing relevant inventory-planning contracts PASS. TypeScript, production
build, static security (230 files), dependency audit (zero vulnerabilities) and
diff check PASS. Relevant checks were rerun after the last notification tab
guard and passed, including actual Settings save and More release in WebKit.
All current blocking CI checks must pass on the final PR
HEAD before merge. Test fixtures use production root ancestry and standalone
style owners; required Reports props are supplied rather than bypassed. Screenshot
review found that production ThemeControl initialization overwrote the fixture's
pre-mount theme attribute. The fixture now uses the existing persisted theme
preference API, and both workspace runners assert the actual resolved theme.
Only the affected four-case workspace paths are rerun for this fixture correction.

Form-save smoke exercises real component callbacks in isolated fixtures. Actual
encrypted persistence is exercised for planning/notification session recovery
and the existing current commercial/payment gates; no production storage
write path changes in this batch. Physical Safari/iPad verification remains
unavailable. No live AI calls are needed for workspace UX.

React Best Practices review: local filters stay component-owned; no derived
business effect is introduced, no new global listener, async mutation or
dependency; stock is memoized from the existing deterministic engine and new
buttons call the existing guarded editor methods. Unrelated components and
deterministic engines remain unchanged. Batch3 remains open until final gates
and merge; Batches4–7 remain unclosed.

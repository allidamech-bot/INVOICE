# Batch 4 — contextual intelligence

Baseline: merged Batch 3, main `934ee61141eae4953ad7b96fa27d6ce4b9218852`.

## Existing architecture retained

AppShell already owns one Advisor. AI Inbox already classifies uploads, pasted text and voice, then delegates to customer/product/supplier/quote workflows. Customer Capture, procurement comparison, Collections, daily priorities, Guardian and approval workflows remain intact. This batch changes discoverability and bounded context, not parsing or mutation engines.

## Implementation

- Documents and Products expose a single compact Create from file action using the existing typed Inbox. The selected destination is visible before analysis; source evidence, matching, pricing review and confirmation remain in the existing workflow.
- Customer profile, saved-product editor, document items, operational Finance, Purchasing and Reports expose short contextual actions. They open the existing Advisor with a bounded question. Opening performs no provider request and creates no proposal; the user chooses Send. Wrong-screen, busy, applying and unmounted events are rejected.
- Saved product pricing shows existing deterministic margin, cost change, missing metadata, currency mismatch/below-cost and duplicate signals. It labels saved records explicitly, cancels stale view updates and never applies a price. A focus identity keeps the selected product within the existing thirty-row limit without changing calculations.
- Report explanations include complete rows from the selected period. Currency rows remain separate, incomplete profitability stays explicit, oversized context omits whole rows and declares the omission. No invented period comparisons.
- Dashboard's existing daily intelligence and customer capture were already inline and were preserved.

## Validation

TypeScript, production build, static security and dependency audit; four compiled behavior tests; representative Arabic dark 320 / English light 390 / Arabic light 820 / English dark 1440 browser paths. Seven current/contextual contracts PASS; WebKit 320 AR dark PASS, including editor context. A real mobile product-editor layering defect prevented closing the Advisor; the existing semantic modal layer now places Advisor above editors and below modal review. Browser interception ensures opening context/capture invokes zero provider calls. Existing approval/safety contracts are retained.

## Limits

No provider credentials or independently accessible deployment are available for paid/live canaries in this workspace; no live-provider result is claimed. Browser fixtures prove entry, routing and review-first behavior, not live extraction quality. Product evidence requires an unlocked Vault. Physical Safari hardware is unavailable.

A sampled historical v264 test still expects inline fetch JSON instead of the requestAiJson helper already present on baseline main. Six other deterministic v264 checks passed; this stale non-blocking assertion was not modified or repeatedly debugged.

CI initially rejected the Documents fixture because its hard-coded five-action contract predated the new capture action. The contract now requires all six actions, explicitly verifies capture, and retains compact hero, overflow, 44px targets and paired-row geometry checks.

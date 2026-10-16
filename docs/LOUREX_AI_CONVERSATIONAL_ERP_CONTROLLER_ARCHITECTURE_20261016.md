# LOUREX AI — Conversational ERP Controller

Date: 2026-10-16
Repository: allidamech-bot/INVOICE
Status: **Approved product architecture; incremental engineering implementation.**
First UI implementation: draft PR #755 (not merged or deployed).

## Product behavior

LOUREX AI is an operating workspace, not a chat-only response formatter. A user may ask in natural Arabic or English to search product groups, check stock, prepare a quotation, modify line quantities, choose delivery terms (e.g. CIF), preview the exact PDF, edit repeatedly, or explicitly approve or reject. An answer must distinguish *reported facts*, *unsaved proposed changes*, and *successfully persisted changes*.

### One canonical in-chat document card

The existing Controller's \`ConversationDocumentCard\` is the only normal, active document action surface. It reuses \`workspaceDocument\` and the existing \`prepareAiPdfPreview\`/canonical renderer, original proposal callback, signed review gate, and editable workspace. It replaces a separate approval panel for the same artifact and includes:

1. **Preview PDF:** render a real current-revision A4 PDF; no save, issue, send, or stock change.
2. **Edit:** open the current working document editor; retain rows/revisions, invalidate stale review/PDF on revision changes.
3. **Approve and save:** show the full grounded item and totals review, require acknowledgement of *this* proposal, then invoke the existing original guarded approval. A draft with no pending proposal requests a fresh saved-draft proposal rather than directly writing records.
4. **Reject:** decline a pending save with the original callback while retaining a fresh editable unsaved draft. Without a pending approval, explicit confirmation permits discarding only the exact current unsaved working artifact. Historical chat and persisted business records remain intact.

Fallback: if a proposed document has no hydrated scoped working artifact, the existing \`InlineDocumentApproval\` remains available, avoiding a broken missing-action state. Never render this fallback **alongside** the canonical document card for the same current artifact.

Existing \`QuotePreviewSummary\`, \`ArtifactWorkspace\`, \`PricingGrid\`, PDF A4 renderer and draft workflow are reused. No second document editor, duplicated save engine, or independent approval implementation is authorized.

## Current engineering inventory

| Existing code | Present capability | Limitation / next step |
| --- | --- | --- |
| \`src/components/AiConversationWorkspace.tsx\` | Controller/Advisor and scoped document/record conversation UI | Unified document action card delivered in PR #755; live Safari and real authenticated tests pending |
| \`src/lib/ai-intelligence-runtime.ts\` | Scoped kernel state, revisions, signed approval receipts and rollback | Explicit exact-revision unsaved-draft discard delivered in PR #755 |
| \`src/lib/ai-workspace-model.ts\` | Editable proposal rows, terms and full financial review | Preserve one source of truth for all changes |
| \`src/lib/ai-pdf-preview.ts\` | Real template preview without a vault write | Verify real output and exact revision on iPhone |
| \`src/lib/ai-tool-orchestrator.ts\` | Typed read, calculate, prepare, execute and protected high-impact registry | Multi-entity natural-language execution remains incomplete |
| \`src/lib/ai-product-bulk-update.ts\` | Product SKU/price/category updates | **Not** a stock quantity ledger mutation |
| \`src/lib/inventory-evidence.ts\`, \`src/lib/operations.ts\` | Audited inventory movement and supporting reason / attachment validation | High-impact stock adjustments remain outside normal AI execution |

## Next Controller implementation phases (not claimed delivered by PR #755)

1. **Structured entity results:** company/branch-scoped product, customer, supplier and stock results in paginated, selected, referenced lists; avoid arbitrary, fabricated or model-generated markdown inventories.
2. **Document-intent orchestration:** a user can say "10 cartons from each saved product in group X, quotation, CIF Jeddah". Resolve exact product IDs, carton units, customer, currency, prices and missing freight/insurance inputs. Show uncertainty instead of guessing.
3. **Revisions and approval:** "increase this product by 50" patches only referenced line IDs in the working draft. Preview and approval must always bind to the exact revision; no detached copy.
4. **Inventory intent orchestration:** distinguish (a) counted stock reconciliation to a physical target quantity, (b) issue/consumption with proof, (c) planning target only. Read location-specific validated movements, calculate delta, and require original protected movement posting, operator authorization, reason category and evidence. Never update master product metadata as a substitute for inventory transactions.
5. **Cross-domain completeness:** customer and supplier flows, purchasing, draft billing, issuance, fulfilment and reporting through existing domain engines. Each domain keeps its own business approval and mutation semantics. No universal "write anything" executor.

## Non-negotiable controls

- No live company or production record modification during code QA.
- Do not invent a SKU, customer match, price, currency, cost, warehouse or CIF insurance/freight figure.
- All mutations are scoped to authenticated account, active company, branch, role and expected document revision.
- Stock movements remain audited with documentary evidence. PDF preview and draft quotation creation do not post inventory.
- Pending proposal approval handlers are **reused** and never shadowed by new standalone direct-save callbacks.
- No duplicate action cards, duplicate editor, duplicate PDF pipeline or separate proposal state store.
- Atomic save and full post-commit verification; fail closed on stale state and missing data.
- Default release protocol: draft PR, typecheck, build, tests, real browser/mobile acceptance, only then explicit merge/deployment approval.

## PR #755 acceptance matrix

- Exactly one in-chat card per working document; all four primary actions are visible for unsaved documents.
- PDF is generated only from the current revision, never as an approval or a write; PDF result invalidated on changes.
- Editing, undo and redo reuse existing scoped kernel.
- Reviewed confirmation only invokes the original protected approval, and a decline cannot save.
- Reject without a pending action requires explicit confirmation and scope/revision proof.
- Existing Safari tests, PDF tests and all finance/stock regression suites must remain green.

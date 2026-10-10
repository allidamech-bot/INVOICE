# LOUREX conversational rebuild — implementation and acceptance ledger

Base: `00117b9b7109c82e34b9fcc0c8fafe6cd03a4e61` (PR #691), 2026-10-10.
Production deployment `dpl_4S4bvun6GJPNTQDm7TmhdXs7orBX` is synchronized with that main commit.

## Observed production defect
In the actual signed-in browser, an Arabic request for Red Bull (4000 cartons × USD 22.50), Monster (2000 × USD 22.00), USD 3000 freight and Mersin delivery produced a flattened preview. The next request to add 500 Red Bull cartons and reduce its price by half a dollar was routed to catalog bulk updates and failed with “Product was not found in the active company.” No business mutation was approved or performed.

## Actual architecture
The source AiCopilot is not the final shipped component. The build successively rewrites its compiled JavaScript with assistant scopes/history, source handling, local tool orchestration, presentation and voice owners. Ai-core sanitizes a single business message. Ai-conversation-v3 requires attachments and is read-only. Ai-tool-client runs local parsers, otherwise sends a current-message-only tool plan; its preview result is not a durable commercial draft. Assistant provider memory uses two short messages and a truncated textual summary. Ai-document-conversation supports narrow command Regexes and 20 newly prepared rows.

The new source-owned conversational engine is connected at the final compiled request handoff. It receives ordered conversation history and an authoritative structured draft, not just a truncated command string. It interprets intent, plans evidence-backed unsaved revisions, validates them transactionally, uses the existing money engine, generates a review and presents interactive customer choices. Nonquotation business tools retain their existing controllers and approval paths. Personal conversations retain their existing local memory/task commands. Personal and temporary model requests exclude company entities, attachments and drafts.

## Invariants
- Model output never writes the vault. Operations only revise an unsaved in-memory draft.
- Values need exact current-message or source evidence; customer choice needs current user selection.
- Customer order is stable within the thread and filtered to current-company access. Ordinal selection resolves that order.
- Commercial state is keyed by operator, scope, company, branch and thread; durable business snapshots use the existing encrypted assistant store.
- Temporary conversations do not persist. Personal conversations cannot prepare company writes.
- Missing packaging ratios/allocation block save. Known line counts use deterministic conversion.
- Existing approval guards remain mandatory inside the atomic vault mutation. Existing 20-row guard remains for legacy unreviewed proposals; the full-table conversational path validates up to 200 reviewed rows without dropping rows.
- Shipping and all explicit packing details are retained in the saved proposal. Conversational previews explicitly exclude tax/discount until reviewed in the document editor; no hidden company tax default changes a reviewed total.
- Errors preserve the message and draft; failed attachment requests keep their queued files. Cancellation aborts the request before its semantic state commits.

## Models
Current routing is retained: Groq Qwen for ordinary/Arabic conversation, GPT-OSS for deep reasoning, Cloudflare Gemma/Nemotron and Gemini failover. Official free-tier eligibility verified on 2026-10-10; quota exhaustion must still be handled as an error/fallback, never as permission to upgrade. Provider quality/latency rankings require actual request measurements; no unsupported benchmark claim is made.

Primary references:
- https://console.groq.com/docs/rate-limits
- https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/

## Verification
39 targeted tests passed initially, including the existing document approval, branch isolation, source sanitation, unified assistant, orchestration and iOS voice owner tests. New reducer tests cover ten-turn draft retention, Arabic ordinal choice, half-dollar changes, deterministic freight, missing/known pallet conversion, transactional rollback, malformed restoration and 21 reviewed rows.

Browser acceptance is still in progress. Production diagnosis is verified; the new implementation must be exercised on its feature preview before readiness. No production deployment or merge is authorized. Actual iPhone/iPad microphone and keyboard behavior cannot be inferred from desktop tests.

Known architecture limits: responses use structured JSON; native token streaming is not supported by this route. The interface offers progress/cancel controls without pretending that delayed text is genuine provider streaming. Attachments retain the existing four-file extraction boundary. Lists beyond 200 rows require explicit splitting; they are rejected rather than silently truncated.

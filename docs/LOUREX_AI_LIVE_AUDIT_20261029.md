# LOUREX AI — live audit, 29 October 2026

Scope: AI Controller/Advisor, routing and conversation persistence only. No business records, Firebase rules, financial modules, merges or releases were changed. One read-only Controller turn was submitted; it used the local plan. No synthetic or private-data provider probes were run.

## Revision evidence

- Reference audit read in full: `LOUREX_AI_AUDIT_2026-10-29.md` (11 findings).
- First main observation: `e7de8041e7145f86f684eb7068efda97d89c2175`.
- At the first deployment lookup, production still referenced `358cd40cc960eada2583617207d57bb1fc164087`.
- Production changed during the investigation. The authenticated browser's diagnostics reported `e7de8041e7145f86f684eb7068efda97d89c2175`, build time `2026-10-29T08:25:46.546Z`. A subsequent Vercel lookup confirmed production deployment `dpl_AHe4yXyqSGEN9pd15HMv9oAtNdPy`, READY, at the same SHA.
- Implementation checkout baseline: `79f20986772b5d5638d3c06716ad3864d4dd4b92` (financial work continued independently). No financial changes from that baseline are part of this patch.

## 1. Saved quotation lookup

**Current result: PASS in the correct account. Account mismatch explains this session's initial missing-document result. Historical planner timeout is separately evidenced; do not conflate the two.**

1. The first authenticated account showed seven documents in its main company and five in its authorized test company. Exact lookup of `QUO-2026-0009` returned zero in both. Its synchronized conversation history contained the local `Document was not found in the active branch` reply. No search bypass or cross-account fallback was attempted.
2. The owner explicitly identified that the quotation belonged to another account and signed into that account themselves. Identifiers and contact details are omitted here.
3. In the second account, Documents showed one exact match: quotation `QUO-2026-0009`, six items, USD 2,247.00, issue date 2026-10-27, draft/ready status, under `LOUREX / Main Branch` (company profile displays a QA release-test identity).
4. One exact read-only Controller request returned that quotation, all six items, USD 2,247.00 and date 2026-11-03. Its activity disclosure explicitly reported **local plan**, document **read completed**, and local reading/calculation. Input controls became enabled after completion. No approval or save was invoked.
5. The correct account's 28 October thread contains the earlier planning-timeout reply. Its 29 October thread contains the successful local read and appears in synchronized account history. The missing-document replies inspected in the first account must not be presented as evidence of a defect in the second account.

`src/lib/ai-named-record-read.ts` resolves the exact quotation inside the scoped vault, and `src/lib/ai-tool-orchestrator.ts` returns the stored document's kind, dates, items and totals. The production read succeeded without weakening these checks. No lookup, synchronization, scope, record or permission repair is justified by the collected evidence.

### Limits of reconciliation

The read-only UI established record presence, number, type, status, item count, totals and dates. It did not expose a safe canonical internal document ID, raw revision pair, Firebase UID or explicit operator-role enumeration. Those were not extracted from hidden application state or raw decrypted storage. Successful authorized document access is not proof of every administrative privilege. Exact underlying revision/CAS reconciliation and original historical deployment context remain unproven; neither is necessary to invent a current lookup failure after the successful read.

## 2. Confirmed AI presentation defect and minimal patch

**Reproduced in production:** the successful quotation read was titled `فاتورة QUO-2026-0009`; its validity date was labeled `تاريخ الاستحقاق`.

**Root cause:** `financialReadoutFromToolRows` in `src/lib/ai-financial-readout.ts` hardcoded the Invoice title for every document and hardcoded Due date for every `dueDate`, ignoring the returned `kind`. The text fallback in `src/lib/ai-tool-presentation.ts` already selected the title by kind, but also used Due date unconditionally.

**Patch:** use the actual `kind` for the typed title; `proforma` gets Quotation and Valid until (Arabic equivalents), invoice retains Invoice/Due date, and unknown kinds use Document. Align the fallback's date label. No schema, history migration, money calculation, authorization or persistence change.

Previously saved typed snapshots are not rewritten. Re-read the quotation after the reviewed patch is merged and deployed to verify the new presentation. The patch does not repair name spacing already stored in the customer snapshot or alter PDF output.

**Validation:** new synthetic six-line fixture reproduces the title/date defect independently of private records. Before implementation, the focused run failed with `فاتورة QUO-2026-0009` instead of `عرض سعر QUO-2026-0009` and misclassified an unknown kind as Invoice. After the patch, production build succeeded and these two suites passed, 18/18:

```sh
npm run build
node --test tests/ai-typed-financial-evidence-20261019.test.mjs tests/ai-financial-reply-presentation-20261019.test.mjs
```

An intermediate run against tsc-only output passed seven tests and failed the existing compiled-payload assertion because the repository's post-build AI injection had not run. Running the actual production build resolved that artifact prerequisite; the complete targeted run then passed. No tests were suppressed or weakened.

## 3. Planner budgets and provider errors

**Historical timeout confirmed; provider-specific root cause BLOCKED.**

- Correct-account history shows `انتهت مهلة تخطيط الإجراء` for the earlier numbered-quotation question. Current exact question uses the local path and succeeds; this validates the deterministic-read behavior introduced by PR #1150 for this record.
- `src/lib/ai-tool-client.ts`: planner client budget 15,000 ms; the browser classifies HTTP 429/`AI_RATE_LIMITED` as rate-limited, and HTTP 504/`AI_TIMEOUT` as timeout.
- `api/ai-inbox.js`: tool-plan uses `business_copilot`, a total 11,000 ms budget and a nominal per-attempt cap of 12,000 ms. The router constrains attempts to remaining time and reserves for alternatives. The global 50-second ceiling is not this route's actual budget.
- `api/_ai/router.js`: 429 becomes rate_limit and is not immediately retried on the same vendor; 408/504 become timeout. An expired attempt moves to an eligible alternative; the total budget bounds the chain. Safe telemetry records request ID, task/provider/model, category, latency and fallback/attempt index, without prompts or records. Adaptive/circuit state is per process, not a global durable service.
- Private text model policy is restricted to approved Groq/Cloudflare models. An env-eligible vendor in the diagnostics UI is not automatically authorized for private business prompts. External synthetic routing requires the explicit public-synthetic/workspace-help gate.
- Production diagnostics in the first authorized account displayed key/configuration presence for Groq, Cloudflare, Gemini, OpenRouter and Ollama, with Kilo diagnostic-only. All inference indicators were untested. This proves configuration visibility, not live quota or successful inference, and was not re-probed after account switching.

### Runtime-log blocker

The scoped Vercel runtime-log query for this project and its then-current production deployment failed at page 0 with **403 Forbidden**. This is an API authorization failure, not an empty log result. A Vercel CLI fallback was unavailable in the executor. Deployment metadata access succeeded, but does not imply observability access.

**Required next evidence:** enable an authorized read-only Vercel runtime-log connection for project `invoice`, or provide a redacted export for the failing `/api/ai-inbox` request containing request/deployment IDs, task type, attempt count, approved provider/model, category and timings. Exclude prompts, response bodies, keys and tokens. Without that trace, no Groq-specific diagnosis, timeout increase, provider replacement or retry change is justified. A fresh synthetic success would not explain the historical timeout, so no live probe was spent.

## 4. Conversation stability / PR #1142

**Bounded live checks passed; multi-device failure acceptance remains open.**

- Both accounts showed synchronized history under their own authenticated sessions. Correct-account existing threads opened; the successful new read appeared in synchronized history.
- The local request completed without the previous raw `host.__intelligenceKernel.scope` exception or stuck loading. No provider-failure turn or cross-device concurrency was induced.
- Source review confirms `captureTurn`, generation/kernel/mode/scope ownership guards, abort racing, account checks around history synchronization, and `pending=false` cleanup. Remote advances/deletions cancel a turn and preserve only unapproved recovery state. Cancelled approval IDs are checked before execution.
- No new defect in PR #1142 was reproduced. No lifecycle/history fix or repeated Chromium/WebKit suite was performed. Cross-device last-writer behavior, failed-provider cleanup and cancelled-approval recovery are not declared live-certified.

## 5. Production settings/data versus code

| Category | Result / action |
|---|---|
| Account selection | Confirmed initial mismatch. Use the account containing the quotation. Keep tenant/branch isolation. |
| Quotation persistence | Record and current scoped local read succeeded. No restore, migration, cloud overwrite or data repair. |
| AI presentation | Confirmed code defect, patched with targeted regression. |
| Historical provider timeout | Trace unavailable; observability authorization required. No speculative routing patch. |
| History | Bounded opening/sync/read checks pass; multi-device/failure acceptance remains open. |
| PDF preview versus saved PDF | Not re-tested or modified; outside this narrowly proven presentation fix. |

## 6. Remaining iPhone acceptance after review/deployment

1. Correct account and branch: re-read `QUO-2026-0009`; verify Quotation/عرض سعر, expiry/انتهاء الصلاحية, six items and USD 2,247.00 without save/approval.
2. Reopen the synchronized thread from a second device with the same account. Existing stored snapshots can retain their previous labels; new reads must use the corrected labels.
3. One bounded provider-failure/cancellation flow only when safe trace access is available: verify request classification, released input, no hidden retries or unintended mutation.
4. If a recovered draft exists, confirm a declined approval cannot be revived or executed. Do not create business records solely for this check.
5. Same-revision preview/saved PDF comparison remains a separate acceptance item; changes to shared financial/PDF code require its owning track.

Delivery: draft PR only, no merge or deployment. CI runs automatically after the push; its result is not pre-certified by this local report.

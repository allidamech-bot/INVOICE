# LOUREX AI — bounded conversation routing repair

Date: 29 October 2026. Baseline: `f0741fd1f8569d5ee93018ef44fccee2439c95be`.

## Production reproductions and causes

1. Controller Arabic discussion: a synthetic question beginning with `اختبار محادثة اصطناعي فقط، دون استخدام سجلات الشركة` and asking how a fictional project chooses cash versus credit sales returned an invalid-action-plan message in about 3.1 seconds. `explicitAiActionRequest` matched the imperative `سجل` inside the noun `سجلات`. Add Unicode token boundaries; keep genuine commands such as `سجل دفعة` and `ممكن تجهز عرض سعر؟` recognized.
2. Advisor English follow-up: `Give one practical cash-collection precaution for that same project` returned an actual treasury snapshot instead of discussing the fictional project. A broad deterministic `cash` keyword selected `treasury.getSnapshot`. Add an orchestration guard for conceptual advice/discussion before deterministic record reads or tool planning. It applies only without attachments and without a positive execution request. Dialogue retains the conversation context; genuine requests for recorded treasury/cash balances keep their local read path. This guard does not authorize new vendors or change provider policy.
3. Controller English numbered-quotation question: `Show quotation QUO-2026-0009: customer, item count, total in USD and valid-until date. Read only; do not change any data.` returned only an opened-preview acknowledgment. `savedDocumentPreviewId` intercepted the request before the exact named-record reader. Numbered invoice/quotation fact questions now fall through to `document.get`, while explicit PDF/preview/download requests retain the existing scoped preview shortcut.

## Scope and validation

- AI routing and local regression tests only. No finance, inventory, VAT, reports/PDF engine, Firebase rules, provider budgets, live records, approval or history-schema changes.
- Reproduced failures before production-code edits: Arabic action classifier, conceptual cash advice, and numbered facts swallowed by preview. An initial quotation test setup had a null customer snapshot; its synthetic fixture was corrected before observing the intended preview-interception assertion failure.
- The targeted regressions also retain real treasury reads, positive action recognition, explicit document previews, exact record values and no record mutation.
- No additional live AI calls were made while implementing this patch. Mocked planner calls test local routing only; conversational answer quality and latency remain production acceptance work.
- Provider timeouts were not reproduced in the preceding bounded live round. Their historical root cause remains open pending authorized safe runtime logs; this patch does not claim to repair vendor availability.
- Production build passed. The four targeted suites passed 55/55 tests:

```sh
npm run build
node --test tests/ai-natural-business-interaction.test.mjs tests/ai-f17-natural-saved-document-preview.test.mjs tests/ai-production-named-records.test.mjs tests/b04-source-aware-tool-planner.test.mjs
```

## Post-deployment acceptance

Repeat only the three failed prompts, including Arabic-to-English follow-up on the same fictional project. Verify a discussion answer instead of a planning error or real treasury read, preservation of the fictional name/color, and the complete saved quotation facts. Confirm actual treasury reads and explicit PDF preview still work. Record response durations without attributing browser-tool observation delay to provider latency.

Delivery is a draft PR for review. Do not merge or deploy from this task; allow automatic CI to run once.

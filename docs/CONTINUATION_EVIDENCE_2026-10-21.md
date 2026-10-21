# Forty-item continuation: evidence checkpoint

Reviewed source: main `0be5cf9eb4c941dbe8d27a49066ba57434228dbc` (PR #920).
This document records evidence, not completion of the original checklist.

## Number mapping

The full original wording of the forty numbered items is not available in the
continuation context or a located repository checklist. Do not substitute the
older 42-scenario acceptance inventory, invent missing labels, or renumber items.
The following preserves every supplied number and its known status. The final
one-row-per-requirement acceptance matrix remains incomplete until the original
wording is recovered.

| Original numbers | Current status | Evidence and limit |
| --- | --- | --- |
| 1–8 | Open; document/report workflows | No exact original acceptance wording available; PR #904/#905 evidence cannot automatically close these numbers |
| 9–10 | Closed for the agreed customer/supplier statement cases | [PR #910](https://github.com/allidamech-bot/INVOICE/pull/910): 16 browser/language cases, 8 parsed native PDFs, 21 focused tests; 40 customer invoices / 100 supplier purchases; not arbitrary content or physical iPhone certification |
| 11–12 | Open; document/report workflows | Exact original wording unavailable |
| 13–21 | Open; closed-period protection | No implemented fiscal lock found in types, mutation, merge or persistence owners; `settlement-transaction-date-policy.md` explicitly identifies the absence; proposed decision in `PERIOD_CLOSE_DECISION_2026-10-21.md` |
| 22–26 | Preliminary policy review only | Inherited status; no individual acceptance proof available to close these items |
| 27 | Processed under explicit VAT decision | [PR #917](https://github.com/allidamech-bot/INVOICE/pull/917): explicit credit treatment/reason and preview; 7 focused cases, 35 related tests and 4 browser scenarios recorded in PR; no historical migration |
| 28 | Preliminary policy review only | No individual acceptance proof available |
| 29 | Open; draft deletion audit trail | No closeout claimed |
| 30 | Open; remaining iPhone verification | No new physical-device run |
| 31–33 | Partial iPhone coverage reported by owner | Preserve accepted tested paths; do not extrapolate to all paths or substitute Linux WebKit for physical Safari |
| 34–40 | Closure requirements not fully proven | Exact original wording unavailable; no blanket readiness claim |

PR #915's symmetric signed FX rounding is merged. PR #919 fixes historical
supplier test fixtures. Neither is a reason to declare additional checklist
numbers complete without their wording and acceptance evidence.

## Fresh baseline checks

On 21 October 2026, using isolated local tests and unchanged application source:

- `npm ci --ignore-scripts --no-audit --no-fund`: success.
- `npm run typecheck`: success.
- `npm run build`: success (exit 0).
- `node --test tests/settlement-transaction-date-policy.test.mjs tests/audit-supplier-payables-asof.test.mjs tests/audit-treasury-void-history.test.mjs tests/credit-note-treatment.test.mjs tests/fx-signed-rounding-vat-characterization.test.mjs`: **37 passed, 0 failed**.

An initial invocation before building could not import `dist/src` modules; it
tested no application behavior. Building supplied the required compiled inputs;
the complete focused command was then rerun successfully. No tests were weakened.
Full-suite and new browser coverage were not run for this documentation checkpoint.
No production data, deployment, rules or accounting behavior changed.

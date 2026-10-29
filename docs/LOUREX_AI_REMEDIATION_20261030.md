# LOUREX AI remediation evidence — 30 October 2026

Baseline: main `8832c9fa767ea4dabf08aa47bd6a961e36cd6bea`. Delivery: PR #1184. This is a bounded remediation report, **not approval of the entire production-readiness order**. No production deployment, company-record mutation, Financial Track implementation or Firebase-rule change.

## Confirmed defects and corrections

| Defect | Evidence | Correction |
| --- | --- | --- |
| Composer font overridden | Final canonical workspace CSS had 14px !important after earlier 16px rules | Correct the existing declaration to 16px; compiled-UI test checks effective font |
| Send clipped in short viewport | Chromium 320×420: panel 420px; description 92.59px; footer 193.17px; Send y397.77 +44px | Compact explanatory chrome from actual VisualViewport height, keep 44px controls, bound scrollable error text |
| Silent loss of financial instructions | Composer and planner clipped >6000 characters; failing regression proved provider received clipped message | Retain pasted text and reject before planning; no model sees an omitted correction/negation/row |
| Item boundaries lost | Planner cleanText collapsed newlines; failing regression demonstrated loss | Preserve authored line breaks in the authoritative user message |
| Unbounded quota bookkeeping | 10000 synthetic identities grew active Map beyond a fixed bound | Cap per-instance bookkeeping at 2048; preserve 16 requests/5 minutes and never reset active quota by eviction |
| Obsolete length warning | Screenshot retained the >6000 warning after replacing text with a short message | Clear only the composer length warning on correction; preserve provider errors |

No user-zoom restrictions, user-scalable=no, global scroll locks, paid provider enablement or runtime dependencies were added.

## Verification boundaries

- Full existing Node suite before the compact-viewport follow-up: **4513/4513 passed**.
- AI/b04 suite after compact-viewport and error-recovery changes: **1403/1403 passed**.
- Complete build and strict TypeScript passed.
- Compiled UI at compact-viewport head `8f6a216d`: **8/8 Chromium/WebKit cases passed**, widths320/390/412 and landscape844; Arabic/English; effective font16px; zero provider requests. Artifact12941958274, run40975089971. This covers focus, IME Enter, retained long paste, oversized submission refusal, viewport resizing, restoration and horizontal overflow.
- This is simulated WebKit, **not a physical iPhone keyboard or pinch-zoom acceptance**. Typing latency was not measured.
- Legacy Controller document journey passed Chromium but initially timed out in WebKit after PDF close at its next message (Send disabled). It must be reconciled before merge; do not erase this failure by citing Node tests. Other synthetic PDF and emulator evidence does not prove production behavior.
- Public production showed its sign-in screen. No authenticated production AI session was available. Connected Vercel reads returned404 for the named project/deployment; deployed SHA, eligibility configuration and provider latency are unverified.

## Approved-tool assessment

| Tool | Identity inspected | Actual use and boundary |
| --- | --- | --- |
| Playwright CLI | microsoft/playwright-cli, package @playwright/cli0.1.22, Apache-2.0, commitb1a5903c5b633b8c9f843ad7b629c2a78437040c | Evaluated; reused existing Playwright1.55 API/CI rather than adding alpha CLI dependencies to production |
| Impeccable | pbakaus/impeccable4.8.0, Apache-2.0, commit02523aec3e4c4580102d996d1b6a71fbe062e03f | Read audit guidance and installation/security behavior; no automatic hooks, engine installation, catalog requests or telemetry |
| Design Extract | Manavarya09/design-extract → npm identity designlang13.3.2, MIT, commitd2c28da8aae3098a7f7dc02fb4355f3f803edb6c | Executed pure CSS-health extractor locally, with no network; 228579-byte canonical sheet at audit,2076 !important and3284 repeated declarations. No browser coverage: unused CSS percentage is not evidence |

Local browser dependencies were unavailable and OS installation was rejected by the environment; tests ran in the existing GitHub-compatible Playwright environment instead. No owner terminal work was requested.

## Remaining order: explicit open work

1. General semantic-intent/fact-provenance architecture across every generative document path; no claim that this PR replaces regex-based eligibility gates or solves all dialects.
2. Missing-field-only multi-turn correction with preserved fact ownership, conflict detection and per-item quantity/unit/packing/price provenance.
3. Production provider eligibility/privacy/free-tier and deadline/latency acceptance. The11s tool-router budget was not increased without measurements.
4. Typing latency, real iPhone keyboard/viewport/orientation/background-resume, complete attachments/history/retry/undo/PDF acceptance.
5. Distributed per-tenant quota/idempotency and evidence-backed concurrency limits. The2048 cap is **per process**, not a distributed limiter or proof of thousands of concurrent customers.
6. Authenticated production verification after owner-controlled deployment; physical-device acceptance remains separate.

## Financial integration boundary

Existing structured-carton regressions retain six lines,112 cartons,2976 inner pieces, goods4366.80USD and correct fifth/sixth carton prices37.20/62.40. Discount218.34 and freight180 produce a requested pre-tax commercial total4328.46, but the current AI path stores adjustments as reference notes, **not applied accounting adjustments**.

A future Financial Track integration must consume typed discount/freight/currency fields, validate goods/discount/freight/final totals deterministically, produce one reviewed document snapshot, and use existing authorization/persistence. Until that contract exists, AI must keep the supported goods subtotal and clearly identify reference-only commercial amounts; it must not present4328.46 as an applied accounting total. This report does not authorize or implement Financial Track changes.

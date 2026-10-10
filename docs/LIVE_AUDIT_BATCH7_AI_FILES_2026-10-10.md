# LOUREX — Batch 7: conversation file lifecycle and reliability

Date: 2026-10-10. Repository: `allidamech-bot/INVOICE` only.
Base: consolidated Batch 6 candidate #689, commit `4add1ec5e8562a5d85b4ea7b5276fd5eeda29bff`.
Delivery: one candidate branch/PR for Batch 7; no additional A/B/C subdivisions.

## Confirmed defects and repairs

| Boundary | Before | After | Evidence |
|---|---|---|---|
| Specific attachment extraction | Missing `draft`/`proposal` becomes the nonempty string `null`, incorrectly reaching completion | Missing, empty or non-object structured extraction enters the existing explicitly labelled read-only fallback | Actual analyzer with mocked endpoint responses and progress sequence |
| Generic extraction | Missing/empty source similarly completes with `null` or an empty object | Missing generic data fails explicitly; no complete phase or business mutation | Actual analyzer for null, undefined, empty object and array |
| Binary PDF/image input | Conversation payload trusts declared extension/MIME before reading; document attachments already have header checks | Check supported PDF/PNG/JPEG/WebP header before PDF text extraction or binary payload | Actual File inputs and mocked request boundary; matching header accepted, mismatching header rejected before service request |
| Pre-cancelled input | Local reading still starts before checking aborted signal | Keep reading-phase notification but reject before reading any data | Actual analyzer with an already-aborted signal and a reader that must never run |
| Stop → new attachment attempt | Older analysis unconditionally clears the current controller and attachment busy state in finally; late source/progress can affect another attempt | Progress, completion and errors check controller identity, aborted signal and mount state; only the owning attempt can release busy/controller state | Actual final emitted analysis function with deferred results, stop/restart and unmount |
| Close/context change | Canonical cancellation aborts answer controller but not attachment controller | Abort both through the existing cancellation method | Actual cancellation method and both AbortController signals |
| Drop/paste during processing | Attachment controls disable during processing, but AddFiles used by drop/paste still accepts additions; subsequent completion clears the attachment list | Reject additions during attachment/answer processing with explicit wait/stop guidance; retain existing sources | Actual emitted AddFiles function with repeated selection, busy addition and total/count rejection |

Header validation is an early consistency check, **not** a full content decoder or malware/security certificate. PDF parsing and spreadsheet reading remain in their existing local readers. Existing CSV/TXT/Excel routes, four-file/16 MB limits, per-file analysis budgets and approval boundaries remain. Structured extraction returns objects per the existing endpoint contracts; incomplete responses now fail or fall back instead of looking successful.

No package, new runtime owner, service deployment, backend mutation, data model or automatic posting was added. Changes are in the existing attachment library, cancellation method and premium-conversation build owner. The final production build checks remain mandatory because the application uses generated conversation owners.

## Voice and multi-file validation

The existing final emitted voice start owner is exercised with mock recognition instances: transient native-release retry in default and WebKit model paths, a fresh second instance, denied permission without retry and obsolete-instance/panel-removal rejection. No voice code was changed. This does not reproduce actual microphone permission prompts, audio recording, transcription, operating-system release timing or physical iPhone/iPad behavior.

Repeated file selection preserves earlier cards and rejects excess count/total input without replacing them. Mixed selection retains four PDF/image/CSV/TXT inputs. PDF header/text and binary paths are tested at the library boundary; this is not real-browser drag/drop, camera or PDF decoding certification.

## Verification

- `npm run typecheck`: passed.
- Final `npm run build`: passed, including all existing generated-runtime parse and deployment-isolation checks; completed before the full suite.
- `node --test tests/*.test.mjs`: **2,314 passed**, 0 failed, 0 skipped, 0 cancelled. Includes 19 new boundary, emitted-runtime and mocked voice cases.
- Focused tests initially exposed a remaining unmounted error update; the runtime error catch now applies the same ownership/mount guard. Voice fixture dependencies were corrected without changing voice code or weakening assertions.
- `git diff --check`: passed.
- Source review: no new packages or build/runtime owner, no weakened baseline tests or deleted assertions, no record execution path changed.

## Shared acceptance gate and remaining work

Batch 7 is not visually/live closed. Candidate browser setup remains unavailable as recorded in the earlier audit; no screenshots of this candidate, live streaming/session-history comparison, real file-picker/camera, audio recording or external AI service calls were performed. Physical iPhone/iPad remain excluded by the user. Existing regressions for approvals, timeouts, conversation history, Arabic formatting, local calculations and canonical AI execution remain in the full suite; passing them does not certify every live workflow.

Keep remaining conversation layout, long-session history, streaming/partial answer recovery, repeated microphone recording and mixed real-file workflows as one shared acceptance gate. Further PDF export/page geometry acceptance also remains open; this candidate does not claim to fix or certify every PDF-output concern.

No merge, deployment, direct main commit, Replit or production mutation. Keep the candidate draft, stacked on #689.

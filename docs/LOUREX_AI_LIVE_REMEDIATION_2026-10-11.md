# LOUREX AI — live regression remediation, 11 October 2026

Base: `8966d11f6ed6bea043fa0a9bd22376da14e9ea4e` (PR #698).
Production observed: `dpl_HJ1MZjf5EGrnM9bkVxZxriakzaQw`, same SHA.
Owner authorized AI defect remediation after removing PIN in a separate change.
This branch does not merge main or publish production.

## Live evidence

The owner completed authentication in the dedicated browser. The account reached
LOUREX / Main Branch with zero documents, customers and products, without PIN.
Opening Advisor left it at `Loading scoped conversation…`. Sending the safe
`Cost is 18.50 and I want a 30% margin` request returned `Unlock LOUREX first.`
Notifications simultaneously requested opening an encrypted vault. These are
confirmed failures on the deployed Firebase-only account, not inferred errors.
The legacy `resumeVaultSession()` still required the removed PIN session.

Earlier live AI defects on the preceding release remain relevant: an exact saved
quotation preview produced a navigation approval; natural-language bulk pricing
claimed updated prices while the working artifact stayed unchanged (300 USD
instead of 275 USD). The new runtime tests reproduce those exact requests.

## Implemented repairs

- Register an authoritative read session for the current Firebase UID, initialized
  plain workspace and active account database. A signed-out null cannot fall back
  to the retained historical PIN session. AI and notification readers obtain the
  current local workspace snapshot; business writes keep the existing validated,
  audited, serialized App save queue and Firebase CAS.
- Keep local assistant-cache encryption compatible without making it an account
  login requirement. A non-extractable cache key is atomically initialized in the
  UID-scoped database. Reuse a retained account-bound legacy cache key when present.
  Otherwise write new assistant state, memory, task and proactive caches under
  `ai-v2:` records, preserving inaccessible historical ciphertext unchanged.
  Cache access verifies key UID and actual database name before querying/writing
  and verifies the account again before returning.
- Open exact saved document IDs/numbers as read-only workspace previews after
  scope/role revalidation. Do not create a navigation/write approval or invoke
  a provider. Reject missing, foreign and ambiguous references.
- Recognize the complete Arabic instruction reducing each carton by half a dollar
  except the final item by one dollar. Apply the revision-bound deterministic
  workspace command, preserving stable line IDs, quantities and one undo. Reject
  mismatched currency and do not match extra unrelated actions.
- Allow 10 attachments in selection, planner client and server while retaining the
  16 MB combined limit, source truncation flags and data-only treatment. Regression
  boundaries now test 10 accepted and 11 rejected rather than relaxing limits.
- Localize workspace field labels and mission status labels; enlarge undersized
  conversation controls to 44 px through the existing scoped CSS owner. Keep the
  established site design and themes.
- Replace the obsolete encrypted-vault notification instruction with account-ready
  messaging. Keep error state distinct from a healthy empty result.

## Validation

- Production build and all existing postprocessors: PASS.
- TypeScript and `git diff --check`: PASS.
- Full compiled-runtime suite: **2457 passed, 0 failed, 0 skipped**.
- Included behavioral regressions: cloud-only read session; authoritative signed-out
  null; unchanged mutation bridge; cache persistence and preservation of historical
  records; rejection of captured keys after account switch and stale database
  handles; exact scoped preview without writes/provider; natural Arabic repricing
  to 275 USD and undo; mixed-currency/ambiguous-action rejection; 10-file bounds.
- React review: existing component ownership retained, no new effects, dependencies
  or unsafe markup, accessible controls/labels preserved.

## Acceptance still open

This is not a claim of completing all 42 golden scenarios. Live AI acceptance of
these repairs requires a deployment containing this branch. Production currently
still exhibits the blocker above. Preview/provider availability, five repeated
voice recordings, real iOS keyboard and iPad split-screen, ten real uploaded files,
role-separated approvals, retries/offline behavior, long conversations and all
remaining workflows must be exercised after access is restored.

The local assistant caches are not cross-device cloud conversation synchronization.
Existing architecture gaps (connected external research, actual team handoff and
production telemetry) are not solved by these fixes. Historical encrypted assistant
caches with no retained key remain preserved but unavailable; new caches start
separately. No historical business vault is opened, modified or deleted.

## Continued remediation and verification

- Added manual draft lines when the product catalog is empty. Arabic digits are
  normalized; missing descriptions/units, nonpositive quantities, negative prices,
  exponent notation and the 21st new line are rejected without changing the draft.
  Stable line IDs and one-step undo/redo work for new and existing drafts.
- Replaced business starter prompts in Personal with personal preferences/tasks.
- Kept pending, applying and uncertain missions visible; completed/cancelled/failed
  reviews remain accessible inside a collapsed history disclosure.
- Localized scenario assumptions and commercial delivery warnings.
- Preserve provider error codes and distinguish missing deployment configuration
  from network/rate-limit errors, with zero proposed actions on failure.
- TypeScript, production build and all 494 regression files passed. The 29 targeted
  behavioral tests and 21 workspace tests under Europe/Istanbul also passed.
- Reopened the existing signed-in preview successfully without credentials or PIN.
  Live verification of the new commit is pending a refreshed preview deployment.
- Groq preview scope was enabled temporarily, then restored to production-only
  after the update push was rejected by automatic approval review. No updated
  preview was deployed. Credentials were never printed or copied into source.


## Continued live findings and local repairs (latest)

Live checks used the existing signed-in preview at the older remote revision;
these observations are not acceptance evidence for the unpushed local changes.
No invoice, customer, payment or other business record was saved or deleted.

- Confirmed 144 cartons × 12 units = 1728 and rejection of fractional cartons.
  Missing cost leaves profit and margin unknown; absent recorded FX is explicit.
- Found stale commercial obligations after EXW → undo to CFR. Undo/redo now
  recomputes obligations from the actual restored delivery term. Restoring empty
  or custom historical terms clears obsolete warnings without blocking undo.
- Found an enabled approval button for an empty restored draft after switching
  Business → Personal → Business. Hydration and refresh now recompute blockers;
  the approval executor also rejects incomplete proposals before any write or
  approval receipt. Runtime tests verify zero writes/receipts for this case.
- Empty repricing is rejected atomically instead of creating an empty revision.
- Arabic workspace presentation translates generated labels, validation errors,
  graph relations, mission cancellation text and diagnostics. Exact record IDs,
  user content and planner contracts remain unchanged.
- Selected tabs use the existing strong blue. White text contrast changes from
  2.48:1 to 6.23:1 on the observed dark-mode active-tab background. Local timing
  values display one decimal rather than floating-point representation noise.
- Confirmed invalid cash horizon rejection through native date controls. The
  automated fill alone did not commit React date state; this was not treated as
  a product defect. The English validation message is localized in the repair.
- Ten synthetic TXT attachments were accepted and displayed together on the
  live preview, then removed. No real customer files were transmitted.
- Added the new presentation module to the transitive service-worker content
  hash so installed clients refresh it with the established cache contract.
- Approval-success, interruption and cancellation test fixtures now contain a
  real draft customer and line. Replay, stale approval, cancellation and the
  100-concurrent-approval assertions remain intact.
- Final validation: TypeScript PASS; production build PASS; all 494 regression
  files PASS; git diff whitespace check PASS. No test was skipped or weakened.

The earlier push to allidamech-bot/INVOICE PR #699 was rejected by automatic
approval review for lack of explicit authorization for that external destination.
The local source is reviewable; the remote branch and live preview remain older.
Live acceptance of the new repairs, configured-provider flows and physical-device
voice/keyboard testing remains open. Production was not deployed or modified.

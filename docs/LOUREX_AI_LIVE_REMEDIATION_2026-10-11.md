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

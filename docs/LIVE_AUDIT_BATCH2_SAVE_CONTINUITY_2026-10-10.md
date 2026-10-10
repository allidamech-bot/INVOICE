# Live audit Batch 2 — save and workspace continuity

Base: Batch 1 candidate `6d6a8dd54ac7b455dddeb8f9b9562f75ba8eef6f` (draft PR #683). Repository scope: `allidamech-bot/INVOICE`.

## Reproduced and repaired

| Finding | Evidence before change | Result |
|---|---|---|
| NAV-RELOAD-001 / NAV-002: positional sidebar recovery | Both runtime owners selected a sidebar button by numeric order | Both select the existing AppShell destination through `data-lourex-workspace`; reordered-sidebar tests cover all six non-home destinations and disabled buttons |
| Recovery account can change after checkpoint validation | The editor target was validated on initial read, then retained through asynchronous auth | Revalidate account and expiry during recovery, including immediately before reopening |
| Draft save concurrency | Two saves launched before React committed `saving`; pagehide launched a second direct save | Synchronous single-flight guard and one departure save path |
| Draft hidden-page durability | New edits during delayed save remained unsaved after departure until a debounce fired | The latest revision immediately enters the existing save path while hidden |
| Draft failed-save retry and stale error | Departure retry could retain a failed/queued flag; a successful retry retained an old error | Failed work remains editable; retry releases the guard and successful save clears the error |
| Freshness preflight concurrency | Two delayed account lookups launched concurrently before the old remote-only guard | Single-flight now covers the whole asynchronous check |
| Freshness cleanup/account transition | An interrupted lookup resubscribed after cleanup; an old account remote result notified a new account | Check watcher generation and account after awaits; suppress stale subscription, query, retry and notification |
| Freshness notification ownership | The previous account could own the notification deduplication state | Reset deduplication when realtime account ownership changes |

The save and cloud tests execute actual transpiled component/watcher methods. Commercial tests execute the generated production editor after its existing v539 owner has been installed. Continuity tests execute the complete shipped editor-stability runtime in an isolated DOM, plus actual AppShell nav rendering and the second owner's selector function. No storage or cloud test writes to production.

## Preserved and verified

- Failed Draft PDF/Share persistence produces no output; close failure keeps work open; close retries newer revisions before leaving.
- Generated commercial editor: one save for overlapping departure events, latest hidden-page edit retained, failed close remains open, failed issuance produces no PDF. The historical commercial `await save` report did not reproduce in these scenarios; no speculative commercial rewrite.
- Existing encrypted document checkpoint/full-vault flush ownership stays in place. No new data store, package, router or telemetry layer.
- Existing cloud checks remain notification-only. Hidden/offline/dirty/editor states do not perform the remote query in tested scenarios. Missing links are repaired only for the current authenticated account; a mismatched link is blocked.
- Watcher polling stays 5 seconds in the tested desktop mode (existing 1.5-second standalone setting retained). The measured duplicate preflight was 2 account reads before, 1 after in the delayed-read fixture. This is an operation-count measurement, not a live browser performance claim.
- Apple watcher retirement, manual update/editor protection, sign-out rules and existing navigation adapters remain preserved by the suite.
- Two historical structural tests were updated to assert stable destination identity and the stronger account recheck; no tests removed or skipped.

## Validation

- TypeScript and full production build pass.
- Full suite after final build: **2,221 passed / 0 failed / 0 skipped / 0 cancelled** (35 new behavioral cases above the 2,186 Batch 1 baseline).
- 35 additional behavioral cases; all Batch 1 tests retained.
- `git diff --check` passes.
- React review: synchronous guard before async work/React state commits; state commit callback owns hidden-page follow-up; no new global listeners or dependencies.

## Coverage limits and remaining work

This closes the reproduced code defects above, not an end-to-end certification of every save flow. No physical iPhone/iPad checks (excluded by the user), real browser process termination, authenticated cloud integration, production draft edits or candidate graphical validation took place in this batch. Operating-system process death can interrupt an asynchronous IndexedDB write; these tests cannot guarantee a write after the process has terminated.

The one observed live authentication retry remains unconfirmed as a recurring defect; no reset or PIN change. No live FPS/network timing was measured. Navigation adapters from customer/supplier/search/create to financial subpanels retain their existing contracts; full candidate-screen interaction remains on the final verification list. Browser Back/Forward routing is an independent product decision, not introduced here.

Diagnostics already distinguish navigation/visibility/previous session, workspace dirty/editor state and cloud refresh events. No evidence justifies a new telemetry subsystem or polling cadence change.

## Next batch

Batch 3: overlay ownership, focus containment/return, Escape, arrow-key tabs/menus and search/AI overlap. Design consolidation, page organization, AI workflows, finance scope and final live verification remain in Batches 4–9.

This is a feature-branch draft. No main commit, merge, deployment, Replit operation or production-data mutation.

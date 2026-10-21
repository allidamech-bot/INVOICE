# Closed-period protection: decision proposal

Status: **owner approved the business rules and public repository publication on
21 October 2026**. Implementation and deployment remain separate states.
Baseline: `0be5cf9eb4c941dbe8d27a49066ba57434228dbc`.
This is a reviewable design, not implemented protection or a closeout of 13–21.

## Goal and existing constraints

Prevent later operations from silently changing an explicitly closed company's
historical financial results. Preserve the approved transaction-date settlement
policy, original timestamps, source links, currency rounding and credit-note VAT
treatments. No backfill, automatic period close, production migration or deployment.

The current system is local-first with UID-scoped Firebase synchronization.
`src/cloud/plain-workspace.ts` uploads base64 JSON chunks and a transactional
manifest. `firestore.rules` restricts account writes to the Firebase owner;
it does not inspect financial semantics inside those chunks.
`src/lib/governance.ts` operates on a locally selected member and even falls
back to an owner member. `AccessGovernanceSettings` explicitly explains that
these are operator workflows, not independently authenticated team permissions.
Those roles cannot authorize a secure period reopen.

## Recommended business decision

1. Close by company workspace, covering **all branches**, through an inclusive
   calendar date. Other companies remain unaffected. Avoid branch-specific locks
   that permit moving an old transaction between branches.
2. A closed date blocks new backdated financial postings and changes/deletions
   that alter the closed projection. Compare both old and new effective dates,
   workspace and branch; moving a record out of the period is also a change.
   Include invoices, credit notes, receipts, supplier payments, posted purchases,
   expenses, inventory valuation, treasury and opening balances.
3. Permit draft editing without posting effects. Permit a new payment against an
   old invoice only when its transaction date is open; do not confuse the source
   invoice date with the payment's effective date. A later void/reversal is
   permissible only when existing projection semantics retain the closed result;
   otherwise require reopen or an explicitly modeled current-period correction.
4. Reopening requires the authenticated account owner, online confirmation, an
   explicit reason, current authoritative revision and a permanent event. A local
   operator selector, AI action, import or restored backup cannot grant approval.
5. Closing records an exact workspace revision, report definitions/version,
   date basis, scope, currency-separated figures and retained report snapshot.
   Later reopening creates a new version; prior published snapshots remain
   inspectable. A hash alone is not a retained report.
6. No administrator override silently bypasses a lock. Corrections after closing
   require explicit reopen or a separately supported open-period adjustment;
   do not invent new journal entries in this system's absence of a full GL.

## Alternatives considered

| Approach | Benefit | Limitation |
| --- | --- | --- |
| Retain versioned reports only | Preserves publication evidence with smaller scope | Allows historical transaction changes; insufficient as period protection |
| Client guard plus retained snapshots | Fits current local-first persistence and catches ordinary, AI, merge and restore paths | Cannot guarantee enforcement against modified/old owner clients or stale offline writers |
| Trusted server transition plus guarded persistence and snapshots | Authoritative close/reopen order and independently verified actor | Needs a trusted commit protocol validating affected financial state and compatible-client policy, beyond a UI toggle |

Recommend the third as the acceptance target. A staged client guard may be useful
but must be labeled operational protection only until server-side enforcement
and stale-client behavior are verified. Owner approval of this proposal does not
authorize deployment or silently change Firebase rules.

## Implementation boundaries to cover

- Existing `App.persist` and `persistFullMutation` are both write paths.
- `src/app/index.tsx`'s AI mutation bridge uses the same write queue, but checking
  that bridge alone leaves full mutations, imports and replacements uncovered.
- `src/storage/vault-merge.ts` must validate both local and remote changes and
  reject stale financial changes after a close; no last-writer-wins lock records.
- `App.restore`, cloud restore, `src/cloud/plain-workspace.ts` pull/push,
  `src/storage/db.ts` CAS replacements, workspace switching, schema migration,
  and legacy recovery paths require explicit continuity rules.
- A stale offline client may retain an unsynchronized draft, but cannot commit a
  protected posting once the server has closed its effective period. Old clients
  require an explicit compatibility gate; do not accept them as lock-aware.
- Retain company scope across all workspace snapshots, not just the active branch.
- Preserve original audit timestamps and record actor UID/server time, reason,
  prior/new close boundary, retained-report version and authoritative revision.

## Required acceptance examples

For company A closed through 31 October (company B open): reject a new 31 October
receipt; accept a 1 November receipt paying an October invoice; reject changing
an October receipt to November or moving it to another branch/company; reject
an import or backup deleting the close record; reject a stale device posting
after another device closes; reject local-role and AI reopen attempts. Test
month-end dates, timezone boundaries, duplicate close/reopen, competing devices,
old schemas and invalid dates without silently normalizing a close boundary.

Prove that later voids/reversals leave retained October reports and recomputed
closed-period financial projections unchanged, or reject them. Verify source
customer/supplier balances, currency groups, VAT, inventory valuation, treasury
and consolidated branch totals. Show that failed close/reopen/commit operations
leave both financial state and lock history unchanged. Verify snapshot retention
through backup, restore, migration and account switching.

These examples are proposed acceptance cases, **not a reconstruction of the
missing original wording of checklist items 13–21**.

## Approved decision and implementation boundary

The owner approved the company-wide inclusive close date, owner-only online
reopen with reason, preserved publication versions and authoritative enforcement
target. The owner also explicitly approved publishing the two review documents
to the public project repository. This does not authorize deployment or live
Firebase rules changes. The file-level plan is
`superpowers/plans/2026-10-21-period-close.md`.

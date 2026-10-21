# Closed-period foundation — Task 1 evidence

Scope: pure, unactivated foundation of the approved period-close plan. No UI,
schema migration, Firebase rules, persistence behavior, production data or
deployment changes. Original checklist items 13–21 remain open.

## Implemented

`src/lib/period-close.ts` provides `closedPeriodState` and
`assertClosedPeriodUnchanged` over a migrated, schema-validated full account
payload and externally supplied trusted boundaries. It does not authenticate an
actor, authorize a close/reopen, store a publication or install a write guard.

The versioned detached JSON retains dated source identities and data alongside
real existing sales, VAT, receivable, payable, party-statement, treasury/account
and warehouse-quantity results for every affected branch. Inventory valuation
source quantities, costs and currencies are retained; this does not introduce
an invented inventory valuation engine or a full general ledger.

Missing scope, duplicate identity, invalid dates, missing currencies, dangling
payment/credit references and treasury counterpart scope/currency mismatches
fail closed. Ending totals alone are insufficient: reversed purchases remain
retained even if the closing liability is zero. Historical FX inputs are retained.

Draft and appearance edits remain outside the financial comparison. An open-date
receipt against an old invoice remains valid. A later supplier/treasury void or
purchase/stock reversal is allowed only when its as-of projection and retained
closed source data remain equal. Later invoice voids are rejected because the
existing sales/VAT engines remove them from historical reports.

## Test and review evidence

- Focused behavioral suite: 42 cases in `tests/period-close.test.mjs`.
- Initial RED: the new projection module was absent. A temporary compiled-only
  no-op guard mutation subsequently produced 23 assertion failures out of 38
  cases, proving the rejection tests detect a disabled comparison; restored
  immediately without changing source or weakening tests.
- Independent review identified three Important findings: previously reversed
  purchase provenance, silent USD fallback and treasury counterpart mismatch.
  Four reproducing cases (including missing source references) failed on the
  preceding implementation; all 42 cases passed after the single fix pass.
- TypeScript and production build passed locally. On the integrated baseline
  including PR #922, `node --test tests/*.test.mjs` passed **3508/3508**.
- A focused CI gate compiles source and runs the new suite plus approved
  settlement-date, supplier as-of, treasury-void, VAT and signed-FX regressions.

Ruling: retain a pure module and a regression gate first. Do not activate client
locks or a close/reopen UI before the authoritative commit/rules/restore gates
are complete; otherwise an old device could bypass a displayed lock. Cost of
this staged boundary: no operational period protection yet.

Remaining work is Tasks 2–4 of the approved plan: authenticated trusted commit,
immutable published generations, server-owned control and audit history, client
and restore continuity, owner controls and end-to-end emulator/browser acceptance.
Local credential presence checks found no configured server Firestore service
identity in this execution environment. This does not establish what credentials
exist in hosting, and no remote secrets were read. Configuration and deployment
remain separate from tested source implementation.

# Treasury reconciliation output — proposed design

Status: recommended contract accepted by the user continuation; implementation in progress.
Baseline: main `37ec64a6f91dcacaaa462e3b38461ad49946e53c`.

## Requirement and observed gap

Checklist item 8 requires final output showing opening balances, movements,
closing balances and reconciliation status. The live route is
`FinanceWorkspace` → `TreasuryLedgerPage`. It currently has no print/export
action. Existing Node tests cover ledger and reconciliation invariants;
they do not establish final report output acceptance.

The current movement projection includes unallocated customer payments,
supplier payments and expenses. Account balances use explicit treasury
ledger entries only. These are different populations and must remain
distinguishable in output.

## Approaches

1. Print the current screen. Smallest visual change, but it cannot provide
   a period opening/closing reconciliation and includes editable controls.
2. Add a read-only period report using existing canonical ledger helpers.
   Recommended: it meets the original requirement without a second posting
   system or any storage/schema change.
3. Add bank-statement import and automatic matching. This requires external
   evidence, new rules and a separate product requirement; defer it.

## Recommended report contract

- Open from Cash & Bank with explicit inclusive from/to dates and currency
  and account filters; reject invalid or reversed dates.
- Identify company, branch, selected account/currency, dates and generation
  time. Use existing scoped props; never widen the data scope.
- Show each eligible account independently, including inactive accounts
  with relevant historical entries. Never sum different currencies.
- Opening balance is the existing canonical account balance at the day
  before the start date; closing balance is that balance at the end date.
- Show dated signed account movements and any historical void effect
  needed to explain the difference between opening and closing balances.
  A void effective during the period must not disappear merely because
  its original entry date precedes the period.
- Transfers debit one account and credit the other. They must not inflate
  aggregate external inflows/outflows.
- Show the existing reconciliation status as of the end date, using the
  existing append-only event precedence and legacy compatibility rules.
  Do not describe the status as independent bank verification.
- Keep unallocated payments/expenses in a separately labelled section.
  They do not change an account's ledger balance and cannot be treated
  as account cash without allocation.
- Search may narrow displayed details only if the output explicitly says
  that balances still cover the full selected account and date period.
  Prefer no text-search filter in the first report version.
- Use the same immutable report snapshot for preview, CSV and printing.
  Changing the active scope invalidates the open report snapshot.
- Provide Arabic and English print/Save PDF plus CSV with explicit signed
  amounts, currency, movement reference and reconciliation status.

## Implementation boundaries

Reuse `treasuryAccountBalanceScaled`, `treasuryProjection`, monetary fixed
precision utilities and existing language/date helpers. A pure report
projection may be added; it must not alter canonical financial semantics.
Keep report controls and output in treasury-owned components and scoped
styles. Do not edit App, vault merge, AI files, Firebase rules or schemas.
No mutations, new audit events, period closing, cloud operations or packages.
This is a local report, not a restored server period-operation archive.

## Acceptance evidence required before merge

- Synthetic fixtures with positive/negative openings, deposits, withdrawals,
  allocated/unallocated collections, supplier payments and expenses,
  transfers, adjustments, late voids and reconcile/Undo events.
- Exact opening + signed effective changes = closing per account, including
  an entry before the period voided inside it; future events excluded.
- Account/currency/company/branch isolation and unchanged source records.
- Real report route in the actual shell, both languages, Chromium/WebKit,
  long references and multi-page output. Native Chromium PDFs must contain
  all rows, correct totals/statuses, no blank pages or application controls.
- CSV parity with the displayed snapshot, negative signs, escaping and
  spreadsheet formula protection for user-supplied text.
- Typecheck/build and relevant CI at the exact PR head. Physical iPhone and
  production Firebase acceptance are separate and must not be claimed.

## Decision still needed

User continued after the recommended read-only contract. No independent
bank matching/import is included.

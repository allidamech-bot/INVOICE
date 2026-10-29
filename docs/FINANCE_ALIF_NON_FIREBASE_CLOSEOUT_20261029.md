# LOUREX INVOICE — Plan Alif: bounded non-Firebase finance closeout
Date: 29 October 2026
Status: NON-FIREBASE ENGINEERING / POLICY PREPARATION; NO PRODUCTION GL CUTOVER

## Authority and scope
- Reviewed baseline GitHub main and owner-published production: \`6c6bacd225340445fa17007810d479f52b52313e\` (\`READY\`). Release identity has been independently matched on 29 October, but is **not** proof of fiscal source data, effective deployed Firestore permissions, or a signed accounting acceptance.
- This document is a finite, consolidated handoff for *work that does not require Firebase*. It **does not** reopen previously delivered financial features, alter LOUREX AI, publish code, modify an account, create a real invoice, change prior-period records, or convert candidate journal projections into posted books.
- Explicitly excluded: Firebase published Rules 35-B, real cross-UID 35-C, trusted server close/restore 37–38, two-device cloud acceptance, source-authenticated GL atomic server posting and all operator-controlled production activation. Those cannot be described as "complete" without their genuine external gates.
- Axis 4 independent posted-purchase document is owner-deferred, not a new scope.

## Delivery status: what exists today
1. **Production-operational, already developed:** sales/quotes and native print/PDF; stock issuance guards; invoice/customer receipts/AR; purchase/supplier payments/AP; cash/bank treasury linking and as-of reconciliation; branch scope and historical-date protections. Previous merged PRs and targeted automated evidence are indexed in \`docs/qa/FINANCE_ALIF_34_39_EVIDENCE_MATRIX_20261028.md\`. Automated test success must not be misrepresented as signed live finance acceptance.
2. **Valuation method CHOSEN:** perpetual moving weighted average (WAC) for interchangeable inventory, separately justified specific identification for non-interchangeable inventory, per \`docs/FINANCE_ALIF_22_WEIGHTED_AVERAGE_POLICY_20261027.md\`.
3. **Accounting simulations only:** code already recomputes WAC, NRV candidates, sample inventory/COGS entries, AP/AR/treasury and an illustrative trial balance. That code **does not post a production general ledger**. Its \`productionReady=false\` boundary is intentional.
4. **Physical iPhone:** the owner confirmed *preview equals saved PDF* on the current release. This closes that observed display concern. It is not evidence of every unobserved F11/F12 Safari condition (long Arabic/English multi-page, Share/Print, keyboard/save) and cannot be silently signed as all of 30–33.
5. **Non-Firebase opening-book preflight NEW:** \`scripts/finance-alif-opening-preflight.mjs\` validates one candidate legal-entity/company/branch/currency private opening file offline: account coverage, unique identifiers, opening debit=credit, required inventory/AR/AP/treasury source-control equality, dated evidence hash shapes, and minor currency units. It makes no network calls, produces only missing *field paths*, has no persistence, and NEVER grants a financial GO.

## Proposed accounting policy — defaults for review, NOT company-signed facts
These are implementation-ready recommendations, not historical financial entries or jurisdiction-specific tax advice. The finance owner/accountant must separately approve each unresolved item for the correct legal entity and fiscal period.

| Topic | Default/proposed treatment | Condition before live use |
|---|---|---|
| Functional currency | Determine under IAS 21 from the entity's primary economic environment, NOT invoice currency or UI USD default | Authorized entity-specific currency document and opening conversion |
| Cost formula | Perpetual moving WAC for interchangeable goods; specific identification for segregated/non-interchangeable stock | Signed source chronology and evidence for each warehouse / item |
| Landed purchase cost | Net purchase price plus directly attributable freight, nonrecoverable import taxes, handling; deduct discounts/rebates; exclude recoverable VAT, abnormal waste, selling cost, general admin | Original source/cost allocations and local VAT treatment |
| Sales issues | Inventory carrying amount moves to COGS at original issue date; unchanged historical invoices retain their stored snapshots, with cutover reconciliation instead of retroactive rewriting | Closed-period check, exact source ID and dated journal |
| Returns and reversal | Restockable sales return uses original issued carrying cost, conditional on evidenced restock; supplier return reconciles original AP credit to current WAC inventory reversal; **do not bury any difference in revenue/COGS** | Signed return eligibility, supplier-credit and variance account rule |
| Manual adjustments/transfers | Count shortage to approved inventory-loss account; evidenced gain to approved offset; branch/warehouse transfer conserves total carrying value without sale | Original physical-count approvals, transfer transit policy |
| NRV under IAS 2 | Lower of cost and net realisable value; impairment via allowance and expense; reversal limited to previous impairment; never silently change original sales | Approved contemporaneous sale/finish/disposal estimates |
| FX | Source-dated conversion for foreign purchase at initial recognition; historical-cost inventory uses initial appropriate rate, monetary AR/AP/bank are remeasured per IAS 21 at each reporting date with separately approved FX gain/loss | Supported currency, reliable rate source/timestamps, separate realized/unrealized and local statutory/tax rule |
| Minor-unit rounding | Preserve high-precision cost subledger; book monetary journals at an approved entity/currency precision (e.g. USD 2). Control cumulative-rounding residual explicitly, not a hidden writeoff | Approved specific algorithm, zero-cent movement and variance treatment |
| Effective dates | Use transaction/event dates for as-of ledgers; \`createdAt\` is audit metadata, never a substitute | Source timestamps and immutable posting chronology |
| VAT/returns/tax | No universal VAT rate or input VAT claim; existing output-VAT report is not a complete jurisdiction-specific tax ledger | Legal jurisdiction, recoverability, tax rates and reporting approvals |
| General-ledger structure | Double-entry, immutable scoped source/posting references, idempotency, per-account currency control, balanced trial balance and period locks | Source-authenticated server-owned atomic posting/authority; NOT yet provided without Firebase |

### Candidate chart of accounts (illustration; account identifiers require entity approval)
- 1000 cash, 1010 bank, 1100 trade receivables, 1200 inventory, 1290 inventory NRV allowance (contra asset).
- 2000 trade payables, 2100 VAT payable/receivable clearing as supported, 3000 opening equity/retained earnings.
- 4000 sales, 4090 sales returns/allowances (contra revenue), 5000 COGS, 5100 inventory losses, 5190 approved purchase-return cost variance, 6200 NRV impairment, 7100 realized FX gains/losses, 7110 unrealized FX gains/losses (separate ledger accounts as needed).
- IDs and categories are **proposed**; do not instantiate accounts, assume a legal chart, or combine incompatible currencies automatically. The offline preflight accepts the company-approved actual account identifiers, never these proposed IDs by default.

### Candidate double-entry event maps — NOT postings
| Event | Debit | Credit |
|---|---|---|
| Cost-supported posted purchase | Inventory | Supplier payable |
| Final invoice | Customer receivable | Sales revenue (VAT lines separately when approved) |
| Stock issue for sale | COGS | Inventory at WAC |
| Collected customer receipt allocated to bank | Bank | Customer receivable |
| Supplier settlement paid from bank | Supplier payable | Bank |
| Opening bank/stock/AR/AP | Corresponding supported debit/credit accounts | Approved opening clearing/equity only through a complete signed opening trial balance |
| NRV write-down | Impairment expense | NRV allowance |
| NRV reversal | NRV allowance | Impairment expense up to prior recognized write-down |

A balanced sample journal does NOT authenticate opening equity, the original bank balance, a legal supplier, a valid rate, or the source period. The live general ledger cannot be activated on the basis of these examples.

## Non-Firebase opening reconciliation — private operator package
For **each** legal entity + workspace + branch + functional currency + cutoff:
1. Independently obtain signed opening cash/bank statements, AR customer aged detail, AP supplier aged detail, original dated physical stock count/landed valuation and GL trial balance. Review proof of currency/FX and unreconciled adjustments. Do not send financial secrets to GitHub.
2. Prepare a locally held \`LOUREX_ALIF_OPENING_V1\` JSON matching the contract below. Every *chart account* needs exactly one opening balance row, including documented zero accounts when needed; each source-controlled inventory, AR, AP and bank/cash account has a one-to-one source control and amount. For multiple currencies, branches or entities create **separate** candidates; never sum nominal amounts across currencies.
3. Run locally: \`node scripts/finance-alif-opening-preflight.mjs /private/path/opening.json\`. A nonzero exit or missing paths blocks even structural review. A structural PASS still requires original source authentication, independent accountant signoff, a complete legal ledger design and server controls. Never upload the source dossier or result files to this repo.
4. Require finance owner to reconcile any difference **before** proposing a source-bound GL cutover. Never invent zero opening balances, adjust the treasury to make a trial balance balance, or rewrite historical invoices.

Contract shape (illustrative; synthetic only):
\`\`\`json
{
  "schema": "LOUREX_ALIF_OPENING_V1",
  "scope": {
    "legalEntityId":"QA-ENTITY", "workspaceId":"qa", "branchId":"main",
    "functionalCurrency":"USD", "cutoffDate":"2026-10-28",
    "minorDigits":2, "policyVersion":"DRAFT-NOT-APPROVED"
  },
  "chartOfAccounts": [
    {"accountId":"1000","name":"Illustrative bank","type":"asset"},
    {"accountId":"1100","name":"Illustrative receivables","type":"asset"},
    {"accountId":"1200","name":"Illustrative inventory","type":"asset"},
    {"accountId":"2000","name":"Illustrative payables","type":"liability"},
    {"accountId":"3000","name":"Illustrative opening equity","type":"equity"}
  ],
  "balances": [
    {"accountId":"1000","side":"debit","amount":"100.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-original-evidence-SHA256>"},
    {"accountId":"1100","side":"debit","amount":"150.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-original-evidence-SHA256>"},
    {"accountId":"1200","side":"debit","amount":"1200.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-original-evidence-SHA256>"},
    {"accountId":"2000","side":"credit","amount":"1170.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-original-evidence-SHA256>"},
    {"accountId":"3000","side":"credit","amount":"280.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-original-evidence-SHA256>"}
  ],
  "sourceControls": [
    {"kind":"treasury","accountId":"1000","amount":"100.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-SHA256>"},
    {"kind":"customerReceivable","accountId":"1100","amount":"150.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-SHA256>"},
    {"kind":"inventory","accountId":"1200","amount":"1200.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-SHA256>"},
    {"kind":"supplierPayable","accountId":"2000","amount":"1170.00","sourceAsOfDate":"2026-10-28","evidenceSha256":"<64-character-SHA256>"}
  ]
}
\`\`\`
**CAUTION:** This sample has invalid placeholder hashes ON PURPOSE and is not a usable approval dossier. It illustrates structure, not real account values. The checker does not verify whether provided hashes are authentic, accounts are legally correct, the set of source controls is complete in the real organization, cash exists, or invoices are genuine.

## Final non-Firebase checkpoints
- **Resolved:** code-deployment SHA match (#1178), owner-reported saved-PDF preview parity; existing targeted tests cover many finance functions and isolated ledger arithmetic.
- **Mechanically prepared (this scope):** one private opening-account source-control and balance checker; accounting mapping/financial-policy decision matrix; one fixed, finite human-evidence handoff.
- **Still needs genuine non-Firebase inputs/approval:** legal entity functional currency, audited opening accounts/stock/bank/AR/AP, full dated movement history, historical FX/returns and rounding policy, final statutory tax judgment, accountant/owner signoff, actual iPhone long RTL/Share/keyboard evidence if required, and independent F01–F08 finance cycle demonstration in an explicitly authorized QA company. These cannot be fabricated or automatically closed by software.
- **Blocked by Firebase/trusted backend:** deployed Rules (35-B), cross-UID (35-C), synchronized two-device acceptance, server-controlled posting of real Inventory/COGS/GL, trusted period authority and managed restore/RPO/RTO. Work on these was explicitly deferred to ChatGPT Work.
- **Final 39/40 decision:** still NO-GO until real seven-gate dossier and independent finance/security/operations/release approval. This is a hard release boundary, not a request to repeat synthetic tests or open additional micro-PRs.

### Immutable change-control boundary
Nothing in this closeout authorizes editing AI, posting real accounts, changing account opening values, changing Firebase Security Rules, testing genuine production customers, performing production backup restoration or automatically deploying Vercel. The owner deploys only after personally approving an appropriate tested release.

import {reviewDigest} from './commercial-source.js';
import {supplierRefundCashFacts} from './supplier-commercial-settlements.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_ADVANCE_REFUND_REVIEW_REQUIRED');};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const cents=x=>{need(typeof x==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(x));return BigInt(x.replace('.',''));};
const money=x=>String(x/100n)+'.'+String(x%100n).padStart(2,'0');
const same=(r,s)=>r&&['accountUid','workspaceId','egsId','environment'].every(k=>r[k]===s[k]);
// The caller must independently verify the authoritative accepted credit note
// and supply the existing shared advance-balance reservation from the issuance
// transaction. This planner never allocates capacity a second time. It
// does not issue a credit note, authenticate the authority or create cash.
export function planCustomerAdvanceRefund({scope,receipt,receiptPosting,receiptCashClaim,credit,creditAcceptance,review,capacity,reservation,treasuryEntries,treasuryAccounts,claimedCashIds=[],through,closedThrough}){
 need(scope?.environment==='simulation'&&id(scope.accountUid)&&id(scope.workspaceId)&&id(scope.egsId)&&day(through)&&(!closedThrough||day(closedThrough)));
 const b=receipt?.fiscalAdvance;
 need(b?.kind==='receipt'&&receipt.kind==='invoice'&&receipt.role==='standard'&&hex(b.evidenceDigest)&&id(b.treasuryEntryId)&&receipt.status==='final'&&receipt.lifecycleStatus==='active'&&receipt.currency==='SAR'&&receipt.workspaceId===scope.workspaceId&&id(receipt.id)&&id(receipt.branchId)&&id(receipt.customerSnapshot?.sourceCustomerId)&&day(receipt.issueDate)&&cents(b.net)+cents(b.vat)===cents(b.gross));
 need(same(receiptPosting,scope)&&receiptPosting.commercialPosted===true&&receiptPosting.source==='sale'&&receiptPosting.key==='sale-'+receipt.id&&reviewDigest(receiptPosting.advanceBinding)===reviewDigest(b)&&hex(receiptPosting.snapshotDigest)&&hex(receiptPosting.evidenceDigest)&&receiptPosting.sourceId===receipt.id&&receiptPosting.amount?.kind==='prepayment'&&receiptPosting.finalFingerprint===reviewDigest(receipt)&&receiptPosting.amount.net===b.net&&receiptPosting.amount.vat===b.vat&&receiptPosting.amount.gross===b.gross&&id(receiptPosting.uuid));
 need(credit&&credit.id!==receipt.id&&id(credit.id)&&credit.kind==='invoice'&&credit.role==='credit-note'&&credit.status==='draft'&&credit.lifecycleStatus==='active'&&credit.creditForId===receipt.id&&credit.creditForNumber===receipt.number&&credit.workspaceId===receipt.workspaceId&&credit.branchId===receipt.branchId&&credit.currency===receipt.currency&&credit.customerSnapshot?.sourceCustomerId===receipt.customerSnapshot.sourceCustomerId&&credit.customerSnapshot?.vatTaxNumber===receipt.customerSnapshot.vatTaxNumber&&credit.companySnapshot?.vatNumber===receipt.companySnapshot?.vatNumber&&Array.isArray(credit.items)&&credit.items.length>0&&credit.items.every(l=>l.stockTreatment==='non-stock')&&day(credit.issueDate)&&credit.issueDate>=receipt.issueDate&&credit.issueDate<=through&&(!closedThrough||credit.issueDate>closedThrough));
 need(same(creditAcceptance,scope)&&creditAcceptance.kind==='credit-note'&&creditAcceptance.status==='cleared'&&creditAcceptance.documentId===credit.id&&creditAcceptance.sourceFingerprint===reviewDigest(credit)&&creditAcceptance.originalUuid===receiptPosting.uuid&&id(creditAcceptance.uuid)&&creditAcceptance.uuid!==receiptPosting.uuid&&hex(creditAcceptance.resultDigest)&&hex(creditAcceptance.snapshotDigest)&&creditAcceptance.category===receiptPosting.category&&creditAcceptance.rate===receiptPosting.rate);
 const n=cents(creditAcceptance.net),v=cents(creditAcceptance.vat),g=cents(creditAcceptance.gross);need(n>0n&&n+v===g);
 // Use the same receipt balance shape as advance applications. The accepted
 // credit must already have reserved its net/VAT in that balance at issuance.
 need(same(capacity,scope)&&capacity.originalDocumentId===receipt.id&&capacity.binding?.uuid===receiptPosting.uuid&&capacity.binding?.snapshotDigest===receiptPosting.snapshotDigest&&capacity.binding?.resultDigest===receiptPosting.evidenceDigest&&hex(capacity.binding.artifactDigest)&&capacity.cap?.net===b.net&&capacity.cap?.vat===b.vat);
 need(same(reservation,scope)&&reservation.kind==='advance-refund'&&reservation.state==='reserved'&&reservation.receiptId===receipt.id&&reservation.documentId===credit.id&&reservation.uuid===creditAcceptance.uuid&&reservation.snapshotDigest===creditAcceptance.snapshotDigest&&reservation.net===creditAcceptance.net&&reservation.vat===creditAcceptance.vat);
 const usedN=cents(capacity.reserved.net),usedV=cents(capacity.reserved.vat);
 need(usedN>=n&&usedV>=v&&usedN<=cents(b.net)&&usedV<=cents(b.vat));
 // Verify the original posted deposit, not only the refund withdrawal.
 need(same(receiptCashClaim,scope)&&receiptCashClaim.documentId===receipt.id&&receiptCashClaim.uuid===receiptPosting.uuid&&receiptCashClaim.evidenceDigest===b.evidenceDigest&&receiptCashClaim.treasuryEntryId===b.treasuryEntryId&&hex(receiptCashClaim.cashDigest));
 const deposits=treasuryEntries.filter(e=>e.id===b.treasuryEntryId);need(deposits.length===1);const deposit=deposits[0];
 need(deposit.type==='deposit'&&deposit.sourceType==='manual'&&!deposit.sourceId&&!deposit.fromAccountId&&!deposit.voidedAt&&id(deposit.toAccountId)&&deposit.workspaceId===receipt.workspaceId&&deposit.branchId===receipt.branchId&&deposit.currency===receipt.currency&&deposit.date===receipt.issueDate&&deposit.amount===b.gross&&reviewDigest(supplierRefundCashFacts(deposit))===receiptCashClaim.cashDigest);
 const depositAccounts=treasuryAccounts.filter(a=>a.id===deposit.toAccountId);
 need(depositAccounts.length===1&&depositAccounts[0].workspaceId===receipt.workspaceId&&depositAccounts[0].branchId===receipt.branchId&&depositAccounts[0].currency===receipt.currency);
 need(same(review,scope)&&review.state==='approved'&&review.kind==='advance-refund'&&review.receiptId===receipt.id&&review.creditId===credit.id&&review.creditResultDigest===creditAcceptance.resultDigest&&review.receiptFingerprint===receiptPosting.finalFingerprint&&review.creditFingerprint===creditAcceptance.sourceFingerprint&&review.net===creditAcceptance.net&&review.vat===creditAcceptance.vat&&review.gross===creditAcceptance.gross&&hex(review.evidenceDigest)&&id(review.treasuryEntryId)&&!claimedCashIds.includes(review.treasuryEntryId)&&review.treasuryEntryId!==b.treasuryEntryId&&hex(review.cashDigest)&&reservation.treasuryEntryId===review.treasuryEntryId&&reservation.cashDigest===review.cashDigest);
 const entries=treasuryEntries.filter(e=>e.id===review.treasuryEntryId);need(entries.length===1);const e=entries[0];
 need(e.type==='withdrawal'&&e.sourceType==='manual'&&!e.sourceId&&!e.toAccountId&&!e.voidedAt&&id(e.fromAccountId)&&e.workspaceId===credit.workspaceId&&e.branchId===credit.branchId&&e.currency==='SAR'&&e.amount===review.gross&&e.date===credit.issueDate&&review.cashDigest===reviewDigest(supplierRefundCashFacts(e)));
 const acc=treasuryAccounts.filter(a=>a.id===e.fromAccountId);need(acc.length===1&&acc[0].workspaceId===credit.workspaceId&&acc[0].branchId===credit.branchId&&acc[0].currency==='SAR');
 const lines=[{account:'customer-advances',side:'debit',amount:money(n)},...(v>0n?[{account:'output-vat',side:'debit',amount:money(v)}]:[]),{account:'cash-bank',side:'credit',amount:money(g)}];
 return {receiptId:receipt.id,creditId:credit.id,date:credit.issueDate,net:money(n),vat:money(v),gross:money(g),evidenceDigest:review.evidenceDigest,resultDigest:creditAcceptance.resultDigest,treasuryEntryId:e.id,cashDigest:review.cashDigest,reservedAfter:{net:money(usedN),vat:money(usedV)},lines};
}

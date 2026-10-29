import type {
  LourexDocument,PaymentRecord,SupplierPaymentRecord,TreasuryAccountRecord,TreasuryLedgerRecord
} from '../types.js';
import {calculateTotals,decimalToScaled} from './money.js';
import {invoicePaymentSummary,assertInvoicePaymentInvariant} from './payments.js';
import {purchasePayableSummary,supplierPayablesByCurrency} from './payables.js';
import {receivablesByCurrency} from './receivables.js';
import {purchaseTotals} from './operations.js';
import {treasuryAccountBalance,validateTreasuryEntry} from './treasury-ledger.js';
import {
  inspectMultiItemSourceBoundStockGl,
  type MultiItemStockEvidence,
  type MultiItemSourceBoundStockAudit
} from './finance-multi-item-source-gl-preview.js';
import type {FinanceGlControls,FinanceGlJournal} from './finance-gl-foundation.js';

/**
 * Alif 22/39 — source-RECOMPUTED, read-only financial cycle diagnostic.
 * One asserted company/branch/USD-like currency, one bank account, no credit
 * notes, taxes, FX, adjustments, multi-bank transfers or other money flows.
 * NOT a production General Ledger, a posted journal, verified opening
 * equity or independently approved balance sheet.
 */
export interface FinanceCycleAccountMap {
  bankAsset:string;
  customerReceivable:string;
  salesRevenue:string;
  openingOffset:string;
}
export interface FinanceCycleSourceEvidence {
  stock:MultiItemStockEvidence;
  stockJournals:readonly FinanceGlJournal[];
  customerPayments:readonly PaymentRecord[];
  supplierPayments:readonly SupplierPaymentRecord[];
  treasuryAccounts:readonly TreasuryAccountRecord[];
  treasuryEntries:readonly TreasuryLedgerRecord[];
}
export interface FinanceCycleTrialLine{
  accountId:string;
  debitBalance:string;
  creditBalance:string;
}
export interface FinanceCycleSourceAudit {
  stock:MultiItemSourceBoundStockAudit;
  inventory:string;
  costOfGoodsSold:string;
  invoiced:string;
  customerCollected:string;
  receivable:string;
  supplierPurchased:string;
  supplierPaid:string;
  supplierPayable:string;
  bankOpening:string;
  bankBalance:string;
  trialBalance:FinanceCycleTrialLine[];
  totalDebits:string;
  totalCredits:string;
  sourceAuthenticated:false;
  openingApproved:false;
  completeChartApproved:false;
  actualJournalPosted:false;
  periodAuthorityVerified:false;
  productionReady:false;
}
function fail(reason:string):never{throw new Error('ALIF_22_FINANCE_CYCLE_NOT_READY: '+reason);}
const cents=(s:string):bigint=>{
  if(typeof s!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s))
    fail('Financial source amount must be a nonnegative exact cent value.');
  return decimalToScaled(s,2);
};
function amount(v:bigint):string{
  const neg=v<0n,abs=neg?-v:v;
  return (neg?'-':'')+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0');
}
function uniqueId(value:unknown,seen:Set<string>,kind:string):string{
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||seen.has(value))
    fail('Duplicate or missing '+kind+' source ID.');
  seen.add(value);
  return value;
}
function scopeMatches(source:{workspaceId?:string;branchId?:string;currency?:string},
  controls:FinanceGlControls):boolean{
  return source.workspaceId===controls.workspaceId
    &&source.branchId===controls.branchId
    &&source.currency===controls.functionalCurrency;
}
export function previewSourceBoundFinanceCycle(
  controls:FinanceGlControls,
  accounts:FinanceCycleAccountMap,
  evidence:FinanceCycleSourceEvidence
):FinanceCycleSourceAudit{
  const accountIds=[controls.inventoryAssetAccountId,controls.supplierPayableAccountId,
    controls.salesCogsAccountId,controls.inventoryAllowanceAccountId,
    controls.impairmentExpenseAccountId,
    accounts.bankAsset,accounts.customerReceivable,accounts.salesRevenue,accounts.openingOffset];
  if(accountIds.some(id=>typeof id!=='string'||!id.trim()||id!==id.trim())
    ||new Set(accountIds).size!==accountIds.length)
    fail('Nine distinct, explicitly identified candidate accounts are required.');
  // The stock verifier rejects duplicate or missing underlying purchase/issue
  // sources and checks WAC and original landed total against proposed journals.
  // Those journals are still SUPPLIED synthetic entries, never stored GL data.
  const stock=inspectMultiItemSourceBoundStockGl(
    controls,evidence.stock,evidence.stockJournals
  );
  const {purchases,documents}=evidence.stock;
  const customers=evidence.customerPayments,supplierPayments=evidence.supplierPayments;
  const bankAccounts=evidence.treasuryAccounts,entries=evidence.treasuryEntries;
  if(bankAccounts.length!==1||!bankAccounts[0]
    ||bankAccounts[0].kind!=='bank'||!bankAccounts[0].active
    ||!scopeMatches(bankAccounts[0],controls))
    fail('Exactly one in-scope active bank account is supported by this limited preview.');
  const bank=bankAccounts[0];
  const invoices: LourexDocument[]=[];
  const invoiceIds=new Set<string>();
  for(const document of documents){
    uniqueId(document.id,invoiceIds,'invoice');
    if(!scopeMatches(document,controls)||document.kind!=='invoice'
      ||document.role!=='standard'||document.status!=='final'
      ||document.lifecycleStatus==='voided'
      ||document.issueDate>controls.asOfDate
      ||document.adjustments.taxEnabled||document.adjustments.discountEnabled
      ||document.adjustments.shippingEnabled||document.adjustments.otherChargesEnabled
      ||document.items.some(line=>line.stockTreatment!=='tracked'))
      fail('Only active, fully tracked final same-currency invoices without additional financial adjustments are supported.');
    invoices.push(document);
  }
  let invoiced=0n,customerCollected=0n,receivable=0n;
  const paymentIds=new Set<string>(),invoiceMap=new Map(invoices.map(x=>[x.id,x]));
  for(const payment of customers){
    uniqueId(payment.id,paymentIds,'customer payment');
    if(!scopeMatches(payment,controls)||payment.date>controls.asOfDate
      ||!invoiceMap.has(payment.invoiceId))
      fail('Customer payment has an unknown, cross-scope or future invoice source.');
    const invoice=invoiceMap.get(payment.invoiceId)!;
    if(payment.date<invoice.issueDate)
      fail('Customer receipt predates its issued invoice.');
    cents(payment.amount);
  }
  for(const invoice of invoices){
    assertInvoicePaymentInvariant(invoice,[...customers],[...documents]);
    const summary=invoicePaymentSummary(invoice,[...customers],controls.asOfDate,[...documents]);
    if(cents(summary.credits)!==0n
      ||cents(summary.total)!==cents(calculateTotals(invoice.items,invoice.adjustments).grandTotal))
      fail('Unsupported invoice credit note or changed sale amount.');
    invoiced+=cents(summary.total);
    customerCollected+=cents(summary.paid);
    receivable+=cents(summary.remaining);
  }
  if(invoiced-customerCollected!==receivable)
    fail('Invoice gross total does not conserve recorded customer payments and AR.');
  const receivables=receivablesByCurrency([...invoices],[...customers],controls.asOfDate);
  if(receivables.length!==1||receivables[0]?.currency!==controls.functionalCurrency
    ||cents(receivables[0].billed)!==invoiced
    ||cents(receivables[0].paid)!==customerCollected
    ||cents(receivables[0].outstanding)!==receivable)
    fail('Customer receivables report does not agree with sourced invoices and receipts.');
  let supplierPurchased=0n,supplierPaid=0n,supplierPayable=0n;
  const purchaseMap=new Map(purchases.map(p=>[p.id,p]));
  const supplierPaymentIds=new Set<string>();
  for(const payment of supplierPayments){
    uniqueId(payment.id,supplierPaymentIds,'supplier payment');
    if(!scopeMatches(payment,controls)||payment.date>controls.asOfDate
      ||payment.voidedAt||!purchaseMap.has(payment.purchaseId))
      fail('Unsupported or unmatched active supplier payment.');
    cents(payment.amount);
  }
  for(const purchase of purchases){
    if(!scopeMatches(purchase,controls)||purchase.status!=='posted'
      ||purchase.date>controls.asOfDate)
      fail('Only active posted same-currency purchases are supported.');
    const summary=purchasePayableSummary(purchase,[...supplierPayments],controls.asOfDate);
    if(cents(summary.total)!==cents(purchaseTotals(purchase).landedTotal))
      fail('Original supplier payable does not match purchase source.');
    supplierPurchased+=cents(summary.total);
    supplierPaid+=cents(summary.paid);
    supplierPayable+=cents(summary.remaining);
  }
  if(supplierPurchased-supplierPaid!==supplierPayable)
    fail('Supplier purchases and settlements do not conserve accounts payable.');
  const payables=supplierPayablesByCurrency([...purchases],[...supplierPayments],controls.asOfDate);
  if(payables.length!==1||payables[0]?.currency!==controls.functionalCurrency
    ||cents(payables[0].purchases)!==supplierPurchased
    ||cents(payables[0].paid)!==supplierPaid
    ||cents(payables[0].remaining)!==supplierPayable)
    fail('Supplier payables report does not agree with posted sources.');
  const bankEntryIds=new Set<string>(),linkedCustomer=new Set<string>(),
    linkedSupplier=new Set<string>();
  let bankOpening=0n,collectedBank=0n,paidBank=0n,openingCount=0;
  for(const entry of entries){
    uniqueId(entry.id,bankEntryIds,'bank entry');
    if(!scopeMatches(entry,controls)||entry.date>controls.asOfDate||entry.voidedAt
      ||validateTreasuryEntry(entry,[bank]).length)
      fail('Invalid, cross-scope, future, cancelled or unsupported bank entry.');
    const value=cents(entry.amount);
    if(entry.type==='opening-balance'){
      if(entry.toAccountId!==bank.id||entry.fromAccountId||entry.sourceType!=='manual')
        fail('Only a positive in-bank source opening is supported.');
      openingCount++;bankOpening+=value;
    }else if(entry.type==='collection'){
      const payment=customers.find(row=>row.id===entry.sourceId);
      if(!payment||linkedCustomer.has(entry.sourceId)
        ||entry.toAccountId!==bank.id||entry.fromAccountId
        ||entry.date<payment.date||value!==cents(payment.amount))
        fail('Customer receipt must be uniquely allocated at its exact bank amount.');
      linkedCustomer.add(entry.sourceId);collectedBank+=value;
    }else if(entry.type==='supplier-payment'){
      const payment=supplierPayments.find(row=>row.id===entry.sourceId);
      if(!payment||linkedSupplier.has(entry.sourceId)
        ||entry.fromAccountId!==bank.id||entry.toAccountId
        ||entry.date<payment.date||value!==cents(payment.amount))
        fail('Supplier payment must be uniquely allocated at its exact bank amount.');
      linkedSupplier.add(entry.sourceId);paidBank+=value;
    }else fail('Non-payment transfers, deposits, expenses and reconciliations require another policy.');
  }
  if(openingCount!==1||linkedCustomer.size!==customers.length
    ||linkedSupplier.size!==supplierPayments.length
    ||collectedBank!==customerCollected||paidBank!==supplierPaid)
    fail('Opening, collected receipts and supplier bank allocations must be complete.');
  const bankBalance=bankOpening+collectedBank-paidBank;
  if(bankBalance<0n||cents(treasuryAccountBalance(bank.id,[...entries],controls.asOfDate))!==bankBalance)
    fail('Bank balance does not reconcile with the complete linked treasury ledger.');
  // Recompute a candidate trial balance from the independent source totals.
  // Bank opening offset is illustrative and must NEVER be treated as an
  // approved owner's equity / opening entry in real books.
  const nets=new Map(accountIds.map(id=>[id,0n]));
  const dr=(id:string,v:bigint)=>nets.set(id,nets.get(id)!+v);
  const cr=(id:string,v:bigint)=>nets.set(id,nets.get(id)!-v);
  dr(controls.inventoryAssetAccountId,supplierPurchased);
  cr(controls.supplierPayableAccountId,supplierPurchased);
  dr(controls.salesCogsAccountId,cents(stock.calculatedSalesCost));
  cr(controls.inventoryAssetAccountId,cents(stock.calculatedSalesCost));
  dr(accounts.customerReceivable,invoiced);
  cr(accounts.salesRevenue,invoiced);
  dr(accounts.bankAsset,bankOpening);
  cr(accounts.openingOffset,bankOpening);
  dr(accounts.bankAsset,collectedBank);
  cr(accounts.customerReceivable,collectedBank);
  dr(controls.supplierPayableAccountId,paidBank);
  cr(accounts.bankAsset,paidBank);
  if(nets.get(controls.inventoryAssetAccountId)!==cents(stock.calculatedGrossInventory)
    ||nets.get(controls.salesCogsAccountId)!==cents(stock.calculatedSalesCost)
    ||-(nets.get(controls.supplierPayableAccountId)??0n)!==supplierPayable
    ||nets.get(accounts.customerReceivable)!==receivable
    ||nets.get(accounts.bankAsset)!==bankBalance
    ||-(nets.get(accounts.salesRevenue)??0n)!==invoiced)
    fail('Source-based control accounts differ from purchase, stock, AR, AP or bank.');
  let debit=0n,credit=0n;
  const trialBalance=[...nets].sort(([a],[b])=>a.localeCompare(b)).map(([accountId,value])=>{
    const drValue=value>0n?value:0n,crValue=value<0n?-value:0n;
    debit+=drValue;credit+=crValue;
    return{accountId,debitBalance:amount(drValue),creditBalance:amount(crValue)};
  });
  if(debit!==credit)fail('Recomputed candidate trial balance does not balance.');
  return{
    stock,inventory:amount(cents(stock.calculatedGrossInventory)),
    costOfGoodsSold:amount(cents(stock.calculatedSalesCost)),
    invoiced:amount(invoiced),customerCollected:amount(customerCollected),
    receivable:amount(receivable),supplierPurchased:amount(supplierPurchased),
    supplierPaid:amount(supplierPaid),supplierPayable:amount(supplierPayable),
    bankOpening:amount(bankOpening),bankBalance:amount(bankBalance),
    trialBalance,totalDebits:amount(debit),totalCredits:amount(credit),
    sourceAuthenticated:false,openingApproved:false,completeChartApproved:false,
    actualJournalPosted:false,periodAuthorityVerified:false,productionReady:false
  };
}

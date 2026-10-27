import type {LourexDocument,InventoryMovementRecord} from '../types.js';
import {decimalToScaled,normalizeDecimalInput} from './money.js';
import {
  projectPostedValuationEvidence,type PostedValuationEvidence
} from './inventory-valuation-evidence.js';

/**
 * Alif 22: read-only, SOURCE-SCOPED COGS reconciliation.
 * Does not claim full general-ledger reconciliation. The product currently has
 * no fully posted inventory/COGS GL journal or approved functional-currency
 * cutover. Actual financial acceptance must therefore always remain blocked.
 */
export interface InvoiceCostDifference {
  issueMovementId:string;
  invoiceId:string;
  invoiceNumber:string;
  invoiceLineId:string;
  quantity:string;
  currency:string;
  frozenInvoiceLineCost:string;
  roundedMovingAverageCost:string;
  /** Positive means the existing invoice cost exceeds expected stock COGS. */
  invoiceCostOverValuation:string;
}
export interface ScopedStockProfitReconciliation {
  scope:PostedValuationEvidence['scope'];
  balanceQuantity:string;
  balanceValue:string;
  totalFrozenInvoiceCost:string;
  totalRoundedMovingAverageCost:string;
  totalInvoiceCostOverValuation:string;
  lineDifferences:InvoiceCostDifference[];
  /** Never infer posted journals, balances or opening inventory from reports. */
  acceptance:'BLOCKED_NO_GENERAL_LEDGER_AND_COST_CUTOVER';
  accountingJournalVerified:false;
  historicalDocumentsChanged:false;
}
function fail(reason:string):never{
  throw new Error('ALIF_22_GL_RECONCILIATION_NOT_READY: '+reason);
}
const COST_TO_CENTS=10_000_000_000n;
const LINE_TO_CENTS=100_000_000_000_000n;
function roundDiv(value:bigint,denom:bigint):bigint{
  const sign=value<0n?-1n:1n,abs=value<0n?-value:value;
  return sign*((abs+denom/2n)/denom);
}
function fixedCents(value:bigint):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value;
  return sign+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0');
}
function checkedCost(value:string):bigint{
  const normalized=normalizeDecimalInput(value);
  if(!/^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/.test(normalized))
    fail('Frozen issued invoice line is missing an exact supported unit cost.');
  return decimalToScaled(normalized,12);
}
function findUniqueInvoice(issues:readonly LourexDocument[],id:string):LourexDocument{
  const matches=issues.filter(document=>document.id===id);
  if(matches.length!==1)fail('Final invoice document source is missing or duplicated.');
  return matches[0]!;
}
function findUniqueIssue(movements:readonly InventoryMovementRecord[],id:string):InventoryMovementRecord{
  const matches=movements.filter(movement=>movement.id===id);
  if(matches.length!==1)fail('Issue stock evidence is missing or duplicated.');
  return matches[0]!;
}

/**
 * Requires an exact complete chronological valuation supplied to the
 * independent posted-ledger projector. Reports differences, not an adjustment
 * entry and not an approved closing balance.
 */
export function reconcilePostedInvoiceCostsToWac(
  evidence:PostedValuationEvidence
):ScopedStockProfitReconciliation{
  const projected=projectPostedValuationEvidence(evidence);
  const currency=projected.currency;
  const issueSteps=projected.steps.filter(step=>step.kind==='issue');
  const diffs:InvoiceCostDifference[]=[];
  let frozenCents=0n,wacCents=0n;
  for(const step of issueSteps){
    const movement=findUniqueIssue(evidence.movements,step.id);
    const invoice=findUniqueInvoice(evidence.documents,movement.sourceId);
    if(invoice.currency.trim().toUpperCase()!==currency)
      fail('Invoice presentation currency is not the approved functional currency; FX conversion is missing.');
    const expectedPrefix='sales-invoice-stock:'+invoice.id+':';
    if(!step.id.startsWith(expectedPrefix))
      fail('Unrecognized invoice cost issue identity.');
    const lineId=step.id.slice(expectedPrefix.length);
    const matches=invoice.items.filter(item=>item.id===lineId
      &&item.savedItemId===evidence.scope.itemId);
    if(matches.length!==1)fail('Frozen invoice issue line cannot be identified uniquely.');
    const line=matches[0]!;
    if(!line.quantity.trim())fail('Final invoice quantity is missing.');
    const quantity=decimalToScaled(line.quantity,4);
    if(quantity<=0n||quantity!==decimalToScaled(step.quantity,4))
      fail('Final invoice quantity differs from valued physical movement.');
    const frozen=roundDiv(quantity*checkedCost(line.unitCost),LINE_TO_CENTS);
    const book=roundDiv(decimalToScaled(step.costOfGoodsSold,12),COST_TO_CENTS);
    if(book<0n)fail('A sale cannot generate negative inventory cost.');
    frozenCents+=frozen;
    wacCents+=book;
    diffs.push({
      issueMovementId:step.id,invoiceId:invoice.id,
      invoiceNumber:invoice.number,invoiceLineId:lineId,
      quantity:step.quantity,currency,
      frozenInvoiceLineCost:fixedCents(frozen),
      roundedMovingAverageCost:fixedCents(book),
      invoiceCostOverValuation:fixedCents(frozen-book)
    });
  }
  if(diffs.length!==issueSteps.length)
    fail('Issue valuation is incomplete.');
  return {
    scope:{...evidence.scope},
    balanceQuantity:projected.balanceQuantity,
    balanceValue:projected.balanceValue,
    totalFrozenInvoiceCost:fixedCents(frozenCents),
    totalRoundedMovingAverageCost:fixedCents(wacCents),
    totalInvoiceCostOverValuation:fixedCents(frozenCents-wacCents),
    lineDifferences:diffs,
    acceptance:'BLOCKED_NO_GENERAL_LEDGER_AND_COST_CUTOVER',
    accountingJournalVerified:false,
    historicalDocumentsChanged:false
  };
}
